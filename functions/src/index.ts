import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Only Firestore is initialized here, and only the `quotas` collection is ever
 * touched. `firebase-admin/storage` must never be imported anywhere in this
 * codebase — there is no bucket, and its absence is one of this project's
 * privacy controls rather than an oversight.
 */
initializeApp();

setGlobalOptions({ region: "asia-northeast3", maxInstances: 10 });

export { extractCard } from "./extractCard";
