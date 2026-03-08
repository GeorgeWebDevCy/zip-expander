import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const KNOWN_7Z_PATHS = ["C:\\Program Files\\7-Zip\\7z.exe", "7z"];

const commandExists = async (command: string): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const child = spawn("where.exe", [command], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });

const ensure7zBinary = async (): Promise<string> => {
  for (const candidate of KNOWN_7Z_PATHS) {
    if (candidate === "7z") {
      if (await commandExists("7z")) {
        return candidate;
      }
      continue;
    }

    try {
      await fs.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "7-Zip binary not found. Install 7-Zip and ensure 7z.exe is available on PATH."
  );
};

export interface SevenZipResult {
  code: number;
  output: string;
}

export const run7z = async (
  args: string[],
  signal?: AbortSignal
): Promise<SevenZipResult> => {
  const bin = await ensure7zBinary();

  return new Promise<SevenZipResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      signal
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        output: `${stdout}\n${stderr}`.trim()
      });
    });
  });
};

export const isEncryptedArchive = async (
  archivePath: string,
  signal?: AbortSignal
): Promise<boolean> => {
  const args = ["l", "-slt", archivePath];
  const result = await run7z(args, signal);
  return /Encrypted = \+|Method = .*AES/i.test(result.output);
};

export const extractArchive = async (
  archivePath: string,
  outputDir: string,
  password: string | null,
  signal?: AbortSignal
): Promise<SevenZipResult> => {
  const args = ["x", "-y", "-bb0", "-bd", `-o${path.resolve(outputDir)}`, archivePath];
  if (password !== null) {
    args.push(`-p${password}`);
  }

  return run7z(args, signal);
};

export const isPasswordError = (output: string): boolean =>
  /Wrong password|Can not open encrypted archive|Data Error in encrypted file|Headers Error/i.test(
    output
  );
