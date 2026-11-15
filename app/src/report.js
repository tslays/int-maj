/**
 * Report a problem: asks for a note and posts the text built in the table
 * layer to the site's `/api/report`, which files it for the developers. With
 * no connection it offers the share sheet, or the clipboard, instead.
 */

import { BUILD } from "./build-info.js";
import { preparePhoto } from "./photo.js";
import { $, state, toast } from "./shared.js";

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
const photoRemove = $("#report-photo-remove");
const photoPreview = $("#report-photo-preview");

let sending = false;
let closing = 0;
/** The picture to send with the report: its base64 JPEG and a preview address. */
let photo = null;

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

/* The report text is built in the table layer (`api.report`). */
function reportText() {
  return state.api.report({
    version: BUILD.version,
    build: BUILD.id,
    userAgent: navigator.userAgent,
    note: note.value,
  });
}

function showPhoto() {
  photoAdd.hidden = photo !== null;
  photoRemove.hidden = photo === null;
  photoPreview.hidden = photo === null;
  photoPreview.src = photo === null ? "" : photo.url;
}

function clearPhoto() {
  if (photo !== null) URL.revokeObjectURL(photo.url);
  photo = null;
  showPhoto();
}

/** The picture the tester chose, made small enough to send; a refusal says why. */
async function choosePhoto() {
  const file = photoInput.files?.[0];
  photoInput.value = "";
  if (file === undefined) return;
  say("Preparing the photo...");
  const prepared = await preparePhoto(file);
  if (prepared === null) {
    say("That is not a picture the report can take, even made smaller.", true);
    return;
  }
  clearPhoto();
  photo = { base64: prepared.base64, url: URL.createObjectURL(prepared.blob) };
  say("");
  showPhoto();
}

/**
 * Post the report, with the picture when there is one. Resolves to the answer:
 * the server's own refusal (with its `error`), or null when it did not arrive.
 */
async function post(text) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
  try {
    const body = photo === null ? { report: text } : { report: text, photo: photo.base64 };
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
      clearPhoto();
    }
    return;
  }
  if (answer?.ok) {
    note.value = "";
    clearPhoto();
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
photoInput.addEventListener("change", () => void choosePhoto());
photoRemove.addEventListener("click", () => {
  clearPhoto();
  say("");
});
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
