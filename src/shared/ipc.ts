import type { PasswordRequest, QueueEvent, QueueJobInput, QueueJobState } from "./types";

export interface DesktopApi {
  pickZipFile(): Promise<string | null>;
  pickDestinationFolder(): Promise<string | null>;
  queueAdd(input: QueueJobInput): Promise<QueueJobState>;
  queueRemove(jobId: string): Promise<boolean>;
  queueList(): Promise<QueueJobState[]>;
  queueStart(): Promise<void>;
  queueCancel(): Promise<void>;
  submitPassword(payload: { requestId: string; password: string }): Promise<void>;
  cancelPassword(requestId: string): Promise<void>;
  onQueueEvent(listener: (event: QueueEvent) => void): () => void;
  onPasswordRequest(listener: (request: PasswordRequest) => void): () => void;
}

