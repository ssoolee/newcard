/**
 * Firestore Security Rules tests.
 *
 * `firestore.rules` protects only the client path — the Admin SDK used by Cloud
 * Functions bypasses rules entirely. So these tests answer one question: can a
 * client reach anything beyond its own daily counter? Every answer must be no.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));

/** A realistic 28-character Firebase anonymous uid. */
const UID = "YlfXLsjaGNh7mqaPRq7AHR7ijWU2";
const OTHER_UID = "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
const DATE = "20261018";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "newcard-rules-test",
    firestore: {
      rules: readFileSync(resolve(HERE, "..", "firestore.rules"), "utf8"),
    },
  });

  // Seed through the privileged context, which bypasses rules — the same way
  // Cloud Functions writes these counters in production.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "quotas", `${UID}_${DATE}`), { count: 17, updatedAt: new Date() });
    await setDoc(doc(db, "quotas", `${OTHER_UID}_${DATE}`), { count: 42, updatedAt: new Date() });
    await setDoc(doc(db, "quotas", `_global_${DATE}`), { count: 842, updatedAt: new Date() });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe("reading counters", () => {
  it("lets a user read their own daily counter", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertSucceeds(getDoc(doc(db, "quotas", `${UID}_${DATE}`)));
  });

  it("denies reading another user's counter", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(getDoc(doc(db, "quotas", `${OTHER_UID}_${DATE}`)));
  });

  it("denies reading the project-wide counter", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(getDoc(doc(db, "quotas", `_global_${DATE}`)));
  });

  it("denies reading the project-wide counter even from a uid sized to match it", async () => {
    // "_global_20261018" is 16 characters, so a 7-character uid satisfies the
    // length pin. The anchored pattern must still reject it.
    const db = env.authenticatedContext("uidABCD").firestore();
    await assertFails(getDoc(doc(db, "quotas", `_global_${DATE}`)));
  });

  it("denies listing the quotas collection", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(getDocs(collection(db, "quotas")));
  });

  it("denies an unauthenticated read of any counter", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "quotas", `${UID}_${DATE}`)));
  });

  it("denies ids that are not a real date key", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(getDoc(doc(db, "quotas", `${UID}_2026101`)));
    await assertFails(getDoc(doc(db, "quotas", `${UID}_abcdefgh`)));
    await assertFails(getDoc(doc(db, "quotas", UID)));
  });
});

describe("writing counters", () => {
  it("denies a user creating their own counter", async () => {
    const db = env.authenticatedContext("fresh-uid").firestore();
    await assertFails(
      setDoc(doc(db, "quotas", "fresh-uid_20261018"), { count: 0, updatedAt: new Date() }),
    );
  });

  it("denies a user resetting their own counter", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(
      setDoc(doc(db, "quotas", `${UID}_${DATE}`), { count: 0, updatedAt: new Date() }),
    );
  });

  it("denies a user deleting their counter to clear the day's usage", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(deleteDoc(doc(db, "quotas", `${UID}_${DATE}`)));
  });

  it("denies raising the project-wide ceiling", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(
      setDoc(doc(db, "quotas", `_global_${DATE}`), { count: 0, updatedAt: new Date() }),
    );
  });

  it("denies smuggling card data into a counter document", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(
      setDoc(doc(db, "quotas", `${UID}_${DATE}`), {
        count: 17,
        updatedAt: new Date(),
        name: "홍길동",
        mobile: "010-1234-5678",
      }),
    );
  });

  it("denies a subcollection under a counter", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(
      setDoc(doc(db, "quotas", `${UID}_${DATE}`, "cards", "c1"), { name: "홍길동" }),
    );
  });
});

describe("everything else is closed", () => {
  it("denies writing card data to any other collection", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(setDoc(doc(db, "cards", "c1"), { name: "홍길동" }));
    await assertFails(setDoc(doc(db, "users", UID), { name: "홍길동" }));
    await assertFails(setDoc(doc(db, "scans", "s1"), { image: "..." }));
  });

  it("denies reading any other collection", async () => {
    const db = env.authenticatedContext(UID).firestore();
    await assertFails(getDoc(doc(db, "cards", "c1")));
    await assertFails(getDocs(collection(db, "users")));
  });
});
