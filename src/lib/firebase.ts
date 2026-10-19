import { initializeApp } from "firebase/app";
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from "firebase/app-check";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import type { User } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { kstDateKey } from "./date";
import { DAILY_LIMIT } from "./types";
import type { CardFields } from "./types";

/**
 * Firebase wiring.
 *
 * Note what is NOT here: no Analytics, no Crashlytics, no Performance, no
 * Storage. Card data must have nowhere to leak, so the only SDKs loaded are the
 * ones the app cannot work without.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

/**
 * App Check keeps scripted callers off the function. Without it, the daily
 * limit would be worth very little: anonymous uids are cheap to mint, so bot
 * traffic is the realistic abuse path.
 *
 * reCAPTCHA Enterprise is the one third-party script this app loads. It is
 * Google's, it is required for App Check on the web, and it never receives
 * card data — but it is a third-party script, and that is disclosed in the
 * notice screen.
 */
if (import.meta.env.DEV) {
  // Lets the emulator accept calls without a real attestation. The production
  // path stays enforced, so this cannot weaken the deployed app.
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    true;
}
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

const auth = getAuth(app);
const functions = getFunctions(app, "asia-northeast3");

/**
 * Signs the user in anonymously, with no UI.
 *
 * The user never sees a login screen. A uid is needed only so the server can
 * count this device's daily usage; it is not tied to the cards, and the cards
 * are never sent to the server to be tied to it.
 */
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
          return;
        }
        signInAnonymously(auth).catch((err) => {
          unsubscribe();
          reject(err instanceof Error ? err : new Error("anonymous-sign-in-failed"));
        });
      },
      (err) => {
        unsubscribe();
        reject(err);
      },
    );
  });
}

export interface ExtractResponse {
  card: CardFields;
  quotaRemaining: number;
}

const callExtract = httpsCallable<{ imageBase64: string; mimeType: string }, ExtractResponse>(
  functions,
  "extractCard",
);

export async function extractCard(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractResponse> {
  const result = await callExtract({ imageBase64, mimeType });
  return result.data;
}

/**
 * Reads this device's remaining daily allowance.
 *
 * Deliberately a plain REST read rather than the Firestore SDK. The SDK is by
 * far the heaviest dependency this app could carry, and the only thing it did
 * here was show one number; a single GET does the same for about a kilobyte.
 * The security rules apply to REST exactly as they do to the SDK, so this
 * reads the one counter document and nothing else.
 *
 * The count also comes back on every scan, so the display stays current
 * without a live subscription. A failure is not fatal: the header falls back
 * to the full allowance, and the server remains the real enforcement point.
 */
export async function fetchRemainingQuota(uid: string): Promise<number> {
  try {
    const user = auth.currentUser;
    if (!user) return DAILY_LIMIT;
    const token = await user.getIdToken();
    const path = `quotas/${uid}_${kstDateKey()}`;
    const url =
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
      `/databases/(default)/documents/${path}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // A missing document means nothing has been used today.
    if (response.status === 404) return DAILY_LIMIT;
    if (!response.ok) return DAILY_LIMIT;
    const body: unknown = await response.json();
    // The server stores count as an integer, so integerValue is what comes
    // back. doubleValue is read too: a silently wrong "100 left" would be
    // worse than the extra line.
    const field = (
      body as { fields?: { count?: { integerValue?: string; doubleValue?: number } } }
    )?.fields?.count;
    const used = Number(field?.integerValue ?? field?.doubleValue ?? 0);
    return Math.max(0, DAILY_LIMIT - (Number.isFinite(used) ? used : 0));
  } catch {
    return DAILY_LIMIT;
  }
}
