/**
 * The install guide: which steps a browser is shown on the turn-your-phone
 * screen, and who is shown none.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { installGuide } = await import("../../app/src/install.js");

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const UA = {
  safari: `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`,
  chromeIos: `${IPHONE} CriOS/141.0.0.0 Mobile/15E148 Safari/604.1`,
  instagramIos: `${IPHONE} Mobile/15E148 Instagram 400.0.0`,
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  webviewAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36",
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("installGuide", () => {
  it("gives an iPhone browser the iOS steps", () => {
    assert.equal(installGuide({ userAgent: UA.safari, platform: "iPhone", maxTouchPoints: 5 }), "ios");
    assert.equal(installGuide({ userAgent: UA.chromeIos, platform: "iPhone", maxTouchPoints: 5 }), "ios");
  });

  it("knows an iPad that says it is a Mac by its touch screen", () => {
    assert.equal(installGuide({ userAgent: UA.ipad, platform: "MacIntel", maxTouchPoints: 5 }), "ios");
    assert.equal(installGuide({ userAgent: UA.ipad, platform: "MacIntel", maxTouchPoints: 0 }), null);
  });

  it("gives an Android browser the Android steps", () => {
    assert.equal(installGuide({ userAgent: UA.chromeAndroid, platform: "Linux armv81", maxTouchPoints: 5 }), "android");
  });

  it("sends a page inside another app to the real browser", () => {
    assert.equal(installGuide({ userAgent: UA.instagramIos, platform: "iPhone", maxTouchPoints: 5 }), "ios-webview");
    assert.equal(installGuide({ userAgent: UA.webviewAndroid, platform: "Linux armv81", maxTouchPoints: 5 }), "android-webview");
  });

  it("shows nothing to an installed copy or a computer", () => {
    assert.equal(installGuide({ userAgent: UA.safari, platform: "iPhone", maxTouchPoints: 5, standalone: true }), null);
    assert.equal(installGuide({ userAgent: UA.chromeAndroid, maxTouchPoints: 5, standalone: true }), null);
    assert.equal(installGuide({ userAgent: UA.chromeWindows, platform: "Win32", maxTouchPoints: 0 }), null);
  });
});
