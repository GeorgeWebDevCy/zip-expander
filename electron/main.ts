import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { APP_NAME } from "../src/shared/constants";
import type { PasswordRequest, QueueEvent, QueueJobInput } from "../src/shared/types";
import { QueueManager } from "./queue-manager";

let mainWindow: BrowserWindow | null = null;

const pendingPasswordRequests = new Map<string, (password: string | null) => void>();

const resolveIconPath = (): string => {
  const root = app.isPackaged ? process.resourcesPath : process.cwd();
  return path.join(root, "assets", "brand", "icon.ico");
};

const sendQueueEvent = (event: QueueEvent): void => {
  mainWindow?.webContents.send("queue:event", event);
};

const requestPassword = async (
  request: Omit<PasswordRequest, "requestId">
): Promise<string | null> => {
  if (!mainWindow) {
    return null;
  }

  const requestId = randomUUID();
  const payload: PasswordRequest = {
    ...request,
    requestId
  };

  mainWindow.webContents.send("password:request", payload);

  return new Promise<string | null>((resolve) => {
    pendingPasswordRequests.set(requestId, resolve);
  });
};

const queueManager = new QueueManager({
  onEvent: sendQueueEvent,
  requestPassword
});

const createMainWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: "#111017",
    icon: resolveIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === "development" && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  const indexPath = path.join(process.cwd(), "out", "index.html");
  await mainWindow.loadFile(indexPath);
};

const registerIpc = (): void => {
  ipcMain.handle("dialog:pickZip", async () => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select ZIP file",
      properties: ["openFile"],
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("dialog:pickDestination", async () => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select destination folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("queue:add", async (_event, input: QueueJobInput) => queueManager.add(input));
  ipcMain.handle("queue:remove", async (_event, id: string) => queueManager.remove(id));
  ipcMain.handle("queue:list", async () => queueManager.list());
  ipcMain.handle("queue:start", async () => queueManager.start());
  ipcMain.handle("queue:cancel", async () => queueManager.cancel());

  ipcMain.handle(
    "password:submit",
    async (_event, payload: { requestId: string; password: string }) => {
      const resolver = pendingPasswordRequests.get(payload.requestId);
      if (resolver) {
        pendingPasswordRequests.delete(payload.requestId);
        resolver(payload.password);
      }
    }
  );

  ipcMain.handle("password:cancel", async (_event, requestId: string) => {
    const resolver = pendingPasswordRequests.get(requestId);
    if (resolver) {
      pendingPasswordRequests.delete(requestId);
      resolver(null);
    }
  });
};

app.whenReady().then(async () => {
  registerIpc();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const resolver of pendingPasswordRequests.values()) {
    resolver(null);
  }
  pendingPasswordRequests.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

