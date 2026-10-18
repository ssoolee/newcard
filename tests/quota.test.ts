/**
 * Quota accounting tests.
 *
 * These run against the Firestore emulator (see `npm run test`). They exist to
 * make two of this project's promises failable rather than merely stated:
 *
 *   - "daily 100 per user" must hold under concurrency, and
 *   - a quota document must never be able to carry card data.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";

import {
  DAILY_LIMIT_GLOBAL,
  DAILY_LIMIT_PER_USER,
  QuotaExceededError,
  assertQuotaShape,
  kstDateKey,
  refundQuota,
  reserveQuota,
} from "../functions/src/quota";

const PROJECT_ID = "newcard-quota-test";

let app: App;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set. Run via `npm run test`, which starts the emulator.",
    );
  }
  app = initializeApp({ projectId: PROJECT_ID });
});

afterAll(async () => {
  await deleteApp(app);
});

/** Wipes the counters so each test starts from a known state. */
afterEach(async () => {
  const db = getFirestore();
  const snap = await db.collection("quotas").get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
});

async function seedCount(docId: string, count: number): Promise<void> {
  await getFirestore()
    .collection("quotas")
    .doc(docId)
    .set({ count, updatedAt: Timestamp.now() });
}

async function readCount(docId: string): Promise<number> {
  const snap = await getFirestore().collection("quotas").doc(docId).get();
  return snap.exists ? (snap.get("count") as number) : 0;
}

describe("kstDateKey", () => {
  it("rolls over at Korean midnight, not UTC midnight", () => {
    // 2026-10-18 14:59:59Z is 23:59:59 KST on the 18th.
    expect(kstDateKey(new Date("2026-10-18T14:59:59Z"))).toBe("20261018");
    // One second later it is 00:00:00 KST on the 19th.
    expect(kstDateKey(new Date("2026-10-18T15:00:00Z"))).toBe("20261019");
  });

  it("does not roll over at UTC midnight", () => {
    expect(kstDateKey(new Date("2026-10-18T00:00:00Z"))).toBe("20261018");
    expect(kstDateKey(new Date("2026-10-17T23:59:59Z"))).toBe("20261018");
  });
});

describe("assertQuotaShape", () => {
  it("accepts exactly count + updatedAt", () => {
    expect(() => assertQuotaShape({ count: 1, updatedAt: Timestamp.now() })).not.toThrow();
  });

  it("throws when card data is routed into a quota document", () => {
    expect(() =>
      assertQuotaShape({ count: 1, updatedAt: Timestamp.now(), name: "홍길동" }),
    ).toThrow(/forbidden field/);
  });

  it("names the offending key but never its value", () => {
    try {
      assertQuotaShape({ count: 1, updatedAt: Timestamp.now(), mobile: "010-1234-5678" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("mobile");
      expect(message).not.toContain("010-1234-5678");
    }
  });

  it("rejects malformed counts and timestamps", () => {
    const at = Timestamp.now();
    expect(() => assertQuotaShape({ count: -1, updatedAt: at })).toThrow();
    expect(() => assertQuotaShape({ count: 1.5, updatedAt: at })).toThrow();
    expect(() => assertQuotaShape({ count: "3", updatedAt: at })).toThrow();
    expect(() => assertQuotaShape({ count: 1, updatedAt: new Date() })).toThrow();
  });
});

describe("reserveQuota — per-user limit", () => {
  const uid = "user-boundary";

  it("allows the 100th call and rejects the 101st", async () => {
    const dateKey = kstDateKey();
    await seedCount(`${uid}_${dateKey}`, DAILY_LIMIT_PER_USER - 2);

    const ninetyNinth = await reserveQuota(uid);
    expect(ninetyNinth.remaining).toBe(1);

    const hundredth = await reserveQuota(uid);
    expect(hundredth.remaining).toBe(0);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(DAILY_LIMIT_PER_USER);

    await expect(reserveQuota(uid)).rejects.toThrow(QuotaExceededError);
    // The rejected call must not have charged anything.
    expect(await readCount(`${uid}_${dateKey}`)).toBe(DAILY_LIMIT_PER_USER);
  });

  it("reports which ceiling was hit", async () => {
    const dateKey = kstDateKey();
    await seedCount(`${uid}_${dateKey}`, DAILY_LIMIT_PER_USER);
    await expect(reserveQuota(uid)).rejects.toMatchObject({ code: "daily-user-limit" });
  });

  it("counts each user separately", async () => {
    const dateKey = kstDateKey();
    await seedCount(`other-user_${dateKey}`, DAILY_LIMIT_PER_USER);
    const reservation = await reserveQuota(uid);
    expect(reservation.remaining).toBe(DAILY_LIMIT_PER_USER - 1);
  });
});

describe("reserveQuota — project ceiling", () => {
  it("rejects once the global ceiling is reached, even for a fresh uid", async () => {
    const dateKey = kstDateKey();
    await seedCount(`_global_${dateKey}`, DAILY_LIMIT_GLOBAL);
    await expect(reserveQuota("brand-new-uid")).rejects.toMatchObject({
      code: "daily-global-limit",
    });
    expect(await readCount(`brand-new-uid_${dateKey}`)).toBe(0);
  });
});

describe("reserveQuota — concurrency", () => {
  it("moves the counter by exactly 10 for 10 simultaneous calls", async () => {
    const uid = "user-concurrent";
    const dateKey = kstDateKey();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveQuota(uid)),
    );

    expect(results).toHaveLength(10);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(10);
    expect(await readCount(`_global_${dateKey}`)).toBe(10);

    // Every call must have received a distinct remaining value: if two
    // transactions had read the same count, two callers would share a number.
    const remainings = results.map((r) => r.remaining).sort((a, b) => a - b);
    expect(new Set(remainings).size).toBe(10);
    expect(remainings[0]).toBe(DAILY_LIMIT_PER_USER - 10);
  });

  it("never exceeds the limit when the last slots are contended", async () => {
    const uid = "user-last-slots";
    const dateKey = kstDateKey();
    await seedCount(`${uid}_${dateKey}`, DAILY_LIMIT_PER_USER - 3);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveQuota(uid)),
    );

    const granted = outcomes.filter((o) => o.status === "fulfilled").length;
    expect(granted).toBe(3);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(DAILY_LIMIT_PER_USER);
  });
});

describe("refundQuota", () => {
  it("leaves the counter untouched across a reserve + failed-recognition refund", async () => {
    const uid = "user-refund";
    const dateKey = kstDateKey();
    await seedCount(`${uid}_${dateKey}`, 7);

    const reservation = await reserveQuota(uid);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(8);

    await refundQuota(uid, reservation.dateKey);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(7);
    expect(await readCount(`_global_${dateKey}`)).toBe(0);
  });

  it("floors at zero instead of going negative", async () => {
    const uid = "user-underflow";
    const dateKey = kstDateKey();
    await refundQuota(uid, dateKey);
    expect(await readCount(`${uid}_${dateKey}`)).toBe(0);
  });
});
