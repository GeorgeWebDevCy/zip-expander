import { DEFAULT_LIMITS } from "../src/shared/constants";
import type {
  QueueEvent,
  QueueJobInput,
  QueueJobState
} from "../src/shared/types";
import { ExtractionFailure, runExtractionJob } from "./extractor";

interface QueueManagerOptions {
  onEvent: (event: QueueEvent) => void;
  requestPassword: (request: {
    jobId: string;
    archivePath: string;
    attempt: number;
  }) => Promise<string | null>;
}

export class QueueManager {
  private readonly jobs: QueueJobState[] = [];
  private readonly onEvent: QueueManagerOptions["onEvent"];
  private readonly requestPassword: QueueManagerOptions["requestPassword"];
  private running = false;
  private cancelling = false;
  private currentAbortController: AbortController | null = null;

  constructor(options: QueueManagerOptions) {
    this.onEvent = options.onEvent;
    this.requestPassword = options.requestPassword;
  }

  list(): QueueJobState[] {
    return this.jobs.map((job) => ({ ...job }));
  }

  add(input: QueueJobInput): QueueJobState {
    const job: QueueJobState = {
      ...input,
      status: "queued",
      progressPct: 0,
      extractedCount: 0,
      renamedCount: 0,
      nestedZipCount: 0
    };
    this.jobs.push(job);
    this.emitSnapshot();
    return { ...job };
  }

  remove(jobId: string): boolean {
    const idx = this.jobs.findIndex((job) => job.id === jobId);
    if (idx < 0) {
      return false;
    }

    const job = this.jobs[idx];
    if (job.status === "running") {
      return false;
    }

    this.jobs.splice(idx, 1);
    this.emitSnapshot();
    return true;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.cancelling = false;
    this.onEvent({ type: "queue-started" });
    this.emitSnapshot();

    try {
      for (const job of this.jobs) {
        if (job.status !== "queued") {
          continue;
        }

        if (this.cancelling) {
          break;
        }

        await this.runSingleJob(job);
      }
    } finally {
      if (this.cancelling) {
        for (const pending of this.jobs) {
          if (pending.status === "queued") {
            pending.status = "cancelled";
            pending.progressPct = 0;
            pending.finishedAt = new Date().toISOString();
            pending.message = "Cancelled before execution.";
            this.onEvent({ type: "job-updated", job: { ...pending } });
          }
        }
      }

      this.onEvent({ type: "queue-finished", cancelled: this.cancelling });
      this.running = false;
      this.cancelling = false;
      this.emitSnapshot();
    }
  }

  async cancel(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.cancelling = true;
    this.currentAbortController?.abort();
  }

  private async runSingleJob(job: QueueJobState): Promise<void> {
    const startedAt = new Date().toISOString();
    let progressSteps = 0;

    job.status = "running";
    job.startedAt = startedAt;
    job.finishedAt = undefined;
    job.error = undefined;
    job.message = "Preparing extraction...";
    job.progressPct = 1;
    this.onEvent({ type: "job-updated", job: { ...job } });

    this.currentAbortController = new AbortController();

    try {
      const result = await runExtractionJob({
        jobId: job.id,
        zipPath: job.zipPath,
        destinationPath: job.destinationPath,
        signal: this.currentAbortController.signal,
        limits: DEFAULT_LIMITS,
        requestPassword: this.requestPassword,
        onProgress: (update) => {
          progressSteps += 1;
          job.extractedCount = update.extractedCount;
          job.renamedCount = update.renamedCount;
          job.nestedZipCount = update.nestedZipCount;
          job.message = update.message;
          job.progressPct = Math.min(95, Math.max(1, progressSteps));
          this.onEvent({ type: "job-updated", job: { ...job } });
        }
      });

      job.status = "completed";
      job.progressPct = 100;
      job.finishedAt = new Date().toISOString();
      job.reportPath = result.reportPath;
      job.message = "Completed.";
      job.extractedCount = result.report.extractedCount;
      job.renamedCount = result.report.renamedCount;
      job.nestedZipCount = result.report.nestedZipCount;
      this.onEvent({ type: "job-updated", job: { ...job } });
    } catch (error) {
      if (error instanceof ExtractionFailure) {
        job.reportPath = error.reportPath;
        job.extractedCount = error.report.extractedCount;
        job.renamedCount = error.report.renamedCount;
        job.nestedZipCount = error.report.nestedZipCount;
        job.finishedAt = new Date().toISOString();
        job.progressPct = 100;

        if (this.cancelling && error.cancelled) {
          job.status = "cancelled";
          job.message = "Cancelled by user.";
        } else if (error.cancelled) {
          job.status = "cancelled";
          job.message = "Cancelled.";
        } else {
          job.status = "failed";
          job.error = error.message;
          job.message = "Failed.";
        }

        this.onEvent({ type: "job-updated", job: { ...job } });
      } else {
        const message =
          error instanceof Error ? error.message : "Unexpected queue failure.";
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.progressPct = 100;
        job.error = message;
        job.message = "Failed.";
        this.onEvent({ type: "job-updated", job: { ...job } });
      }
    } finally {
      this.currentAbortController = null;
    }
  }

  private emitSnapshot(): void {
    this.onEvent({ type: "snapshot", jobs: this.list() });
  }
}
