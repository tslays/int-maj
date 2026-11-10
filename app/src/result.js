/**
 * The result card after a hand and the final standings after the last one.
 */

import { explainSettlement } from "./settlement.js";
import { sound } from "./sound.js";
import { rankSeats, winnerLine } from "./standings.js";
import { tileOrder } from "./tiles.js";
import { $, WIND_NAME, board, faceChip, request, scores, seatName, state, storage, toast } from "./shared.js";

let callOut = null;
let apply = null;
let run = null;
let hideChoices = null;
let newGame = null;

/** The turn loop's pieces this screen needs (owned by main.js). */
export function installResult(hooks) {
  ({ callOut, apply, run, hideChoices, newGame } = hooks);
}

export async function showOutcome() {
  const outcome = state.payload.outcome;
  if ($("#result").dataset.hand === board.handId) return;
  $("#result").dataset.hand = board.handId;
  hideChoices();
  // Reloaded on the final standings: go straight back to them.
  if (outcome.gameOver && standingsOpen() === board.handId) {
    renderStandings();
    return;
  }
  if (outcome.kind === "win" && outcome.winner !== null) {
    sound.cue(outcome.winner === state.payload.seat ? "win" : "lose");
    await callOut(outcome.winner, "Mah Jong", 1100);
  } else {
    sound.cue("drawn");
    await callOut(state.payload.view.dealer, "Drawn", 900);
  }
  renderOutcome(outcome);
}

function renderOutcome(outcome) {
  const panel = $("#result");
  const card = document.createElement("div");
  card.className = "result-card";
  const main = document.createElement("div");
  main.className = "result-main";
  const side = document.createElement("div");
  side.className = "result-side";
  const win = outcome.kind === "win" && outcome.winner !== null;

  const head = document.createElement("p");
  head.className = "result-kicker";
  head.textContent = win
    ? `${seatName(outcome.winner)} ${outcome.winner === state.payload.seat ? "win" : "wins"} · ${
        outcome.selfDrawn ? "self-drawn" : `on ${seatName(outcome.from)}'s discard`
      } · Hand ${state.payload.view.handNumber}`
    : `Hand ${state.payload.view.handNumber} · drawn`;
  const title = document.createElement("h2");
  title.textContent = win ? (outcome.patternName ?? "Mah Jong") : "Drawn hand";
  main.append(head, title);

  if (win && outcome.patternDescription) {
    const description = document.createElement("p");
    description.className = "result-description";
    description.textContent = outcome.patternDescription;
    if (outcome.patternPages.length > 0) {
      const pages = document.createElement("span");
      pages.className = "result-pages";
      pages.textContent = ` Illustrated p. ${outcome.patternPages.join(", ")}`;
      description.append(pages);
    }
    main.append(description);
  } else if (!win) {
    const reason = document.createElement("p");
    reason.className = "result-description";
    reason.textContent = outcome.reason;
    main.append(reason);
  }

  if (win) {
    const tiles = document.createElement("div");
    tiles.className = "result-tiles";
    if (outcome.hand !== null) {
      const concealed = document.createElement("span");
      concealed.className = "result-group";
      for (const key of [...outcome.hand].sort((a, b) => tileOrder(a) - tileOrder(b))) concealed.append(faceChip(key));
      tiles.append(concealed);
    }
    for (const meld of outcome.melds ?? []) {
      const group = document.createElement("span");
      group.className = "result-group";
      for (const key of meld.tiles) group.append(faceChip(key));
      tiles.append(group);
    }
    if (outcome.hand === null && outcome.winningTile) {
      const group = document.createElement("span");
      group.className = "result-group result-winning";
      group.append(faceChip(outcome.winningTile));
      tiles.append(group);
    }
    main.append(tiles);

    const sums = document.createElement("dl");
    sums.className = "result-sums";
    const line = (label, value) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      sums.append(term, detail);
    };
    const power = (n) => String(n).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[digit]);
    if (outcome.ground !== null) {
      const raw = outcome.raw ?? outcome.ground;
      line(
        "Score",
        outcome.doubles
          ? `${outcome.ground} × 2${power(outcome.doubles)} = ${raw.toLocaleString("en")}`
          : String(outcome.ground),
      );
    }
    if (outcome.tier && outcome.tier !== "calculate") line("Hand", `${outcome.tier} limit`);
    if (outcome.points !== null) {
      const capped = outcome.raw !== null && outcome.raw > outcome.points;
      line("Paid", `${outcome.points.toLocaleString("en")}${capped ? ` (limit ${outcome.limit.toLocaleString("en")})` : ""}`);
    }
    main.append(sums);
  }

  const account = explainSettlement({
    outcome,
    you: state.payload.seat,
    dealer: state.payload.view.dealer,
    name: seatName,
    fishing: state.payload.view.fishing.map((entry) => entry.seat),
  });
  const table = document.createElement("div");
  table.className = "result-scores";
  const totals = scores();
  for (const entry of state.payload.table) {
    const seatBox = document.createElement("div");
    seatBox.className = "result-seat";
    // By default only the result: the change in green or red, and the total.
    // Tapping a seat opens its payments, each with the reason for it.
    const row = document.createElement("button");
    row.type = "button";
    row.className = "result-row";
    row.setAttribute("aria-expanded", "false");
    const delta = outcome.totals[entry.seat] ?? 0;
    const name = document.createElement("span");
    name.textContent = `${WIND_NAME[entry.wind]}${entry.seat === state.payload.seat ? " (you)" : ""}`;
    const change = document.createElement("span");
    change.className = delta > 0 ? "gain" : delta < 0 ? "loss" : "";
    change.textContent = delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("en")}`;
    const total = document.createElement("span");
    total.className = "total";
    total.textContent = totals[entry.seat].toLocaleString("en");
    row.append(name, change, total);
    if (outcome.winner === entry.seat) row.classList.add("is-winner");

    const why = document.createElement("ul");
    why.className = "result-why";
    why.hidden = true;
    for (const line of account[entry.seat]) {
      const item = document.createElement("li");
      item.className = `why-${line.dir}`;
      const text = document.createElement("span");
      text.className = "why-text";
      text.textContent = line.text;
      item.append(text);
      if (line.why) {
        const reason = document.createElement("span");
        reason.className = "why-reason";
        reason.textContent = line.why;
        item.append(reason);
      }
      why.append(item);
    }
    row.addEventListener("click", () => {
      const open = why.hidden;
      for (const other of table.querySelectorAll(".result-row")) other.setAttribute("aria-expanded", "false");
      for (const other of table.querySelectorAll(".result-why")) other.hidden = true;
      why.hidden = !open;
      row.setAttribute("aria-expanded", String(open));
    });
    seatBox.append(row, why);
    table.append(seatBox);
  }
  side.append(table);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "act act-win result-next";
  next.textContent = outcome.gameOver ? "Final standings" : "Next hand";
  next.addEventListener("click", async () => {
    if (outcome.gameOver) {
      standingsOpen(board.handId);
      renderStandings();
      return;
    }
    panel.hidden = true;
    panel.replaceChildren();
    state.busy = true;
    try {
      await apply(await request("/api/next", { game: state.payload.game }), { animated: false });
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
    }
    void run();
  });
  side.append(next);
  card.append(main, side);
  panel.replaceChildren(card);
  panel.hidden = false;
}

/**
 * The final standings after the last hand: the seats ranked by total score.
 * Which hand's standings are open is kept in storage, so a reload resumes them.
 */
const STANDINGS_KEY = "int-maj.standings";

function standingsOpen(handId) {
  try {
    if (handId === undefined) return storage()?.getItem(STANDINGS_KEY) ?? null;
    if (handId === null) storage()?.removeItem(STANDINGS_KEY);
    else storage()?.setItem(STANDINGS_KEY, handId);
  } catch {
    // Storage can be blocked; the standings simply do not survive a reload.
  }
  return null;
}

function renderStandings() {
  const panel = $("#result");
  const totals = scores();
  const ranking = rankSeats(totals);
  const windOf = Object.fromEntries(state.payload.table.map((entry) => [entry.seat, entry.wind]));
  const name = (seat) => (seat === state.payload.seat ? "You" : WIND_NAME[windOf[seat]]);

  const card = document.createElement("div");
  card.className = "result-card standings-card";
  const kicker = document.createElement("p");
  kicker.className = "result-kicker";
  kicker.textContent = "Final standings";
  const title = document.createElement("h2");
  const line = winnerLine(ranking, name);
  title.textContent = line.replace(/^You wins/, "You win");
  const list = document.createElement("ol");
  list.className = "standings-list";
  for (const entry of ranking) {
    const row = document.createElement("li");
    row.className = `standings-row${entry.winner ? " is-winner" : ""}`;
    const rank = document.createElement("span");
    rank.className = "standings-rank";
    rank.textContent = `${entry.tied ? "=" : ""}${entry.rank}`;
    const who = document.createElement("span");
    who.textContent = `${WIND_NAME[windOf[entry.seat]]}${entry.seat === state.payload.seat ? " (you)" : ""}`;
    const total = document.createElement("span");
    total.className = "total";
    total.textContent = entry.total.toLocaleString("en");
    row.append(rank, who, total);
    list.append(row);
  }
  const again = document.createElement("button");
  again.type = "button";
  again.className = "act act-win result-next";
  again.textContent = "New game";
  again.addEventListener("click", async () => {
    standingsOpen(null);
    panel.hidden = true;
    panel.replaceChildren();
    await newGame();
  });
  card.append(kicker, title, list, again);
  panel.replaceChildren(card);
  panel.hidden = false;
}
