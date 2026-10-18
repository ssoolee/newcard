/**
 * Client-side image preparation.
 *
 * Every photo is resized and **re-encoded to JPEG** before it leaves the
 * device. That is not only about bandwidth:
 *
 * - iPhones hand back HEIC from the gallery, which Gemini does not accept and
 *   Chrome cannot decode. Re-encoding through a canvas sidesteps the format
 *   problem entirely.
 * - A 12MP original carries EXIF, including GPS coordinates of where the card
 *   was photographed. A canvas re-encode drops all metadata, so location data
 *   never reaches our function or Google.
 * - Smaller payloads mean faster recognition on mobile data.
 */

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

export interface PreparedImage {
  base64: string;
  mimeType: "image/jpeg";
  bytes: number;
  /** Object URL for the on-screen thumbnail. Revoke it when done. */
  previewUrl: string;
}

/** Decodes with EXIF orientation applied, falling back for older Safari. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the <img> path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-decode-failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE_PX) return { width, height };
  const scale = MAX_EDGE_PX / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const source = await decode(file);
  const sourceWidth = "width" in source ? source.width : 0;
  const sourceHeight = "height" in source ? source.height : 0;
  if (!sourceWidth || !sourceHeight) throw new Error("image-decode-failed");

  const { width, height } = targetSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  // White backdrop so a transparent PNG does not become black text on black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if ("close" in source && typeof source.close === "function") source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("image-encode-failed");

  return {
    base64: await blobToBase64(blob),
    mimeType: "image/jpeg",
    bytes: blob.size,
    previewUrl: URL.createObjectURL(blob),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("image-read-failed"));
    reader.readAsDataURL(blob);
  });
}
