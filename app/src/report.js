/**
 * Report a problem: asks for a note and hands the text built in the table
 * layer to the share sheet, or the clipboard.
 */

import { BUILD } from "./build-info.js";
import { $, state, toast } from "./shared.js";

/* --------------------------------------------------------- report a problem */

/* The report text is built in the table layer (`api.report`); this only asks
   for a note and hands the text to the share sheet, or the clipboard. */
function closeReport() {
  $("#report-sheet").hidden = true;
}
$("#report").addEventListener("click", () => {
  $("#report-sheet").hidden = false;
  $("#report-note").focus();
});
$("#report-close").addEventListener("click", closeReport);
$("#report-sheet").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeReport();
});
$("#report-send").addEventListener("click", async () => {
  const text = state.api.report({
    version: BUILD.version,
    build: BUILD.id,
    userAgent: navigator.userAgent,
    note: $("#report-note").value,
  });
  if (text === null) {
    toast("There is no game to report yet.");
    return;
  }
  closeReport();
  // The share sheet needs this tap's activation, so it is called right here.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: `int-maj report ${BUILD.id}`, text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return; // the tester closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Report copied. Paste it into your message.");
  } catch {
    toast("Could not share or copy the report.");
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReport();
});
