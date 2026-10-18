/** The fields the model extracts. Mirrors `functions/src/gemini.ts`. */
export interface CardFields {
  name: string;
  nameEn: string;
  company: string;
  department: string;
  title: string;
  mobile: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  address: string;
  confidence: number;
}

/**
 * A card as held on this device.
 *
 * This is the only durable home for card data in the entire system. There is no
 * server-side copy, by design.
 */
export interface SavedCard extends CardFields {
  id: string;
  createdAt: number;
  /** Free-text note the user adds; never sent anywhere. */
  note: string;
}

export const EMPTY_CARD: CardFields = {
  name: "",
  nameEn: "",
  company: "",
  department: "",
  title: "",
  mobile: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  address: "",
  confidence: 0,
};

export const DAILY_LIMIT = 100;

/** Per-card outcome while a batch of photos is being processed. */
export interface ScanResult {
  id: string;
  fileName: string;
  previewUrl: string;
  status: "pending" | "working" | "done" | "error";
  card?: CardFields;
  errorMessage?: string;
}
