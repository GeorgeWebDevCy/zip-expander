import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../src/shared/ipc";
import type { PasswordRequest, QueueEvent, QueueJobInput } from "../src/shared/types";

const api: DesktopApi = {
  pickZipFile: () => ipcRenderer.invoke("dialog:pickZip"),
  pickDestinationFolder: () => ipcRenderer.invoke("dialog:pickDestination"),
  queueAdd: (input: QueueJobInput) => ipcRenderer.invoke("queue:add", input),
  queueRemove: (jobId: string) => ipcRenderer.invoke("queue:remove", jobId),
  queueList: () => ipcRenderer.invoke("queue:list"),
  queueStart: () => ipcRenderer.invoke("queue:start"),
  queueCancel: () => ipcRenderer.invoke("queue:cancel"),
  submitPassword: (payload: { requestId: string; password: string }) =>
    ipcRenderer.invoke("password:submit", payload),
  cancelPassword: (requestId: string) => ipcRenderer.invoke("password:cancel", requestId),
  onQueueEvent: (listener: (event: QueueEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: QueueEvent) => listener(payload);
    ipcRenderer.on("queue:event", wrapped);
    return () => ipcRenderer.removeListener("queue:event", wrapped);
  },
  onPasswordRequest: (listener: (request: PasswordRequest) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: PasswordRequest) =>
      listener(payload);
    ipcRenderer.on("password:request", wrapped);
    return () => ipcRenderer.removeListener("password:request", wrapped);
  }
};

contextBridge.exposeInMainWorld("desktopApi", api);

