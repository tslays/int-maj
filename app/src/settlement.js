/**
 * The result card's account of the money: who paid whom and why, seat by seat,
 * and why nothing moved when nothing did. Pure words from the ledger the table
 * sends (`outcome.ledger`, every entry tagged with its kind), so it needs no
 * browser and the wording can be tested.
 *
 * The page citations are the book's: *The Game of Mah Jong Illustrated*.
 */

const fmt = (points) => points.toLocaleString("en");

const TIER_TEXT = {
  half: "a half-limit hand",
  limit: "a limit hand",
  middle: "a middle-limit hand",
  double: "a double-limit hand",
  calculate: "an ordinary hand",
};

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * @param {object} input
 * @param {object} input.outcome   the result payload (kind, winner, from, selfDrawn, ledger)
 * @param {string} input.you       the viewer's seat letter
 * @param {string} input.dealer    the seat that was East this hand
 * @param {(seat: string) => string} input.name  a seat's wind name, "South"
 * @param {readonly string[]} input.fishing      the seats that announced they were fishing
 * @returns {{ summary: string[], seats: Record<string, { lines: { dir: "pay" | "get", text: string, why: string }[] }> }}
 */
export function explainSettlement({ outcome, you, dealer, name, fishing }) {
  const ledger = outcome.ledger.filter((entry) => entry.points !== null);
  const who = (seat) => (seat === you ? "you" : name(seat));
  const was = (seat) => (seat === you ? "were" : "was");
  const share = (seat) => (seat === you ? "your" : `${name(seat)}'s`);
  const winner = outcome.winner;
  // The rule is East's, whoever sits there: "East pays double", never "you pays".
  const eastName = "East";

  const doubleNote = (entry) => {
    if (entry.doubled !== true) return "";
    if (entry.kind === "careless" && entry.covers === dealer && entry.from !== dealer && entry.to !== dealer) {
      return `${eastName}'s share is paid double`;
    }
    if (entry.from === dealer) return `${eastName} pays double`;
    if (entry.to === dealer) return `${eastName} receives double`;
    return "";
  };

  const reasonOf = (entry) => {
    switch (entry.kind) {
      case "win":
        return "winning hand";
      case "careless":
        return `careless discard, also paying ${share(entry.covers)} share (p. 22)`;
      case "fishing":
        return `fishing: ${who(entry.to)} ${was(entry.to)} one tile short of ${TIER_TEXT[entry.tier] ?? "a hand"}`;
      case "difference":
        return "difference between their losing hands (p. 24)";
      case "goulash":
        return "Goulash pool";
      case "too-many-tiles":
        return `${who(entry.from)} had too many tiles (p. 22)`;
      case "false-mahjong":
        return "false Mah Jong, a half limit to each other player (p. 22)";
      default:
        return entry.reason;
    }
  };

  const seats = {};
  for (const seat of ["E", "S", "W", "N"]) seats[seat] = { lines: [] };
  for (const entry of ledger) {
    const why = [reasonOf(entry), doubleNote(entry)].filter(Boolean).join(" · ");
    seats[entry.from].lines.push({ dir: "pay", text: `Pays ${who(entry.to)} ${fmt(entry.points)}`, why });
    seats[entry.to].lines.push({ dir: "get", text: `Receives ${fmt(entry.points)} from ${who(entry.from)}`, why });
  }

  const drawn = outcome.kind !== "win" || winner === null;
  const fishers = fishing.filter((seat) => seat !== winner);
  const fishersText = fishers.map((seat) => who(seat)).join(" and ");
  for (const seat of Object.keys(seats)) {
    if (seats[seat].lines.length > 0) continue;
    seats[seat].lines.push({
      dir: "none",
      text: "Nothing paid or received",
      why:
        drawn && fishers.includes(seat)
          ? `${who(seat)} ${was(seat)} fishing, but a drawn hand pays no fishing (p. 21)`
          : "",
    });
  }

  const summary = [];
  if (drawn) {
    summary.push(
      ledger.length === 0
        ? "Nobody went Mah Jong before the wall ran out, so nobody pays and nobody scores (p. 21)."
        : "Nobody went Mah Jong, so no hand scores. Only the penalties below were paid (p. 21, 22).",
    );
    if (fishers.length > 0) {
      summary.push(
        `${capital(fishersText)} ${fishers.length === 1 ? was(fishers[0]) : "were"} fishing, but fishing only pays when another player goes Mah Jong (p. 21, 32).`,
      );
    }
  } else {
    const wins = ledger.filter((entry) => entry.kind === "win");
    const plain = wins.find((entry) => entry.doubled !== true);
    const double = wins.find((entry) => entry.doubled === true);
    const winnerWho = capital(who(winner));
    const how = outcome.selfDrawn ? "by drawing the winning tile" : `on ${who(outcome.from)}${outcome.from === you ? "r" : "'s"} discard`;
    let text = `${winnerWho} won ${how}. `;
    if (plain && double && winner !== dealer) {
      text += `Each of the other players pays the winner ${fmt(plain.points)}, except ${eastName}, who pays double: ${fmt(double.points)}.`;
    } else if (double && winner === dealer) {
      text += `${eastName} won, so each of the other players pays double: ${fmt(double.points)}.`;
    } else if (plain) {
      text += `Each of the other players pays the winner ${fmt(plain.points)}.`;
    }
    summary.push(text);
    if (ledger.some((entry) => entry.kind === "fishing")) {
      summary.push(
        "A fishing hand is paid by the other losing players at its fishing score; the winner pays nothing (p. 21, 32).",
      );
    }
  }
  return { summary, seats };
}
