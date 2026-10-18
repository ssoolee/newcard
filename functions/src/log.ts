import { createHash } from "node:crypto";
import { logger } from "firebase-functions/v2";

/**
 * Privacy-safe logging.
 *
 * Business-card data belongs to third parties and must never be stored on our
 * server. Cloud Logging IS storage: anything written here is retained for weeks
 * and is readable by anyone with project access. A single stray log of a model
 * response would put names, phone numbers and email addresses there.
 *
 * So this module is the ONLY logging path in the codebase, and it accepts only
 * a fixed set of non-personal, numeric-or-opaque fields. Direct `console.*` is
 * a build error (ESLint `no-console`), which makes the unsafe path unavailable
 * rather than merely discouraged.
 *
 * Adding a field here is a privacy decision. Do not add anything that could
 * carry card content, image bytes, filenames, prompts or model output.
 */

/** The complete set of fields that may ever reach Cloud Logging. */
export interface SafeLogFields {
  /** Salted, truncated hash of the caller's uid — correlatable, not identifying. */
  uidHash?: string;
  /** How many images the request carried. */
  imageCount?: number;
  /** Total request payload size in bytes. */
  totalBytes?: number;
  /** Wall-clock duration of the operation. */
  durationMs?: number;
  /** Short machine code, e.g. "quota-exceeded" or "model-INVALID_ARGUMENT". */
  errorCode?: string;
  /** Model identifier, e.g. "gemini-3.8-flash". */
  model?: string;
  /** Remaining daily allowance after this call. */
  quotaRemaining?: number;
  /** Upstream HTTP status, when relevant. */
  httpStatus?: number;
}

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "uidHash",
  "imageCount",
  "totalBytes",
  "durationMs",
  "errorCode",
  "model",
  "quotaRemaining",
  "httpStatus",
]);

/**
 * Drops unknown keys and hard-scrubs string values.
 *
 * Every permitted string field is a code, hash or model name, so restricting
 * them to a conservative character set and 64 characters means that even if
 * personal data is passed in by mistake it cannot survive the trip to the log.
 */
function sanitize(fields: SafeLogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(key) || value === undefined || value === null) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "string") {
      const scrubbed = value.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
      if (scrubbed.length > 0) out[key] = scrubbed;
    }
  }
  return out;
}

/**
 * Hashes a uid so logs stay correlatable without carrying the identifier that
 * links a log line to a Firebase Auth user.
 */
export function hashUid(uid: string): string {
  return createHash("sha256").update(`newcard:${uid}`).digest("hex").slice(0, 12);
}

export function logSafe(event: string, fields: SafeLogFields = {}): void {
  logger.info(event, sanitize(fields));
}

export function logSafeWarn(event: string, fields: SafeLogFields = {}): void {
  logger.warn(event, sanitize(fields));
}

/**
 * Logs a failure. Deliberately takes only a code — never an Error object, whose
 * `message` may embed a response body, and never a stack trace that could carry
 * interpolated values.
 */
export function logSafeError(event: string, fields: SafeLogFields = {}): void {
  logger.error(event, sanitize(fields));
}
