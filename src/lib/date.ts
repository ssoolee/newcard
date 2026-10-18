/**
 * Date key in KST, matching `functions/src/quota.ts` exactly.
 *
 * The client uses this only to read its own counter document for the
 * remaining-quota display. The server computes its own key and never trusts
 * this one. Korea has no DST, so a fixed +9h offset is exact.
 */
export function kstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
