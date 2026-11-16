/** Reading a report photo back: only with the token, only a well-formed key. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handlePhotoRead, type PhotoReadEnv } from "../../src/worker/photo-read.ts";

const KEY = "507c3f57-ca66-4d55-b603-471648dfa606";
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const ENV: PhotoReadEnv = {
  REPORT_PHOTO_TOKEN: "secret-1",
  REPORT_PHOTOS: {
    async get(key) {
      return key === KEY ? { body: new Response(BYTES).body!, httpMetadata: { contentType: "image/jpeg" } } : null;
    },
  },
};

function get(path: string, token?: string, method = "GET"): Request {
  return new Request(`https://int.example/api/report-photo/${path}`, {
    method,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

describe("report photo read", () => {
  it("returns the photo to the right token", async () => {
    const response = await handlePhotoRead(get(KEY, "secret-1"), ENV);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), BYTES);
  });

  it("answers 404 without a token, with a wrong one, or with another method", async () => {
    for (const request of [get(KEY), get(KEY, "wrong"), get(KEY, "secret-"), get(KEY, "secret-1", "POST")]) {
      assert.equal((await handlePhotoRead(request, ENV)).status, 404);
    }
  });

  it("answers 404 for a malformed or unknown key", async () => {
    for (const key of ["", "../x", "not-a-key", "a0000000-0000-4000-8000-000000000000"]) {
      assert.equal((await handlePhotoRead(get(key, "secret-1"), ENV)).status, 404);
    }
  });

  it("is closed where no secret or bucket is set", async () => {
    assert.equal((await handlePhotoRead(get(KEY, "secret-1"), { ...ENV, REPORT_PHOTO_TOKEN: undefined })).status, 404);
    assert.equal((await handlePhotoRead(get(KEY, ""), { ...ENV, REPORT_PHOTO_TOKEN: "" })).status, 404);
    assert.equal((await handlePhotoRead(get(KEY, "secret-1"), { REPORT_PHOTO_TOKEN: "secret-1" })).status, 404);
  });
});
