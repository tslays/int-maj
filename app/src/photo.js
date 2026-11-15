/**
 * A picture for a problem report, made small enough to send: drawn at most
 * LONGEST pixels along its longer side and re-encoded as a JPEG, which drops
 * the location and camera details the phone's own photo carries. The Worker
 * refuses anything over MAX_BYTES, so every photo prepared here fits.
 */

export const LONGEST = 1024;
/** The Worker's limit for a report's photo, in bytes once decoded (`src/worker/photo.ts`). */
export const MAX_BYTES = 1_000_000;
/** Tried in turn until the picture fits: the first is the quality kept whenever it can be. */
const QUALITIES = [0.7, 0.5];

/** The size a picture is drawn at: its longer side at most `longest`, never enlarged. */
export function scaledSize(width, height, longest = LONGEST) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function base64Of(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The picked file as `{ base64, blob }`, the JPEG the report sends and the
 * same picture to preview; or null when it is not a picture, or is still too
 * large after the smallest quality.
 */
export async function preparePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { width, height } = scaledSize(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    for (const quality of QUALITIES) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob !== null && blob.size <= MAX_BYTES) return { base64: await base64Of(blob), blob };
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
