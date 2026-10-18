import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { extractCardFromImage, GeminiError } from "./gemini";
import type { CardFields } from "./gemini";
import { normalizeCard } from "./normalize";
import { QuotaExceededError, refundQuota, reserveQuota } from "./quota";
import { hashUid, logSafe, logSafeError, logSafeWarn } from "./log";

/**
 * The one callable in this project: image in, structured card out.
 *
 * It is a strict pass-through. Nothing is written to disk, to a bucket, or to
 * Firestore apart from the daily counter, and no card content reaches a log.
 * There is deliberately no `/tmp` use: on gen2 that is an in-memory filesystem
 * that outlives a single request on a reused instance.
 *
 * One image per call, by design. The client imports many photos but processes
 * them sequentially so it can show per-card progress and so a ten-photo import
 * does not hit the model's per-minute limit. One image per call also keeps
 * quota accounting exactly 1:1 with cards, which makes the refund path on
 * failure trivial and impossible to get subtly wrong.
 */

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const geminiModel = defineString("GEMINI_MODEL", { default: "gemini-2.5-flash" });

/** Client resizes to ~1600px/q0.8, which lands well under this. */
const MAX_IMAGE_BYTES = 1_500_000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ExtractRequest {
  imageBase64?: unknown;
  mimeType?: unknown;
}

export interface ExtractResponse {
  card: CardFields;
  quotaRemaining: number;
}

/** Byte length of the decoded payload, without decoding it. */
function base64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export const extractCard = onCall<ExtractRequest, Promise<ExtractResponse>>(
  {
    region: "asia-northeast3",
    enforceAppCheck: true,
    maxInstances: 10,
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const startedAt = Date.now();

    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "로그인 세션이 필요합니다. 앱을 새로 고쳐 주세요.");
    }
    const uidHash = hashUid(uid);

    const { imageBase64, mimeType } = request.data ?? {};
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      throw new HttpsError("invalid-argument", "이미지가 전달되지 않았습니다.");
    }
    if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new HttpsError("invalid-argument", "지원하지 않는 이미지 형식입니다.");
    }
    const totalBytes = base64ByteLength(imageBase64);
    if (totalBytes > MAX_IMAGE_BYTES) {
      throw new HttpsError("invalid-argument", "이미지 용량이 너무 큽니다. 다시 촬영해 주세요.");
    }

    // Claim the allowance first so concurrent calls cannot overshoot the limit.
    let reservation;
    try {
      reservation = await reserveQuota(uid);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        logSafeWarn("quota.rejected", { uidHash, errorCode: err.code });
        throw new HttpsError(
          "resource-exhausted",
          err.code === "daily-user-limit"
            ? "오늘 사용 가능한 100건을 모두 사용했습니다. 한국 시간 자정에 초기화됩니다."
            : "현재 전체 사용량이 많아 잠시 후 다시 시도해 주세요.",
        );
      }
      logSafeError("quota.failed", { uidHash });
      throw new HttpsError("internal", "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }

    try {
      const model = geminiModel.value();
      const raw = await extractCardFromImage({
        apiKey: geminiApiKey.value(),
        model,
        imageBase64,
        mimeType,
      });
      const card = normalizeCard(raw);

      logSafe("extract.ok", {
        uidHash,
        imageCount: 1,
        totalBytes,
        durationMs: Date.now() - startedAt,
        model,
        quotaRemaining: reservation.remaining,
      });

      return { card, quotaRemaining: reservation.remaining };
    } catch (err) {
      // A failed recognition must not cost the user a credit.
      await refundQuota(uid, reservation.dateKey).catch(() => {
        // A failed refund must not mask the original failure. The user loses
        // one credit; the request still reports the real error.
        logSafeError("quota.refund-failed", { uidHash });
      });

      if (err instanceof GeminiError) {
        logSafeError("extract.model-error", {
          uidHash,
          errorCode: err.code,
          httpStatus: err.httpStatus,
          durationMs: Date.now() - startedAt,
        });
        if (err.code === "timeout" || err.httpStatus === 429 || (err.httpStatus ?? 0) >= 500) {
          throw new HttpsError("unavailable", "인식 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.");
        }
        if (err.code === "blocked") {
          throw new HttpsError("invalid-argument", "이 이미지는 처리할 수 없습니다.");
        }
        throw new HttpsError("internal", "명함을 인식하지 못했습니다. 다시 촬영해 주세요.");
      }

      logSafeError("extract.unexpected", { uidHash, durationMs: Date.now() - startedAt });
      throw new HttpsError("internal", "명함을 인식하지 못했습니다. 다시 촬영해 주세요.");
    }
  },
);
