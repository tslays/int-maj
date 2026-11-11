/**
 * Report a problem: asks for a note and posts the text built in the table
 * layer to the site's `/api/report`, which files it for the developers. With
 * no connection it offers the share sheet, or the clipboard, instead.
 */

import { BUILD } from "./build-info.js";
import { $, state, toast } from "./shared.js";

const SEND_TIMEOUT_MS = 15000;
/** Below this much visible height (a landscape phone with its keyboard up) the sheet drops its small print. */
const TIGHT_HEIGHT = 240;

const sheet = $("#report-sheet");
const note = $("#report-note");
const sendButton = $("#report-send");
const shareButton = $("#report-share");
const status = $("#report-status");

let sending = false;
let closing = 0;

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

/** Post the report; resolves to the answer, or null when it did not arrive. */
async function post(text) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch("api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ report: text }),
      signal: abort.signal,
    });
    if (!response.ok) return null;
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
    if (answer?.ok) note.value = "";
    return;
  }
  if (answer?.ok) {
    note.value = "";
    note.blur();
    say(typeof answer.number === "number" ? `Sent as report #${answer.number}. Thank you.` : "Sent. Thank you.");
    closing = setTimeout(closeReport, 2200);
    return;
  }
  say("It could not be sent. Check your connection and tap Send again, or share it as a message.", true);
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
