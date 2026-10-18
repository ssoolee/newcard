import { initializeApp } from "firebase/app";
import { ReCaptchaV3Provider, initializeAppCheck } from "firebase/app-check";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
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
 * reCAPTCHA v3 is the one third-party script this app loads. It is Google's,
 * it is required for App Check on the web, and it never receives card data —
 * but it is a third-party script, and that is disclosed in the notice screen.
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
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
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
 * Watches this device's remaining daily allowance.
 *
 * Reads the single counter document the security rules permit. A missing
 * document simply means nothing has been used today.
 */
export function watchRemainingQuota(
  uid: string,
  onChange: (remaining: number) => void,
): () => void {
  const ref = doc(db, "quotas", `${uid}_${kstDateKey()}`);
  return onSnapshot(
    ref,
    (snap) => {
      const used = snap.exists() ? Number(snap.get("count") ?? 0) : 0;
      onChange(Math.max(0, DAILY_LIMIT - (Number.isFinite(used) ? used : 0)));
    },
    () => {
      // A read failure must not block scanning; the server is the real
      // enforcement point, this display is a courtesy.
      onChange(DAILY_LIMIT);
    },
  );
}
