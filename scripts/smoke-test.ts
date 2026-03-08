import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runExtractionJob, ExtractionFailure } from "../electron/extractor";

interface FixtureManifest {
  encryptedPassword: string;
  fixtures: string[];
}

const FIXTURE_DIR = path.resolve("tests/fixtures/generated");
const OUTPUT_DIR = path.resolve("tests/fixtures/smoke-output");

const parseFixtureArg = (): string => {
  const arg = process.argv[2];
  if (!arg || arg.trim().length === 0) {
    return "nested-zip.zip";
  }

  return arg.trim();
};

const collectOutputTree = async (root: string): Promise<{
  files: string[];
  directories: string[];
}> => {
  const files: string[] = [];
  const directories: string[] = [];

  const walk = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relative = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        directories.push(relative);
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };

  await walk(root);
  files.sort((a, b) => a.localeCompare(b));
  directories.sort((a, b) => a.localeCompare(b));

  return { files, directories };
};

const main = async () => {
  const fixtureName = parseFixtureArg();
  const fixturePath = path.join(FIXTURE_DIR, fixtureName);
  const manifestPath = path.join(FIXTURE_DIR, "manifest.json");

  const fixtureExists = await fs
    .access(fixturePath)
    .then(() => true)
    .catch(() => false);

  if (!fixtureExists) {
    throw new Error(
      `Fixture not found: ${fixturePath}. Run "npm run fixtures:generate" first.`
    );
  }

  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw) as FixtureManifest;
  const runId = `${path.parse(fixtureName).name}-${Date.now()}`;
  const destinationPath = path.join(OUTPUT_DIR, runId);
  await fs.mkdir(destinationPath, { recursive: true });

  console.log(`Smoke test fixture: ${fixtureName}`);
  console.log(`Destination: ${destinationPath}`);

  const result = await runExtractionJob({
    jobId: `smoke-${randomUUID()}`,
    zipPath: fixturePath,
    destinationPath,
    requestPassword: async () => manifest.encryptedPassword,
    onProgress: (update) => {
      if (update.extractedCount % 25 === 0 || update.message.includes("complete")) {
        console.log(
          `[progress] extracted=${update.extractedCount} renamed=${update.renamedCount} nested=${update.nestedZipCount} :: ${update.message}`
        );
      }
    }
  });

  const outputTree = await collectOutputTree(destinationPath);
  const reportName = path.basename(result.reportPath);
  const nonReportFiles = outputTree.files.filter((file) => file !== reportName);
  const hasNestedDirectories = outputTree.directories.length > 0;

  console.log("");
  console.log("Smoke test result: SUCCESS");
  console.log(`Extracted files: ${result.report.extractedCount}`);
  console.log(`Renamed collisions: ${result.report.renamedCount}`);
  console.log(`Nested zips processed: ${result.report.nestedZipCount}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Output file count (excluding report): ${nonReportFiles.length}`);
  console.log(`Nested directories present in output root: ${hasNestedDirectories ? "YES" : "NO"}`);

  if (hasNestedDirectories) {
    console.log("Directories found:");
    for (const dir of outputTree.directories) {
      console.log(` - ${dir}`);
    }
  }
};

main().catch((error) => {
  if (error instanceof ExtractionFailure) {
    console.error("Smoke test result: FAILED (extraction failure)");
    console.error(`Status: ${error.report.status}`);
    console.error(`Message: ${error.message}`);
    console.error(`Report: ${error.reportPath}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error("Smoke test result: FAILED");
  console.error(message);
  process.exitCode = 1;
});

