/**
 * Gemini recognition call.
 *
 * Deliberately a plain `fetch` to the REST endpoint rather than an SDK. Two
 * reasons: one less dependency in a function that handles other people's
 * personal data, and complete control over what crosses the wire and what ends
 * up inside an error object.
 *
 * PRIVACY-CRITICAL: this must stay a bare `generateContent` call. Grounding,
 * the File API, explicit context caching, the Live API and Interactions-API
 * state storage each cause Google-side retention. Avoiding all of them is what
 * lets this project say card images are not retained beyond abuse-monitoring
 * logs. Do not add any of them.
 */

const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 30_000;

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

export class GeminiError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus?: number,
  ) {
    super(code);
    this.name = "GeminiError";
  }
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "Person's name as printed, in its original script" },
    nameEn: { type: "STRING", description: "Romanized or English form of the name, if printed" },
    company: { type: "STRING", description: "Organization name" },
    department: { type: "STRING", description: "Division, team or department" },
    title: { type: "STRING", description: "Job title or rank" },
    mobile: { type: "STRING", description: "Mobile number" },
    phone: { type: "STRING", description: "Office or landline number" },
    fax: { type: "STRING", description: "Fax number" },
    email: { type: "STRING" },
    website: { type: "STRING" },
    address: { type: "STRING", description: "Postal address as printed, on one line" },
    confidence: {
      type: "NUMBER",
      description: "0 to 1: how legible the card was and how sure you are of the fields",
    },
  },
  required: [
    "name",
    "nameEn",
    "company",
    "department",
    "title",
    "mobile",
    "phone",
    "fax",
    "email",
    "website",
    "address",
    "confidence",
  ],
} as const;

const PROMPT = [
  "Read this business card photo and return its contents as JSON.",
  "",
  "Rules:",
  "- Transcribe only what is actually printed on the card. Never infer, complete or invent a value.",
  "- If a field is absent, unreadable or you are unsure, return an empty string for it.",
  "  A blank field is always better than a plausible guess: the user will not notice a wrong digit.",
  "- Phone numbers: distinguish them by their printed labels. Mobile is labelled",
  "  'M', 'HP', 'Mobile', 'Cell' or the Korean for mobile; the office line is 'T', 'Tel',",
  "  'Phone' or the Korean for representative number; fax is 'F' or 'Fax'.",
  "  If exactly one unlabelled number is present, judge by its prefix: Korean mobile",
  "  numbers begin 010/011/016/017/018/019. Keep digits exactly as printed.",
  "- Keep Korean text in Korean. If a romanized or English form of the name is also",
  "  printed, put it in nameEn; otherwise leave nameEn empty rather than transliterating.",
  "- Split a combined line such as a division followed by a rank into department and title.",
  "- Ignore slogans, logos and decorative text. Text inside a logo is not necessarily the",
  "  company name.",
  "- If the image is not a business card, return empty strings and a confidence of 0.",
].join("\n");

export interface ExtractOptions {
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
}

/**
 * Sends one card image to Gemini and returns the structured fields.
 *
 * Throws `GeminiError` with a short machine code. Response bodies are never
 * attached to the error: an upstream message could echo part of the request,
 * and the error eventually reaches a log.
 */
export async function extractCardFromImage(opts: ExtractOptions): Promise<CardFields> {
  const url = `${ENDPOINT_BASE}/${encodeURIComponent(opts.model)}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: opts.mimeType, data: opts.imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Card reading needs no reasoning; a thinking budget would only add cost
      // and latency.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
      temperature: 0,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "TimeoutError";
    throw new GeminiError(aborted ? "timeout" : "network");
  }

  if (!response.ok) {
    // Read only the upstream status code, not the message, so nothing from the
    // request can round-trip into our logs.
    let upstreamStatus = "unknown";
    try {
      const errJson = (await response.json()) as { error?: { status?: string } };
      if (typeof errJson.error?.status === "string") upstreamStatus = errJson.error.status;
    } catch {
      // Body was not JSON; the HTTP status alone is enough.
    }
    throw new GeminiError(`model-${upstreamStatus}`, response.status);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (payload.promptFeedback?.blockReason) {
    throw new GeminiError("blocked");
  }

  const candidate = payload.candidates?.[0];
  if (!candidate) throw new GeminiError("no-candidate");
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new GeminiError(`finish-${candidate.finishReason}`);
  }

  const text = candidate.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("empty-response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("unparseable-response");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new GeminiError("unparseable-response");
  }

  return coerceCardFields(parsed as Record<string, unknown>);
}

/** Forces the model's output into the exact shape the client expects. */
function coerceCardFields(raw: Record<string, unknown>): CardFields {
  const str = (key: string): string => {
    const value = raw[key];
    return typeof value === "string" ? value.trim().slice(0, 200) : "";
  };
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;

  return {
    name: str("name"),
    nameEn: str("nameEn"),
    company: str("company"),
    department: str("department"),
    title: str("title"),
    mobile: str("mobile"),
    phone: str("phone"),
    fax: str("fax"),
    email: str("email"),
    website: str("website"),
    address: str("address"),
    confidence,
  };
}
