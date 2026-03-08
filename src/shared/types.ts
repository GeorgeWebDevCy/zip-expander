export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface QueueJobInput {
  id: string;
  zipPath: string;
  destinationPath: string;
}

export interface QueueJobState extends QueueJobInput {
  status: JobStatus;
  progressPct: number;
  extractedCount: number;
  renamedCount: number;
  nestedZipCount: number;
  message?: string;
  error?: string;
  reportPath?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ExtractionLimits {
  maxDepth: number;
  maxFiles: number;
  maxTotalBytes: number;
  maxSingleFileBytes: number;
}

export interface SkippedEntry {
  path: string;
  reason: string;
}

export interface ExtractionReport {
  jobId: string;
  zipPath: string;
  destinationPath: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  extractedCount: number;
  renamedCount: number;
  nestedZipCount: number;
  totalExtractedBytes: number;
  skipped: SkippedEntry[];
  errors: string[];
  limits: ExtractionLimits;
}

export type QueueEvent =
  | { type: "snapshot"; jobs: QueueJobState[] }
  | { type: "queue-started" }
  | { type: "queue-finished"; cancelled: boolean }
  | { type: "job-updated"; job: QueueJobState };

export interface PasswordRequest {
  requestId: string;
  jobId: string;
  archivePath: string;
  attempt: number;
}

export interface JobRunResult {
  report: ExtractionReport;
  reportPath: string;
}

