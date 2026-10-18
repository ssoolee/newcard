import type { CardFields, SavedCard } from "./types";

/**
 * vCard and CSV generation.
 *
 * A `.vcf` file is the only way a web app can put a contact into the phone's
 * address book. The browser Contact Picker API is read-only and absent on iOS
 * Safari, so there is no API to write a contact — the user opens the file and
 * the OS imports it.
 *
 * Everything here runs on the device. Export never touches the network, which
 * is also why there is no share-link feature: a link would mean storing
 * someone else's personal data on a server.
 */

/** vCard records are CRLF-delimited; some Android importers are strict. */
const CRLF = "\r\n";

/** vCard escaping: backslash, semicolon, comma and newlines are special. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * `010-1234-5678` → `+82-10-1234-5678`.
 *
 * Keeps the hyphen grouping on purpose. `+821012345678` dials correctly but is
 * unreadable, and the user proof-reads these numbers by eye before saving.
 * Numbers that are not national-format (service numbers like 1588-1234) are
 * left exactly as printed.
 */
function toInternational(nationalNumber: string): string {
  const trimmed = nationalNumber.trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (!trimmed.startsWith("0")) return trimmed;
  return `+82-${trimmed.slice(1)}`;
}

/**
 * Separates a dialable number from a trailing extension.
 *
 * An extension cannot go inside a vCard 3.0 `TEL` value — importers would
 * treat the digits as part of the number and the call would fail. It is kept
 * in a `NOTE` instead, so the information survives the export.
 */
function splitExtension(value: string): { number: string; extension: string } {
  const match = value.match(/^(.*?)\s*(?:내선|교환|ext\.?)\s*(\d{1,6})$/i);
  if (match) return { number: match[1].trim(), extension: match[2] };
  return { number: value.trim(), extension: "" };
}

/**
 * Builds a vCard 3.0 record.
 *
 * `N` carries the full name in the family-name slot rather than guessing a
 * split. Korean surnames are usually one syllable but not always (남궁, 선우),
 * and a wrong split shows up as a mis-sorted, oddly displayed contact. Since
 * `FN` is what phones display, keeping `N` whole is both safer and correct for
 * Korean sorting.
 *
 * Phone numbers go out in `+82` form, which survives roaming and importing on
 * other phones better than a national number with a leading zero.
 */
export function buildVCard(card: CardFields): string {
  const displayName = card.name || card.nameEn || card.company || "연락처";
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  lines.push(`N:${esc(displayName)};;;;`);
  lines.push(`FN:${esc(displayName)}`);
  if (card.nameEn && card.name && card.nameEn !== card.name) {
    lines.push(`NICKNAME:${esc(card.nameEn)}`);
  }
  if (card.company || card.department) {
    lines.push(`ORG:${esc(card.company)}${card.department ? `;${esc(card.department)}` : ""}`);
  }
  if (card.title) lines.push(`TITLE:${esc(card.title)}`);

  const notes: string[] = [];
  const addTel = (raw: string, type: string, label: string) => {
    const { number, extension } = splitExtension(raw);
    if (!number) return;
    lines.push(`TEL;TYPE=${type}:${esc(toInternational(number))}`);
    if (extension) notes.push(`${label} 내선 ${extension}`);
  };
  addTel(card.mobile, "CELL,VOICE", "휴대폰");
  addTel(card.phone, "WORK,VOICE", "전화");
  addTel(card.fax, "WORK,FAX", "팩스");

  if (card.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(card.email)}`);
  if (card.website) lines.push(`URL:${esc(card.website)}`);
  if (card.address) lines.push(`ADR;TYPE=WORK:;;${esc(card.address)};;;;`);
  if (notes.length > 0) lines.push(`NOTE:${esc(notes.join(" / "))}`);

  lines.push("END:VCARD");
  return lines.join(CRLF) + CRLF;
}

export function buildVCardBatch(cards: CardFields[]): string {
  return cards.map(buildVCard).join("");
}

/** UTF-8, no BOM — vCard 3.0 assumes UTF-8 and a BOM confuses some importers. */
export function vcardBlob(content: string): Blob {
  return new Blob([content], { type: "text/vcard;charset=utf-8" });
}

export function vcardFileName(card: CardFields): string {
  const base = (card.name || card.nameEn || card.company || "contact")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 40);
  return `${base || "contact"}.vcf`;
}

/** Triggers a download. On iOS this opens the contacts import sheet directly. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give Safari a moment to start the navigation before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function";
}

/**
 * Shares a vCard through the OS share sheet, falling back to a download.
 * Returns false when the user cancels, so the caller can stay quiet.
 */
export async function shareVCard(cards: CardFields[]): Promise<boolean> {
  const content = buildVCardBatch(cards);
  const blob = vcardBlob(content);
  const fileName = cards.length === 1 ? vcardFileName(cards[0]) : `contacts-${cards.length}.vcf`;

  if (canShareFiles()) {
    const file = new File([blob], fileName, { type: "text/vcard" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (err) {
        // AbortError means the user dismissed the sheet; anything else falls
        // back to a download.
        if (err instanceof DOMException && err.name === "AbortError") return false;
      }
    }
  }

  downloadBlob(blob, fileName);
  return true;
}

const CSV_COLUMNS: Array<[keyof SavedCard | "createdAtText", string]> = [
  ["name", "이름"],
  ["nameEn", "영문이름"],
  ["company", "회사"],
  ["department", "부서"],
  ["title", "직급"],
  ["mobile", "휴대폰"],
  ["phone", "전화"],
  ["fax", "팩스"],
  ["email", "이메일"],
  ["website", "웹사이트"],
  ["address", "주소"],
  ["note", "메모"],
  ["createdAtText", "저장일시"],
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Byte-order mark. Excel on Windows reads a UTF-8 CSV as mojibake without it —
 * the opposite of the vCard case, where a BOM breaks importers. Built from a
 * code point so the character is visible in the source.
 */
const BOM = String.fromCodePoint(0xfeff);

/** Builds CSV for bulk import into a CRM or address book. */
export function buildCsv(cards: SavedCard[]): string {
  const header = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const rows = cards.map((card) =>
    CSV_COLUMNS.map(([key]) => {
      if (key === "createdAtText") return csvCell(new Date(card.createdAt).toLocaleString("ko-KR"));
      const value = card[key as keyof SavedCard];
      return csvCell(typeof value === "string" ? value : String(value ?? ""));
    }).join(","),
  );
  return BOM + [header, ...rows].join(CRLF) + CRLF;
}

export function csvBlob(content: string): Blob {
  return new Blob([content], { type: "text/csv;charset=utf-8" });
}
