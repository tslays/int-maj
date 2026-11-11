/**
 * The result card's account of the money, seat by seat: who paid whom how
 * much, each with its reason. The card shows none of it until the player taps
 * a seat. A seat that paid and received nothing gets one line saying so, with
 * the reason. Pure words from the ledger the table
 * sends (`outcome.ledger`, every entry tagged with its kind), so it needs no
 * browser and the wording can be tested.
 *
 * The page citations are the book's: *The Game of Mah Jong Illustrated*. A
 * table playing with the Companion's hands only has no use for that book, so
 * `cite: false` leaves every citation out.
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
 * @param {object} input.outcome   the result payload (kind, winner, ledger)
 * @param {string} input.you       the viewer's seat letter
 * @param {string} input.dealer    the seat that was East this hand
 * @param {(seat: string) => string} input.name  a seat's wind name, "South"
 * @param {readonly string[]} input.fishing      the seats that announced they were fishing
 * @param {boolean} [input.cite]                 keep the Illustrated page citations (default true)
 * @returns {Record<string, { dir: "pay" | "get" | "none", text: string, why: string }[]>}
 *   each seat's payments ("Pays South 1,200") with the reason for each
 */
export function explainSettlement({ outcome, you, dealer, name, fishing, cite = true }) {
  const plain = (text) => (cite ? text : text.replace(/ \(Illustrated pp?\. [0-9, ]+\)/g, ""));
  const ledger = outcome.ledger.filter((entry) => entry.points !== null);
  const who = (seat) => (seat === you ? "you" : name(seat));
  const was = (seat) => (seat === you ? "were" : "was");
  const pays = (seat) => (seat === you ? "pay" : "pays");
  const share = (seat) => (seat === you ? "your" : `${name(seat)}'s`);

  const doubleNote = (entry) => {
    if (entry.doubled !== true) return "";
    if (entry.kind === "careless" && entry.covers === dealer && entry.from !== dealer && entry.to !== dealer) {
      return "East's share is paid double (Illustrated p. 21).";
    }
    if (entry.from === dealer) return "East pays double (Illustrated p. 21).";
    if (entry.to === dealer) return "East receives double (Illustrated p. 21).";
    return "";
  };

  const reasonOf = (entry) => {
    switch (entry.kind) {
      case "win":
        return "Winning hand: every other player pays the winner.";
      case "careless":
        return `Careless discard: ${who(entry.from)} discarded a tile that ${who(
          entry.to,
        )}${entry.to === you ? "r" : "'s"} exposed sets showed was needed, so ${who(entry.from)} also ${pays(
          entry.from,
        )} ${share(entry.covers)} share (Illustrated p. 22).`;
      case "fishing":
        return `Fishing: ${who(entry.to)} ${was(entry.to)} one tile short of ${
          TIER_TEXT[entry.tier] ?? "a hand"
        }. A fishing hand is paid by the other losing players, not by the winner (Illustrated pp. 21, 32).`;
      case "difference":
        return "The losing hands are settled by the difference between them (Illustrated p. 24).";
      case "goulash":
        return "The Goulash pool goes to the winner (Illustrated p. 21).";
      case "too-many-tiles":
        return `${capital(who(entry.from))} had too many tiles, so ${pays(entry.from)} every other player (Illustrated p. 22).`;
      case "false-mahjong":
        return `${capital(who(entry.from))} declared a false Mah Jong, so ${pays(
          entry.from,
        )} a half limit to each other player (Illustrated p. 22).`;
      default:
        return entry.reason;
    }
  };

  const seats = { E: [], S: [], W: [], N: [] };
  for (const entry of ledger) {
    const why = plain([reasonOf(entry), doubleNote(entry)].filter(Boolean).join(" "));
    seats[entry.from].push({ dir: "pay", text: `Pays ${who(entry.to)} ${fmt(entry.points)}`, why });
    seats[entry.to].push({ dir: "get", text: `Receives ${fmt(entry.points)} from ${who(entry.from)}`, why });
  }

  const winner = outcome.kind === "win" ? outcome.winner : null;
  const drawn = winner === null;
  const fishers = fishing.filter((seat) => seat !== winner);
  for (const seat of Object.keys(seats)) {
    if (seats[seat].length > 0) continue;
    const why = [];
    if (drawn) {
      why.push(
        ledger.length === 0
          ? "Nobody went Mah Jong before the wall ran out, so nobody pays and nobody scores (Illustrated p. 21)."
          : "Nobody went Mah Jong, so no hand scores (Illustrated p. 21).",
      );
      if (fishers.includes(seat)) {
        why.push(`${capital(who(seat))} ${was(seat)} fishing, but fishing only pays when another player goes Mah Jong (Illustrated pp. 21, 32).`);
      }
    }
    seats[seat].push({ dir: "none", text: "Nothing paid or received", why: plain(why.join(" ")) });
  }
  return seats;
}
