/**
 * Report a problem: asks for a note and posts the text built in the table
 * layer to the site's `/api/report`, which files it for the developers. With
 * no connection it offers the share sheet, or the clipboard, instead.
 */

import { BUILD } from "./build-info.js";
import { closestHandsOn, pinnedHands } from "./hints.js";
import { hintStyle } from "./hint-style.js";
import { discardLayout } from "./discard-layout.js";
import { largeDiscards } from "./large-discards.js";
import { tileNumbers } from "./tile-numbers.js";
import { level } from "./level.js";
import { houseRules } from "./options.js";
import { openingPref } from "./opening.js";
import { pace } from "./pace.js";
import { MAX_PHOTOS, preparePhoto } from "./photo.js";
import { $, state, toast } from "./shared.js";
import { sound } from "./sound.js";
import { sortPref } from "./sort-pref.js";
import { tipsOn } from "./tips.js";

const SEND_TIMEOUT_MS = 15000;
/** Below this much visible height (a landscape phone with its keyboard up) the sheet drops its small print. */
const TIGHT_HEIGHT = 240;

const sheet = $("#report-sheet");
const note = $("#report-note");
const sendButton = $("#report-send");
const shareButton = $("#report-share");
const status = $("#report-status");
const photoInput = $("#report-photo-input");
const photoAdd = $("#report-photo-add");
const photoList = $("#report-photo-list");

let sending = false;
let closing = 0;
/** The pictures to send with the report, in order: each its base64 JPEG and a preview address. */
let photos = [];

/* The keyboard does not resize the page on an iPhone, it covers it: only the
   visual viewport says what is still in sight. The sheet is kept on exactly
   that part, so the note and Send stay above the keyboard in any orientation. */
function fitSheet() {
  const viewport = window.visualViewport;
  if (sheet.hidden || !viewport) return;
  sheet.style.setProperty("--report-top", `${viewport.offsetTop}px`);
  sheet.style.setProperty("--report-height", `${viewport.height}px`);
  sheet.classList.toggle("tight", viewport.height < TIGHT_HEIGHT);
}
window.visualViewport?.addEventListener("resize", fitSheet);
window.visualViewport?.addEventListener("scroll", fitSheet);

function say(text, bad = false) {
  status.textContent = text;
  status.hidden = text === "";
  status.classList.toggle("bad", bad);
}

function openReport() {
  clearTimeout(closing);
  say("");
  shareButton.hidden = true;
  sendButton.disabled = false;
  sheet.hidden = false;
  fitSheet();
  note.focus();
}

function closeReport() {
  clearTimeout(closing);
  note.blur();
  sheet.hidden = true;
}

/* Every choice the player has stored on this device, so a report shows the
   settings a bug happened under. The table prints them; it cannot see them. */
function settingsNow() {
  return {
    botLevel: level.id,
    pace: pace.id,
    hintStyle: hintStyle.id,
    animations: openingPref.enabled,
    sound: !sound.muted,
    largeDiscards: largeDiscards.on,
    tileNumbers: tileNumbers.on,
    discards: discardLayout.id,
    hints: closestHandsOn(),
    tips: tipsOn(),
    sort: sortPref.on,
    pinned: pinnedHands(),
    rules: houseRules(),
  };
}

/* The report text is built in the table layer (`api.report`). */
function reportText() {
  return state.api.report({
    version: BUILD.version,
    build: BUILD.id,
    userAgent: navigator.userAgent,
    note: note.value,
    settings: settingsNow(),
  });
}

/** The photos on the sheet: a thumbnail of each, with its own Remove, and Add until the report is full. */
function showPhotos() {
  photoList.replaceChildren(
    ...photos.map((item, index) => {
      const figure = document.createElement("div");
      figure.className = "report-photo-item";
      const picture = document.createElement("img");
      picture.src = item.url;
      picture.alt = `Photo ${index + 1} to send`;
      const remove = document.createElement("button");
      remove.className = "ghost";
      remove.type = "button";
      remove.innerHTML = "<span>Remove</span>";
      remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
      remove.addEventListener("click", () => removePhoto(index));
      figure.append(picture, remove);
      return figure;
    }),
  );
  photoAdd.hidden = photos.length >= MAX_PHOTOS;
  photoAdd.querySelector("span").textContent =
    photos.length === 0 ? "Add a photo (optional)" : `Add a photo (${photos.length} of ${MAX_PHOTOS})`;
}

function clearPhotos() {
  for (const item of photos) URL.revokeObjectURL(item.url);
  photos = [];
  showPhotos();
}

function removePhoto(index) {
  URL.revokeObjectURL(photos[index].url);
  photos.splice(index, 1);
  showPhotos();
  say("");
}

/** The pictures the tester chose, made small enough to send; a refusal says why. */
async function choosePhotos() {
  const files = Array.from(photoInput.files ?? []);
  photoInput.value = "";
  if (files.length === 0) return;
  say("Preparing the photo...");
  let refused = 0;
  let full = false;
  for (const file of files) {
    // The room is checked again after each picture is made: Add stays up while the last ones are prepared.
    if (photos.length >= MAX_PHOTOS) {
      full = true;
      break;
    }
    const prepared = await preparePhoto(file);
    if (prepared === null) {
      refused += 1;
      continue;
    }
    if (photos.length >= MAX_PHOTOS) {
      full = true;
      break;
    }
    photos.push({ base64: prepared.base64, url: URL.createObjectURL(prepared.blob) });
    showPhotos();
  }
  if (refused > 0) {
    say(
      refused === 1
        ? "That is not a picture the report can take, even made smaller."
        : `${refused} of those are not pictures the report can take, even made smaller.`,
      true,
    );
  } else if (full) {
    say(`A report takes at most ${MAX_PHOTOS} photos, so the rest were not added.`, true);
  } else {
    say("");
  }
}

/**
 * Post the report, with the picture when there is one. Resolves to the answer:
 * the server's own refusal (with its `error`), or null when it did not arrive.
 */
async function post(text) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
  try {
    const body = photos.length === 0 ? { report: text } : { report: text, photos: photos.map((item) => item.base64) };
    const response = await fetch("api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    if (!response.ok) {
      const refusal = await response.json().catch(() => ({}));
      return { ok: false, error: typeof refusal.error === "string" ? refusal.error : "" };
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function send() {
  if (sending) return;
  const text = reportText();
  if (text === null) {
    say("There is no game to report yet.", true);
    return;
  }
  sending = true;
  sendButton.disabled = true;
  shareButton.hidden = true;
  say("Sending...");
  const answer = await post(text);
  sending = false;
  sendButton.disabled = false;
  if (sheet.hidden) {
    // Closed while it was on its way: say how it ended where it can be seen.
    toast(answer?.ok ? "Report sent. Thank you." : "The report could not be sent.");
    if (answer?.ok) {
      note.value = "";
      clearPhotos();
    }
    return;
  }
  if (answer?.ok) {
    note.value = "";
    clearPhotos();
    note.blur();
    say(typeof answer.number === "number" ? `Sent as report #${answer.number}. Thank you.` : "Sent. Thank you.");
    closing = setTimeout(closeReport, 2200);
    return;
  }
  // A refusal from the site says what to fix (a photo too large, say); a lost connection does not.
  if (answer?.error) {
    say(`It could not be sent: ${answer.error}.`, true);
  } else {
    say("It could not be sent. Check your connection and tap Send again, or share it as a message.", true);
  }
  shareButton.hidden = false;
}

/* The way out when the site cannot be reached: the share sheet, which needs
   this tap's activation, or else the clipboard. */
async function share() {
  const text = reportText();
  if (text === null) return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `int-maj report ${BUILD.id}`, text });
      closeReport();
      return;
    } catch (error) {
      if (error?.name === "AbortError") return; // the tester closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    closeReport();
    toast("Report copied. Paste it into your message.");
  } catch {
    say("Could not share or copy the report.", true);
  }
}

$("#report").addEventListener("click", openReport);
$("#report-close").addEventListener("click", closeReport);
sheet.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeReport();
});
sendButton.addEventListener("click", send);
shareButton.addEventListener("click", share);
photoAdd.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", () => void choosePhotos());
showPhotos();
note.addEventListener("keydown", (event) => {
  // The note is one line, so the keyboard's return key sends it.
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    void send();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReport();
});
