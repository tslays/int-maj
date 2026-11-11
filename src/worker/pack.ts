/**
 * A long game's replay block is larger than a GitHub issue may be, so the
 * report endpoint packs it: gzip, then base64 in lines. `unpackReport` turns
 * a packed report back into the plain text `parseReport` reads; plain reports
 * pass through unchanged.
 *
 * Both use the web's compression streams, which the Worker and Node share.
 */

import { REPLAY_BEGIN, REPLAY_END } from "../table/report.ts";

export const PACKED_BEGIN = "-----BEGIN REPLAY GZIP-----";
export const PACKED_END = "-----END REPLAY GZIP-----";

const LINE = 76;

async function pipe(bytes: Uint8Array<ArrayBuffer>, through: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Replace the replay block of a report by its gzipped, base64 form. */
export async function packReport(text: string): Promise<string> {
  const start = text.indexOf(REPLAY_BEGIN);
  const end = text.indexOf(REPLAY_END);
  if (start < 0 || end < start) return text;
  const json = text.slice(start + REPLAY_BEGIN.length, end).trim();
  const packed = toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream("gzip")));
  const lines: string[] = [];
  for (let i = 0; i < packed.length; i += LINE) lines.push(packed.slice(i, i + LINE));
  return [text.slice(0, start) + PACKED_BEGIN, ...lines, PACKED_END + text.slice(end + REPLAY_END.length)].join("\n");
}

/** The plain report text of a packed report; any other text is returned as it is. */
export async function unpackReport(text: string): Promise<string> {
  const start = text.indexOf(PACKED_BEGIN);
  const end = text.indexOf(PACKED_END);
  if (start < 0 || end < start) return text;
  const packed = text.slice(start + PACKED_BEGIN.length, end).replace(/\s+/g, "");
  const json = new TextDecoder().decode(await pipe(fromBase64(packed), new DecompressionStream("gzip")));
  return [text.slice(0, start) + REPLAY_BEGIN, json, REPLAY_END + text.slice(end + PACKED_END.length)].join("\n");
}
