import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_LIMITS, MAX_PASSWORD_ATTEMPTS } from "../src/shared/constants";
import type { ExtractionLimits, ExtractionReport, JobRunResult, SkippedEntry } from "../src/shared/types";
import { getUniqueDestinationPath, isZipFile, toIsoSafeTimestamp } from "./extraction-utils";
import { extractArchive, isEncryptedArchive, isPasswordError } from "./seven-zip";

export interface ProgressUpdate {
  extractedCount: number;
  renamedCount: number;
  nestedZipCount: number;
  message: string;
}

export interface ExtractionJobOptions {
  jobId: string;
  zipPath: string;
  destinationPath: string;
  signal?: AbortSignal;
  limits?: ExtractionLimits;
  onProgress?: (update: ProgressUpdate) => void;
  requestPassword: (input: {
    jobId: string;
    archivePath: string;
    attempt: number;
  }) => Promise<string | null>;
}

class LimitError extends Error {}

export class ExtractionFailure extends Error {
  readonly report: ExtractionReport;
  readonly reportPath: string;
  readonly cancelled: boolean;

  constructor(message: string, report: ExtractionReport, reportPath: string, cancelled: boolean) {
    super(message);
    this.name = "ExtractionFailure";
    this.report = report;
    this.reportPath = reportPath;
    this.cancelled = cancelled;
  }
}

interface RuntimeState {
  extractedCount: number;
  renamedCount: number;
  nestedZipCount: number;
  totalExtractedBytes: number;
  skipped: SkippedEntry[];
  errors: string[];
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error("Extraction cancelled.");
  }
};

const createLimitError = (message: string): LimitError => {
  const error = new LimitError(message);
  error.name = "LimitError";
  return error;
};

const ensureWithinLimits = (
  limits: ExtractionLimits,
  runtime: RuntimeState,
  nextFileBytes: number
): void => {
  if (runtime.extractedCount + 1 > limits.maxFiles) {
    throw createLimitError(`File count exceeds limit (${limits.maxFiles}).`);
  }

  if (runtime.totalExtractedBytes + nextFileBytes > limits.maxTotalBytes) {
    throw createLimitError(
      `Extracted data exceeds limit (${limits.maxTotalBytes} bytes).`
    );
  }

  if (nextFileBytes > limits.maxSingleFileBytes) {
    throw createLimitError(`File exceeds single-file limit (${limits.maxSingleFileBytes} bytes).`);
  }
};

const writeReport = async (
  destinationPath: string,
  report: ExtractionReport
): Promise<string> => {
  await fs.mkdir(destinationPath, { recursive: true });
  const reportPath = path.join(
    destinationPath,
    `extraction-report-${toIsoSafeTimestamp(new Date())}.json`
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
};

export const runExtractionJob = async (options: ExtractionJobOptions): Promise<JobRunResult> => {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const runtime: RuntimeState = {
    extractedCount: 0,
    renamedCount: 0,
    nestedZipCount: 0,
    totalExtractedBytes: 0,
    skipped: [],
    errors: []
  };

  const startedAtDate = new Date();
  const workspaceRoot = path.join(os.tmpdir(), `zip-expander-${options.jobId}-${randomUUID()}`);
  let jobPassword: string | null = null;
  let passwordPromptCount = 0;

  const notifyProgress = (message: string): void => {
    options.onProgress?.({
      extractedCount: runtime.extractedCount,
      renamedCount: runtime.renamedCount,
      nestedZipCount: runtime.nestedZipCount,
      message
    });
  };

  const requestPassword = async (archivePath: string): Promise<string> => {
    if (passwordPromptCount >= MAX_PASSWORD_ATTEMPTS) {
      throw new Error(`Password attempts exceeded (${MAX_PASSWORD_ATTEMPTS}).`);
    }

    passwordPromptCount += 1;
    const password = await options.requestPassword({
      jobId: options.jobId,
      archivePath,
      attempt: passwordPromptCount
    });

    if (!password) {
      throw new Error("Password prompt cancelled.");
    }

    jobPassword = password;
    return password;
  };

  const processDirectory = async (
    directoryPath: string,
    depth: number,
    processArchiveFn: (archivePath: string, archiveDepth: number) => Promise<void>
  ): Promise<void> => {
    throwIfAborted(options.signal);
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      throwIfAborted(options.signal);
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isSymbolicLink()) {
        runtime.skipped.push({
          path: fullPath,
          reason: "Symlink entry skipped for safety."
        });
        continue;
      }

      if (entry.isDirectory()) {
        await processDirectory(fullPath, depth, processArchiveFn);
        continue;
      }

      if (!entry.isFile()) {
        runtime.skipped.push({
          path: fullPath,
          reason: "Unsupported entry type."
        });
        continue;
      }

      const stat = await fs.stat(fullPath);

      if (isZipFile(entry.name)) {
        runtime.nestedZipCount += 1;
        notifyProgress(`Processing nested archive: ${entry.name}`);
        await processArchiveFn(fullPath, depth + 1);
        continue;
      }

      ensureWithinLimits(limits, runtime, stat.size);
      const destination = await getUniqueDestinationPath(options.destinationPath, path.basename(entry.name));
      await fs.copyFile(fullPath, destination.filePath);

      runtime.extractedCount += 1;
      runtime.totalExtractedBytes += stat.size;

      if (destination.renamed) {
        runtime.renamedCount += 1;
      }

      notifyProgress(`Extracted: ${path.basename(destination.filePath)}`);
    }
  };

  const processArchive = async (archivePath: string, depth: number): Promise<void> => {
    throwIfAborted(options.signal);

    if (depth > limits.maxDepth) {
      throw createLimitError(`Archive depth exceeded limit (${limits.maxDepth}).`);
    }

    const extractionTarget = path.join(workspaceRoot, `d-${depth}-${randomUUID()}`);
    await fs.mkdir(extractionTarget, { recursive: true });

    const encrypted = await isEncryptedArchive(archivePath, options.signal);
    let password = encrypted ? jobPassword : null;

    if (encrypted && !password) {
      password = await requestPassword(archivePath);
    }

    // Retry extraction only for wrong-password style failures.
    while (true) {
      throwIfAborted(options.signal);
      const result = await extractArchive(archivePath, extractionTarget, password, options.signal);

      if (result.code === 0) {
        break;
      }

      if (encrypted && isPasswordError(result.output)) {
        password = await requestPassword(archivePath);
        continue;
      }

      throw new Error(result.output || `7-Zip extraction failed with exit code ${result.code}.`);
    }

    await processDirectory(extractionTarget, depth, processArchive);
  };

  let status: ExtractionReport["status"] = "completed";
  let cancelled = false;

  try {
    await fs.mkdir(options.destinationPath, { recursive: true });
    await fs.mkdir(workspaceRoot, { recursive: true });
    notifyProgress("Starting extraction.");
    await processArchive(options.zipPath, 0);
    notifyProgress("Extraction complete.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown extraction failure.";
    runtime.errors.push(message);

    cancelled = Boolean(options.signal?.aborted);
    status = cancelled ? "cancelled" : "failed";
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }

  const finishedAtDate = new Date();
  const report: ExtractionReport = {
    jobId: options.jobId,
    zipPath: options.zipPath,
    destinationPath: options.destinationPath,
    status,
    startedAt: startedAtDate.toISOString(),
    finishedAt: finishedAtDate.toISOString(),
    durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    extractedCount: runtime.extractedCount,
    renamedCount: runtime.renamedCount,
    nestedZipCount: runtime.nestedZipCount,
    totalExtractedBytes: runtime.totalExtractedBytes,
    skipped: runtime.skipped,
    errors: runtime.errors,
    limits
  };

  const reportPath = await writeReport(options.destinationPath, report);

  if (status !== "completed") {
    const message = runtime.errors[0] ?? "Extraction failed.";
    throw new ExtractionFailure(message, report, reportPath, cancelled);
  }

  return { report, reportPath };
};
