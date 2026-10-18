import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { DocumentSnapshot } from "firebase-admin/firestore";

/**
 * Daily usage accounting.
 *
 * This is the ONLY data this project writes server-side. A quota document holds
 * exactly two fields — a count and a timestamp — and nothing else, ever.
 * `assertQuotaShape()` enforces that at the last moment before every write.
 *
 * That check is not belt-and-braces: the Admin SDK bypasses Firestore Security
 * Rules, so `firestore.rules` cannot protect the server write path. This
 * function is the real enforcement of "no personal data on our server".
 */

const COLLECTION = "quotas";

/** Per-user daily limit — the product requirement. */
export const DAILY_LIMIT_PER_USER = 100;

/**
 * Project-wide daily ceiling. Anonymous uids are resettable (clear site data or
 * open a private window and you get a fresh allowance), so the per-user limit
 * cannot be the only guard. This one is about billing, not fairness: it bounds
 * the worst case regardless of how many uids are minted.
 */
export const DAILY_LIMIT_GLOBAL = 2000;

export class QuotaExceededError extends Error {
  constructor(public readonly code: "daily-user-limit" | "daily-global-limit") {
    super(code);
    this.name = "QuotaExceededError";
  }
}

/**
 * Date key in **KST**, not UTC.
 *
 * Users are in Korea, so the allowance has to reset at Korean midnight. Using
 * UTC would reset at 09:00 local time, mid-morning. Korea has no DST, so a
 * fixed +9h offset is exact.
 */
export function kstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Rejects any quota document carrying a field other than `count`/`updatedAt`.
 *
 * Throws on violation rather than stripping, so a coding mistake that routes
 * card data here fails the request loudly instead of silently persisting it.
 * The thrown message names offending *keys* only — never their values.
 */
export function assertQuotaShape(data: Record<string, unknown>): void {
  const allowed = new Set(["count", "updatedAt"]);
  const forbidden = Object.keys(data).filter((key) => !allowed.has(key));
  if (forbidden.length > 0) {
    throw new Error(
      `assertQuotaShape: forbidden field(s) in quota document: ${forbidden.join(", ")}`,
    );
  }
  if (typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 0) {
    throw new Error("assertQuotaShape: count must be a non-negative integer");
  }
  if (!(data.updatedAt instanceof Timestamp)) {
    throw new Error("assertQuotaShape: updatedAt must be a Timestamp");
  }
}

function readCount(snap: DocumentSnapshot): number {
  if (!snap.exists) return 0;
  const value = snap.get("count");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildQuotaDoc(count: number): { count: number; updatedAt: Timestamp } {
  const doc = { count, updatedAt: Timestamp.now() };
  assertQuotaShape(doc);
  return doc;
}

export interface Reservation {
  remaining: number;
  dateKey: string;
}

/**
 * Atomically claims one unit of the caller's daily allowance.
 *
 * Reserve-then-refund rather than check-then-charge: a transaction that reads
 * and increments in one step cannot be raced, so ten concurrent calls move the
 * counter by exactly ten and the limit can never be overshot. A failed
 * recognition is refunded by `refundQuota()`. If the process dies between the
 * two, the user loses one credit — the design fails closed, toward the limit,
 * never toward an unbounded bill.
 */
export async function reserveQuota(uid: string): Promise<Reservation> {
  const db = getFirestore();
  const dateKey = kstDateKey();
  const userRef = db.collection(COLLECTION).doc(`${uid}_${dateKey}`);
  const globalRef = db.collection(COLLECTION).doc(`_global_${dateKey}`);

  return db.runTransaction(async (tx) => {
    const [userSnap, globalSnap] = await tx.getAll(userRef, globalRef);
    const userCount = readCount(userSnap);
    const globalCount = readCount(globalSnap);

    if (userCount >= DAILY_LIMIT_PER_USER) {
      throw new QuotaExceededError("daily-user-limit");
    }
    if (globalCount >= DAILY_LIMIT_GLOBAL) {
      throw new QuotaExceededError("daily-global-limit");
    }

    tx.set(userRef, buildQuotaDoc(userCount + 1));
    tx.set(globalRef, buildQuotaDoc(globalCount + 1));

    return { remaining: DAILY_LIMIT_PER_USER - (userCount + 1), dateKey };
  });
}

/**
 * Returns a reserved unit after a failed recognition, so a model error or a
 * blurry photo does not consume the user's allowance. Floors at zero and never
 * throws — a failed refund must not mask the original error.
 */
export async function refundQuota(uid: string, dateKey: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.collection(COLLECTION).doc(`${uid}_${dateKey}`);
  const globalRef = db.collection(COLLECTION).doc(`_global_${dateKey}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, globalSnap] = await tx.getAll(userRef, globalRef);
    tx.set(userRef, buildQuotaDoc(Math.max(0, readCount(userSnap) - 1)));
    tx.set(globalRef, buildQuotaDoc(Math.max(0, readCount(globalSnap) - 1)));
  });
}
