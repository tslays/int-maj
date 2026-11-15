/**
 * A report's optional photos: up to MAX_PHOTOS JPEGs the app has already
 * resized and re-encoded on the phone, which drops their location and camera
 * details. The Worker checks that each really is a JPEG of bounded size before
 * any is kept.
 */

/** The most photos one report may carry. */
export const MAX_PHOTOS = 3;
/** The largest photo kept, in bytes once decoded. */
export const MAX_PHOTO = 1_000_000;
/** The same photo as base64 text, which is how the app sends it. */
export const MAX_PHOTO_BASE64 = Math.ceil(MAX_PHOTO / 3) * 4;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decode the app's base64 photo, or say why it is refused. */
export function decodePhoto(base64: string): { readonly bytes: Uint8Array<ArrayBuffer> } | { readonly error: string } {
  if (base64.length > MAX_PHOTO_BASE64) return { error: "the photo is too large" };
  if (base64.length === 0 || base64.length % 4 !== 0 || !BASE64.test(base64)) {
    return { error: "the photo is not a JPEG" };
  }
  const binary = atob(base64);
  if (binary.length > MAX_PHOTO) return { error: "the photo is too large" };
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Every JPEG starts with the marker bytes FF D8 FF.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { error: "the photo is not a JPEG" };
  return { bytes };
}
