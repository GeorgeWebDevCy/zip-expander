import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const GENERATED_DIR = path.resolve("tests/fixtures/generated");
const WORK_DIR = path.join(os.tmpdir(), `zip-expander-fixtures-${Date.now()}`);
const KNOWN_7Z = ["C:\\Program Files\\7-Zip\\7z.exe", "7z"];
const ENCRYPTED_PASSWORD = "Secret123";

const runCommand = async (cmd: string, args: string[], cwd: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed (${cmd} ${args.join(" ")}):\n${output}`));
    });
  });

const commandExists = async (command: string): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const child = spawn("where.exe", [command], { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });

const resolve7z = async (): Promise<string> => {
  for (const candidate of KNOWN_7Z) {
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

  throw new Error("7-Zip binary not found. Install 7-Zip before generating fixtures.");
};

const writeFile = async (targetPath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
};

const archiveFolder = async (
  sevenZipBin: string,
  sourceDir: string,
  outputZipPath: string,
  password?: string
) => {
  const args = ["a", "-tzip", outputZipPath, "."];
  if (password) {
    args.push(`-p${password}`, "-mem=AES256");
  }

  await runCommand(sevenZipBin, args, sourceDir);
};

const generateNestedDepth = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "nested-depth");
  await writeFile(path.join(source, "L1", "L2", "L3", "L4", "L5", "deep-file.txt"), "deep");
  await writeFile(path.join(source, "L1", "L2", "alpha.txt"), "alpha");
  await archiveFolder(sevenZipBin, source, path.join(GENERATED_DIR, "nested-depth.zip"));
};

const generateDuplicateNames = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "duplicate-names");
  await writeFile(path.join(source, "one", "report.txt"), "one");
  await writeFile(path.join(source, "two", "report.txt"), "two");
  await writeFile(path.join(source, "three", "report.txt"), "three");
  await archiveFolder(sevenZipBin, source, path.join(GENERATED_DIR, "duplicate-names.zip"));
};

const generateNestedZip = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "nested-zip");
  const nestedSource = path.join(source, "nested-archive");
  const nestedInnerSource = path.join(source, "nested-archive-2");

  await writeFile(path.join(source, "top.txt"), "top");
  await writeFile(path.join(nestedSource, "inner-a.txt"), "inner-a");
  await writeFile(path.join(nestedSource, "inner-b.txt"), "inner-b");
  await writeFile(path.join(nestedInnerSource, "inner-c.txt"), "inner-c");

  const nestedArchivePath = path.join(source, "folder", "inner.zip");
  const nestedArchivePath2 = path.join(source, "folder", "inner-2.zip");

  await fs.mkdir(path.dirname(nestedArchivePath), { recursive: true });
  await archiveFolder(sevenZipBin, nestedSource, nestedArchivePath);
  await archiveFolder(sevenZipBin, nestedInnerSource, nestedArchivePath2);
  await archiveFolder(sevenZipBin, source, path.join(GENERATED_DIR, "nested-zip.zip"));
};

const generateEncrypted = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "encrypted");
  await writeFile(path.join(source, "secrets", "password.txt"), "super-secret");
  await writeFile(path.join(source, "notes.txt"), "still visible metadata");
  await archiveFolder(
    sevenZipBin,
    source,
    path.join(GENERATED_DIR, "encrypted.zip"),
    ENCRYPTED_PASSWORD
  );
};

const generateSymlinkLike = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "symlink-entry");
  await writeFile(path.join(source, "target.txt"), "target");

  // Real symlink creation can fail without elevated privileges on some Windows setups.
  // This fixture still validates skip handling paths by including marker entry names.
  await writeFile(path.join(source, "link-placeholder.symlink"), "pretend-symlink");
  await archiveFolder(sevenZipBin, source, path.join(GENERATED_DIR, "symlink-entry.zip"));
};

const generateLimitThreshold = async (sevenZipBin: string): Promise<void> => {
  const source = path.join(WORK_DIR, "limit-threshold");
  for (let idx = 0; idx < 220; idx += 1) {
    await writeFile(path.join(source, "many", `file-${idx.toString().padStart(4, "0")}.txt`), `f-${idx}`);
  }
  await archiveFolder(sevenZipBin, source, path.join(GENERATED_DIR, "limit-threshold.zip"));
};

const writeManifest = async (): Promise<void> => {
  const manifest = {
    encryptedPassword: ENCRYPTED_PASSWORD,
    fixtures: [
      "nested-depth.zip",
      "duplicate-names.zip",
      "nested-zip.zip",
      "encrypted.zip",
      "symlink-entry.zip",
      "limit-threshold.zip"
    ]
  };

  await fs.writeFile(
    path.join(GENERATED_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
};

const main = async () => {
  await fs.rm(GENERATED_DIR, { recursive: true, force: true });
  await fs.rm(WORK_DIR, { recursive: true, force: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(WORK_DIR, { recursive: true });
  const sevenZipBin = await resolve7z();

  try {
    await generateNestedDepth(sevenZipBin);
    await generateDuplicateNames(sevenZipBin);
    await generateNestedZip(sevenZipBin);
    await generateEncrypted(sevenZipBin);
    await generateSymlinkLike(sevenZipBin);
    await generateLimitThreshold(sevenZipBin);
    await writeManifest();
  } finally {
    await fs.rm(WORK_DIR, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
