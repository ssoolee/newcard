import type { CardFields } from "./gemini";

/**
 * Field normalization for Korean business cards.
 *
 * The model transcribes what is printed; this turns that into consistent,
 * dial-able, importable values. Everything here is a pure function on strings —
 * no I/O, no logging, so card values never leave the call stack.
 */

/**
 * Normalizes a Korean phone number to national format and keeps any extension.
 *
 * Handles the forms that actually appear on cards: `02-123-4567`,
 * `031-123-4567`, `010-1234-5678`, `+82-10-1234-5678`, `+82 (0)2 123 4567`,
 * and numbers carrying an extension. Unrecognized shapes are returned with
 * separators tidied rather than mangled — a number we cannot classify is still
 * more useful to the user than an empty field.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";

  let text = raw.trim();

  // Pull off a trailing extension before touching the digits.
  let extension = "";
  const extMatch = text.match(/(?:내선|교환|ext\.?|x)\s*[:.-]?\s*(\d{1,6})\s*$/i);
  if (extMatch && extMatch.index !== undefined) {
    extension = extMatch[1];
    text = text.slice(0, extMatch.index).trim();
  }

  let digits = text.replace(/[^\d+]/g, "");

  // International to national. `+82 (0)2` collapses to `002`, hence the
  // leading-zero squeeze afterwards.
  if (digits.startsWith("+82")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0082")) digits = `0${digits.slice(4)}`;
  digits = digits.replace(/\+/g, "").replace(/^0+/, "0");

  if (digits.length < 8) return extension ? `${text} 내선 ${extension}` : text;

  const formatted = formatKoreanNumber(digits);
  return extension ? `${formatted} 내선 ${extension}` : formatted;
}

function formatKoreanNumber(digits: string): string {
  // Seoul: a two-digit area code.
  if (digits.startsWith("02")) {
    const rest = digits.slice(2);
    if (rest.length === 7) return `02-${rest.slice(0, 3)}-${rest.slice(3)}`;
    if (rest.length === 8) return `02-${rest.slice(0, 4)}-${rest.slice(4)}`;
    return digits;
  }

  // Mobile (01x), regional (03x-06x), internet (070) and toll-free (080).
  if (/^0(1[0-9]|[3-6][0-9]|70|80)/.test(digits)) {
    const area = digits.slice(0, 3);
    const rest = digits.slice(3);
    if (rest.length === 7) return `${area}-${rest.slice(0, 3)}-${rest.slice(3)}`;
    if (rest.length === 8) return `${area}-${rest.slice(0, 4)}-${rest.slice(4)}`;
    return digits;
  }

  // Nationwide representative numbers such as 1588-1234 or 1600-1234.
  if (/^1[0-9]{3}$/.test(digits.slice(0, 4)) && digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return digits;
}

export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, "");
  // Keep it only if it is plausibly an address; a half-read address is worse
  // than none, because the user will try to send mail to it.
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(trimmed) ? trimmed : "";
}

export function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed) || /^[\w-]+(\.[\w-]+)+$/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/**
 * Zero-width spaces, the zero-width joiner and a stray BOM — OCR output
 * sometimes carries these, and they are invisible in an editor, so they are
 * built from code points here rather than pasted into the source.
 */
const ZERO_WIDTH = new RegExp(
  `[${String.fromCodePoint(0x200b)}-${String.fromCodePoint(0x200d)}${String.fromCodePoint(0xfeff)}]`,
  "g",
);

/** Collapses whitespace and strips the invisible characters above. */
export function cleanText(raw: string): string {
  return raw.replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

export function normalizeCard(card: CardFields): CardFields {
  return {
    name: cleanText(card.name),
    nameEn: cleanText(card.nameEn),
    company: cleanText(card.company),
    department: cleanText(card.department),
    title: cleanText(card.title),
    mobile: normalizePhone(card.mobile),
    phone: normalizePhone(card.phone),
    fax: normalizePhone(card.fax),
    email: normalizeEmail(card.email),
    website: normalizeWebsite(card.website),
    address: cleanText(card.address),
    confidence: card.confidence,
  };
}
