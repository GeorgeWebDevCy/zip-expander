import type { ExtractionLimits } from "./types";

export const APP_NAME = "Zip Expander";

export const DEFAULT_LIMITS: ExtractionLimits = {
  maxDepth: 12,
  maxFiles: 100000,
  maxTotalBytes: 20 * 1024 * 1024 * 1024,
  maxSingleFileBytes: 2 * 1024 * 1024 * 1024
};

export const MAX_PASSWORD_ATTEMPTS = 3;

