/**
 * The opening of a hand, shown: East is thrown for (first hand of a game),
 * East throws for the wall to break, the break is lifted and the tiles are
 * dealt (I p. 18-19, rules 1, 5, 6 and 8). It is a picture of what the engine
 * has already decided, so it changes nothing: the hand it ends on is the
 * payload it was given, however it is cut short.
 *
 * It is meant to be quick (about two seconds a hand, a little more for the
 * first throw), and a tap, Escape or Enter skips whatever is left. Players who
 * never want it turn it off in Options (`openingPref`, `opening.js`).
 */

import { PIPS, dealStages } from "./opening.js";
import { pace } from "./pace.js";
import { board, WIND_NAME } from "./shared.js";
import { sound } from "./sound.js";
import { sleep } from "./stage.js";

const WHO = ["You", "Right", "Across", "Left"];
const EAST_AT = ["You are East.", "East is on your right.", "East is across the table.", "East is on your left."];

/** Waiting that a tap, Escape or Enter cuts short. */
function skipper(layer) {
  let skipped = false;
  let wake = () => {};
  const gate = new Promise((resolve) => (wake = resolve));
  const skip = () => {
    skipped = true;
    wake();
  };
  const onKey = (event) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") skip();
  };
  layer.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", onKey);
  return {
    get skipped() {
      return skipped;
    },
    wait: (ms) => (skipped ? Promise.resolve() : Promise.race([sleep(pace.scale(ms)), gate])),
    dispose: () => window.removeEventListener("keydown", onKey),
  };
}

/* ------------------------------------------------------------ dice */

function makeDie() {
  const die = document.createElement("span");
  die.className = "die";
  for (let index = 0; index < 9; index++) die.append(document.createElement("i"));
  return die;
}

function showFace(die, face) {
  die.classList.toggle("one", face === 1); // the single pip of a one is red
  for (const [index, pip] of [...die.children].entries()) pip.classList.toggle("on", PIPS[face].includes(index));
}

/** Tumble a pair of dice for `ms`, then settle them on `faces`. */
async function tumble(dice, faces, ms, run) {
  for (const die of dice) {
    die.classList.remove("settled");
    die.classList.add("tumbling");
  }
  const end = performance.now() + pace.scale(ms);
  while (!run.skipped && performance.now() < end) {
    for (const die of dice) showFace(die, 1 + Math.floor(Math.random() * 6));
    await run.wait(65);
  }
  dice.forEach((die, index) => showFace(die, faces[index]));
  for (const die of dice) {
    die.classList.remove("tumbling");
    die.classList.add("settled");
  }
  if (!run.skipped) sound.cue("clack", { intensity: 0.7 });
}

/** One row of the card: who throws, their two dice and the total. */
function makeRow(label) {
  const row = document.createElement("div");
  row.className = "opening-row";
  const who = document.createElement("span");
  who.className = "opening-who";
  who.textContent = label;
  const dice = [makeDie(), makeDie()];
  for (const die of dice) showFace(die, 1);
  const pair = document.createElement("span");
  pair.className = "opening-dice";
  pair.append(...dice);
  const total = document.createElement("b");
  total.className = "opening-total";
  total.textContent = " ";
  row.append(who, pair, total);
  return { row, dice, total };
}

function makeCard(layer, title) {
  const card = document.createElement("div");
  card.className = "opening-card";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const rows = document.createElement("div");
  rows.className = "opening-rows";
  const note = document.createElement("p");
  note.className = "opening-note";
  const hint = document.createElement("p");
  hint.className = "opening-hint";
  hint.textContent = "Tap to skip";
  card.append(heading, rows, note, hint);
  layer.replaceChildren(card);
  return { card, heading, rows, note };
}

/* ------------------------------------------------------- the stages */

/** Who is East: each seat throws two dice in turn; a tie is thrown again. */
async function seatStage(layer, run, payload) {
  const { throws } = payload.seatSelection;
  const { heading, rows, note } = makeCard(layer, "Who is East?");
  const seats = ["E", "S", "W", "N"].sort((a, b) => board.rel(a) - board.rel(b));
  const made = new Map(seats.map((seat) => [seat, makeRow(WHO[board.rel(seat)])]));
  rows.replaceChildren(...[...made.values()].map((entry) => entry.row));
  for (const [round, dice] of throws.entries()) {
    if (round > 0) {
      heading.textContent = "Tie – throw again";
      for (const entry of made.values()) {
        entry.row.classList.remove("tied");
        entry.total.textContent = " ";
        for (const die of entry.dice) showFace(die, 1);
      }
      note.textContent = "";
    }
    await Promise.all(
      seats.map(async (seat, turn) => {
        await run.wait(turn * 190);
        const entry = made.get(seat);
        await tumble(entry.dice, dice[seat], 300, run);
        entry.total.textContent = String(dice[seat][0] + dice[seat][1]);
      }),
    );
    const totals = seats.map((seat) => dice[seat][0] + dice[seat][1]);
    const best = Math.max(...totals);
    const top = seats.filter((_, index) => totals[index] === best);
    if (top.length > 1) {
      for (const seat of top) made.get(seat).row.classList.add("tied");
      await run.wait(650);
      continue;
    }
    const east = top[0];
    made.get(east).row.classList.add("east");
    const mine = payload.table.find((entry) => entry.isYou);
    note.textContent = `${EAST_AT[board.rel(east)]}${east === payload.seat ? "" : ` You sit as ${WIND_NAME[mine.wind]} Wind.`}`;
    await run.wait(950);
  }
}

/** East throws two dice for the wall to break (the printed table, p. 19). */
async function breakStage(layer, run, payload) {
  const { dice, builder } = board.wall;
  const total = dice[0] + dice[1];
  const east = payload.view.dealer;
  const wallOf = payload.table.find((entry) => entry.seat === builder);
  const { heading, rows, note } = makeCard(layer, east === payload.seat ? "You throw for the wall" : "East throws for the wall");
  const entry = makeRow(WHO[board.rel(east)]);
  rows.replaceChildren(entry.row);
  note.textContent = `${WIND_NAME[payload.view.prevailingWind]} round · hand ${payload.view.handNumber}`;
  heading.classList.add("small");
  await tumble(entry.dice, dice, 420, run);
  entry.total.textContent = String(total);
  note.textContent = `${total}: break ${WIND_NAME[wallOf.wind]} Wind's wall`;
  await run.wait(520);
}

/**
 * Play the opening of the hand `payload` deals, on the board. Resolves with no
 * calls to announce. `onSeated` runs once East is known (at the start of a
 * hand that needs no throw), so the winds on the console do not give it away.
 */
export async function playOpening(payload, { onSeated }) {
  const layer = document.createElement("div");
  layer.className = "opening";
  layer.setAttribute("role", "status");
  document.body.append(layer);
  const run = skipper(layer);
  board.startHand(payload, { closed: true });
  try {
    if (payload.seatSelection !== null) await seatStage(layer, run, payload);
    onSeated();
    if (!run.skipped) await breakStage(layer, run, payload);
    layer.replaceChildren();
    layer.classList.add("clear");
    if (!run.skipped) {
      const stages = dealStages(payload);
      await Promise.all(board.breakWall(true));
      await board.reconcile(stages[0], { animated: true });
      sound.cue("deal");
      const pending = [];
      for (const stage of stages.slice(1)) {
        if (run.skipped) break;
        pending.push(board.reconcile(stage, { animated: true }));
        await run.wait(130);
      }
      await Promise.all(pending);
    }
  } finally {
    run.dispose();
    layer.remove();
    // However it ended (or was cut short), the table is the payload's.
    onSeated();
    await Promise.all(board.breakWall(false));
    await board.reconcile(payload, { animated: false });
  }
  return [];
}
