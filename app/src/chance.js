/**
 * The words for a hand's building chance, and the grouping of the tiles it
 * still needs. Pure, so the cuts and the wording are tested on their own.
 *
 * The chance is shown as a band, never as a number. Five bands, cut by ratio
 * at the bottom (most hands in the panel are small chances, and people read
 * those as "1 in 10", "1 in 50") and wide at the top, where the figure is
 * least exact: calibration (docs/HINT-ODDS.md section 10) found hands shown
 * at 60-98 % built 60-79 % of the time once the other players may win, so a
 * finer split up there would claim precision the figure does not have. The
 * words describe the tiles, not the choice.
 */

/** Likeliest first; `from` is the lowest chance in the band, `odds` its plain-odds words. */
export const BANDS = [
  { id: "likely", name: "Likely", from: 0.5, odds: "better than even" },
  { id: "possible", name: "Possible", from: 0.25, odds: "about 1 in 2 to 1 in 4" },
  { id: "unlikely", name: "Unlikely", from: 0.1, odds: "about 1 in 4 to 1 in 10" },
  { id: "long-shot", name: "Long shot", from: 0.02, odds: "about 1 in 10 to 1 in 50" },
  { id: "remote", name: "Remote", from: 0, odds: "less than 1 in 50" },
];

/** The band a chance falls in. */
export function chanceBand(chance) {
  return BANDS.find((band) => chance >= band.from) ?? BANDS[BANDS.length - 1];
}

/** A band's rank, 0 for remote up to 4 for likely: the arrows compare ranks. */
export function bandRank(chance) {
  return BANDS.length - 1 - BANDS.indexOf(chanceBand(chance));
}

/** The chance for a screen reader: "likely to build", "a long shot to build". */
export function chanceWords(chance) {
  const band = chanceBand(chance);
  if (band.id === "long-shot") return "a long shot to build";
  return `${band.name.toLowerCase()} to build`;
}

/** What a band means in plain odds: "Remote: less than 1 in 50." */
export function bandOdds(chance) {
  const band = chanceBand(chance);
  return `${band.name}: ${band.odds}.`;
}

/**
 * The tiles a hand still needs, one entry per kind with how many copies it
 * needs and how many are still out of sight: three White Dragons needed
 * with four unseen is `{ key: "dW", count: 3, left: 4 }`, so the overlap
 * (you need 3 of those 4) is plain. In first-seen order; `left` is
 * undefined when the count is not known.
 */
export function needGroups(progress) {
  const counts = new Map();
  for (const key of progress.need ?? []) counts.set(key, (counts.get(key) ?? 0) + 1);
  const unseen = progress.unseen ?? {};
  return [...counts].map(([key, count]) => ({ key, count, left: unseen[key] }));
}
