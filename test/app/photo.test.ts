/**
 * A report's photos (`app/src/photo.js`): a picture is drawn at most 1024
 * pixels along its longer side, never enlarged, and the limit the app keeps
 * to is the Worker's own, so a prepared photo is always accepted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PHOTO, MAX_PHOTOS as WORKER_MAX_PHOTOS } from "../../src/worker/photo.ts";

// @ts-expect-error - a plain browser module without type declarations
const { LONGEST, MAX_BYTES, MAX_PHOTOS, scaledSize } = await import("../../app/src/photo.js");

describe("report photo size", () => {
  it("draws a large landscape picture at 1024 pixels wide, keeping its shape", () => {
    assert.deepEqual(scaledSize(4032, 3024), { width: 1024, height: 768 });
  });

  it("draws a large portrait picture at 1024 pixels tall", () => {
    assert.deepEqual(scaledSize(3024, 4032), { width: 768, height: 1024 });
  });

  it("never enlarges a small picture", () => {
    assert.deepEqual(scaledSize(300, 200), { width: 300, height: 200 });
    assert.deepEqual(scaledSize(LONGEST, LONGEST), { width: LONGEST, height: LONGEST });
  });

  it("keeps at least one pixel for a picture with no size", () => {
    assert.deepEqual(scaledSize(0, 0), { width: 1, height: 1 });
  });

  it("uses the same byte limit as the Worker", () => {
    assert.equal(MAX_BYTES, MAX_PHOTO);
  });

  it("allows the same number of photos per report as the Worker, three", () => {
    assert.equal(MAX_PHOTOS, WORKER_MAX_PHOTOS);
    assert.equal(MAX_PHOTOS, 3);
  });
});
