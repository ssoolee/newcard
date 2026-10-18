import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * `functions/` has its own `node_modules`, so a test at the repo root and the
 * code under test in `functions/src` would otherwise load two separate copies
 * of firebase-admin — and `initializeApp()` in one is invisible to
 * `getFirestore()` in the other. Pinning every firebase-admin import to the
 * root copy keeps a single module instance, and therefore a single default app.
 */
const adminLib = resolve(HERE, "node_modules/firebase-admin/lib");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^firebase-admin$/, replacement: resolve(adminLib, "index.js") },
      { find: /^firebase-admin\/(.+)$/, replacement: resolve(adminLib, "$1/index.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The quota tests share one Firestore emulator instance and clear the
    // `quotas` collection between cases, so they must not run in parallel.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
