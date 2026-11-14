/**
 * The chance that a seat can still complete a hand, from its own view only.
 *
 * What the seat cannot see is one pool: the opponents' concealed tiles and the
 * wall (with its loose tiles). From the seat's chair every arrangement of that
 * pool that fits the visible counts is equally likely, so a trial deals the
 * pool out at random, plays the rest of the hand out, and asks whether the
 * seat completed the hand. The chance is the share of trials that did.
 *
 * In a trial:
 *   - the seat plays only for the target: it throws the tile the nearest
 *     versions of the hand need least, so it re-plans as tiles arrive, and
 *     claims every discard the rules let the hand use (a pung from anyone, a
 *     chow from the player on its left, R-060, and any tile that completes the
 *     hand, R-061);
 *   - a hand that must stay concealed claims only the tile that completes it,
 *     and a hand that must be self-drawn claims nothing;
 *   - each opponent draws and discards by a simple keeper rule: it keeps
 *     pairs, pungs and tiles with a neighbour, and throws a lone tile, lone
 *     honours first; opponents' own claims are not modelled;
 *   - a flower or season drawn is replaced from the end of the wall;
 *   - an unclaimed discard is dead (R-024);
 *   - the trial ends when the target is complete or no draw is left.
 *
 * Only the `GameView` comes in, so nothing here can read another seat's
 * concealed tiles or the wall's order. Pure and deterministic: the random
 * stream is seeded from the view, so one view always gives one answer.
 */

import { createRng, type Rng } from "../rng.ts";
import { PLAY_TILE_KEYS } from "../tiles.ts";
import { seatIndex, type Seat } from "./state.ts";
import type { GameView } from "./view.ts";

const KINDS = PLAY_TILE_KEYS.length;
const INDEX: ReadonlyMap<string, number> = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));
/** The code of a flower or season in the hidden pool. */
const BONUS = KINDS;
/** Indices below this are suited tiles, nine to a suit; the rest are honours. */
const SUITED = 27;

/** Trials per estimate: the standard error is at most about 1.1 points. */
export const TRIALS = 2000;
/** Trials always run before an estimate may stop early. */
const MIN_TRIALS = 200;
/**
 * An estimate stops early once its standard error is below this (2.5 points):
 * the calibration run puts the model's own error at a few points, so more
 * trials would only make the same figure slower.
 */
const PRECISION = 0.025;

/** Which discards the target lets the seat claim. */
export type ClaimRule = "any" | "win" | "none";

export interface OddsTarget {
  /**
   * The versions of the hand still open to the seat: each the concealed tiles
   * it wants (fourteen less three per declared meld), by `PLAY_TILE_KEYS`
   * index. Completing any one completes the hand.
   */
  readonly versions: readonly ArrayLike<number>[];
  /** "any": pungs, chows and the winning tile; "win": only the winning tile; "none": self-drawn only. */
  readonly claims: ClaimRule;
}

export interface OddsOptions {
  readonly trials?: number;
  /** Mixed into the seed so that different targets do not share one stream. */
  readonly salt?: string;
}

/** Everything a trial starts from, worked out once per view. */
export interface Table {
  readonly held: Int8Array;
  /** Copies of each play tile the seat cannot see. */
  readonly unseen: Int8Array;
  /** Flowers and seasons not yet in sight: they are all still in the wall. */
  readonly bonus: number;
  /** Concealed tile counts of the opponents, by seat offset 1..3 from the viewer (index 0 unused). */
  readonly handCounts: readonly number[];
  /** Tiles still to be drawn by anyone. */
  readonly draws: number;
  /** Where play resumes: whose move (offset from the viewer) and what it is. */
  readonly start: Start | null;
  readonly seed: string;
}

type Start =
  | { readonly kind: "draw"; readonly seat: number }
  | { readonly kind: "discard"; readonly seat: number }
  | { readonly kind: "claim"; readonly seat: number; readonly tile: number; readonly mine: boolean };

function countsOf(keys: readonly string[]): Int8Array {
  const counts = new Int8Array(KINDS);
  for (const key of keys) {
    const index = INDEX.get(key);
    if (index !== undefined) counts[index]! += 1;
  }
  return counts;
}

/** Copies of each play tile the viewer has not seen. */
export function unseenOf(view: GameView): Int8Array {
  const seen = countsOf([
    ...view.player.hand,
    ...view.player.melds.flatMap((meld) => meld.tiles),
    ...view.player.discards,
    ...view.opponents.flatMap((opponent) => [...opponent.discards, ...opponent.melds.flatMap((meld) => meld.tiles)]),
  ]);
  const unseen = new Int8Array(KINDS);
  for (let index = 0; index < KINDS; index++) unseen[index] = Math.max(0, 4 - seen[index]!);
  return unseen;
}

function offset(view: GameView, seat: Seat): number {
  return (seatIndex(seat) - seatIndex(view.seat) + 4) % 4;
}

/** The trial's starting point, from the view's phase; null when no hand is being played. */
function startOf(view: GameView): Start | null {
  switch (view.phase) {
    case "draw":
      return { kind: "draw", seat: offset(view, view.turn) };
    case "discard":
    case "announce":
      return { kind: "discard", seat: offset(view, view.turn) };
    case "claim": {
      const window = view.claimWindow;
      if (window === null) return null;
      const tile = INDEX.get(window.tile);
      if (tile === undefined) return null;
      return { kind: "claim", seat: offset(view, window.discarder), tile, mine: window.pending.includes(view.seat) };
    }
    default:
      return null;
  }
}

/** The table as the viewer sees it, ready for trials. */
export function tableOf(view: GameView): Table {
  const unseen = unseenOf(view);
  const handCounts = [0, 0, 0, 0];
  let opponentTiles = 0;
  for (const opponent of view.opponents) {
    handCounts[offset(view, opponent.seat)] = opponent.handCount;
    opponentTiles += opponent.handCount;
  }
  let hiddenPlay = 0;
  for (let index = 0; index < KINDS; index++) hiddenPlay += unseen[index]!;
  // Whatever of the hidden tiles is not a play tile is a flower or season, all of them in the wall.
  const bonus = Math.max(0, view.wallRemaining + view.looseRemaining + opponentTiles - hiddenPlay);
  const seed = [
    view.seat,
    view.handNumber,
    view.phase,
    view.turn,
    view.wallRemaining,
    view.player.hand.join(""),
    view.player.discards.join(""),
    ...view.opponents.map((opponent) => opponent.discards.join("") + "|" + opponent.handCount),
  ].join("/");
  return {
    held: countsOf(view.player.hand),
    unseen,
    bonus,
    handCounts,
    draws: view.drawsLeft,
    start: startOf(view),
    seed,
  };
}

/** One version, as the keys it wants and how many of each. */
interface Version {
  readonly keys: readonly number[];
  readonly want: Int8Array;
}

function versionOf(want: ArrayLike<number>): Version {
  const counts = new Int8Array(KINDS);
  const keys: number[] = [];
  for (let index = 0; index < KINDS; index++) {
    counts[index] = want[index] ?? 0;
    if (counts[index]! > 0) keys.push(index);
  }
  return { keys, want: counts };
}

function complete(version: Version, held: Int8Array): boolean {
  for (const key of version.keys) if (held[key]! < version.want[key]!) return false;
  return true;
}

function missing(version: Version, held: Int8Array): number {
  let short = 0;
  for (const key of version.keys) {
    const gap = version.want[key]! - held[key]!;
    if (gap > 0) short += gap;
  }
  return short;
}

/** How much an opponent wants to keep `tile` (the keeper rule): pairs and neighbours stay, lone honours go first. */
function keep(counts: Int8Array, tile: number): number {
  const count = counts[tile]!;
  if (count >= 2) return 10 * count;
  if (tile >= SUITED) return 0;
  const rank = tile % 9;
  let near = 0;
  if (rank >= 1 && counts[tile - 1]! > 0) near += 2;
  if (rank <= 7 && counts[tile + 1]! > 0) near += 2;
  if (rank >= 2 && counts[tile - 2]! > 0) near += 1;
  if (rank <= 6 && counts[tile + 2]! > 0) near += 1;
  return near + (rank >= 2 && rank <= 6 ? 0.5 : rank === 1 || rank === 7 ? 0.25 : 0.1);
}

/**
 * How much the seat needs each tile it holds: one point for every nearest
 * open version that uses every copy held. The seat throws the tile it needs
 * least.
 */
function needOf(
  held: Int8Array,
  versions: readonly Version[],
  missed: ArrayLike<number>,
  open: (index: number) => boolean,
  best: number,
  into: Float64Array,
): void {
  into.fill(0);
  for (let index = 0; index < versions.length; index++) {
    if (!open(index) || missed[index] !== best) continue;
    const version = versions[index]!;
    for (const key of version.keys) if (held[key]! <= version.want[key]!) into[key]! += 1;
  }
}

/**
 * The play-outs of one target. Buffers are allocated once and reused by
 * every trial, since an estimate runs thousands of them; how far each
 * version is from the seat's tiles is kept up to date tile by tile rather
 * than counted afresh.
 */
class Simulation {
  private readonly table: Table;
  private readonly versions: readonly Version[];
  private readonly claims: ClaimRule;
  private readonly rng: Rng;
  /** For each tile kind, the versions wanting it and how many copies each wants. */
  private readonly users: readonly Int32Array[];
  private readonly usersWant: readonly Int8Array[];
  /** The most copies of each tile any version wants: a tile at or past it is no use. */
  private readonly most = new Int8Array(KINDS);
  private readonly startMissing: Int16Array;
  private readonly held = new Int8Array(KINDS);
  /** Tiles in melds claimed during the trial: they stay put. */
  private readonly locked = new Int8Array(KINDS);
  /** Copies the viewer may still hope for: unseen, less what it saw thrown away in this trial. */
  private readonly hope = new Int8Array(KINDS);
  /** Tiles each version still lacks. */
  private readonly missed: Int16Array;
  /** 1 once a version needs more copies of a tile than can still come. */
  private readonly dead: Uint8Array;
  private readonly need = new Float64Array(KINDS);
  /** Concealed tiles of each opponent, by seat offset. */
  private readonly hands = [new Int8Array(KINDS), new Int8Array(KINDS), new Int8Array(KINDS), new Int8Array(KINDS)];
  /** Per trial, a small random preference per tile kind: ties are broken without drawing a number per tile. */
  private readonly jitter = new Float64Array(KINDS);
  private readonly deck: Uint8Array;
  private front = 0;
  private back = 0;
  private left = 0;
  private complete = false;
  /** The fewest tiles any open version lacks, or -1 when it must be counted again. */
  private best = -1;

  constructor(table: Table, versions: readonly Version[], claims: ClaimRule, rng: Rng) {
    this.table = table;
    this.versions = versions;
    this.claims = claims;
    this.rng = rng;
    const users: number[][] = Array.from({ length: KINDS }, () => []);
    const wants: number[][] = Array.from({ length: KINDS }, () => []);
    this.startMissing = new Int16Array(versions.length);
    versions.forEach((version, index) => {
      for (const key of version.keys) {
        users[key]!.push(index);
        wants[key]!.push(version.want[key]!);
        this.most[key] = Math.max(this.most[key]!, version.want[key]!);
      }
      this.startMissing[index] = missing(version, table.held);
    });
    this.users = users.map((list) => Int32Array.from(list));
    this.usersWant = wants.map((list) => Int8Array.from(list));
    this.missed = new Int16Array(versions.length);
    this.dead = new Uint8Array(versions.length);
    const deck: number[] = [];
    for (let index = 0; index < KINDS; index++) for (let copy = 0; copy < table.unseen[index]!; copy++) deck.push(index);
    for (let count = 0; count < table.bonus; count++) deck.push(BONUS);
    this.deck = Uint8Array.from(deck);
  }

  /** One play-out. True when the viewer completes the target. */
  run(): boolean {
    const { table, held, locked, hope, hands, jitter, rng, deck } = this;
    held.set(table.held);
    locked.fill(0);
    hope.set(table.unseen);
    this.missed.set(this.startMissing);
    this.dead.fill(0);
    this.complete = false;
    this.best = -1;
    for (let index = 0; index < KINDS; index++) jitter[index] = rng.next() * 0.01;

    // Deal the unknown. One shuffle of every hidden tile: the opponents take
    // the first play tiles (a bonus tile never stays in a hand), and the wall
    // is what is left, in the same random order.
    for (let index = deck.length - 1; index > 0; index--) {
      const other = Math.floor(rng.next() * (index + 1));
      const tile = deck[index]!;
      deck[index] = deck[other]!;
      deck[other] = tile;
    }
    let at = 0;
    for (let seat = 1; seat < 4; seat++) {
      const hand = hands[seat]!;
      hand.fill(0);
      for (let count = 0; count < table.handCounts[seat]!; count++) {
        while (at < deck.length && deck[at] === BONUS) {
          // Move the bonus tile out of the way: it belongs to the wall.
          const later = at + 1 + Math.floor(rng.next() * (deck.length - at - 1));
          if (later >= deck.length) break;
          deck[at] = deck[later]!;
          deck[later] = BONUS;
        }
        if (at >= deck.length || deck[at] === BONUS) break;
        hand[deck[at++]!]! += 1;
      }
    }
    this.front = at;
    this.back = deck.length - 1;
    this.left = table.draws;

    const start = table.start!;
    let seat: number;
    let step: number; // 0: draw, then discard; 1: discard only
    if (start.kind === "claim") {
      const next = this.thrown(start.tile, start.seat, start.mine);
      if (next === WON) return true;
      seat = next & 3;
      step = next >> 2;
    } else {
      seat = start.seat;
      step = start.kind === "draw" ? 0 : 1;
    }

    for (let guard = 0; guard < 1000; guard++) {
      if (step === 0) {
        const tile = this.draw();
        if (tile < 0) return false;
        if (seat === 0) {
          this.gain(tile);
          if (this.complete) return true;
        } else {
          hands[seat]![tile]! += 1;
        }
      }
      let tile: number;
      if (seat === 0) {
        tile = this.discard();
        if (tile < 0) return false; // no version can be completed any more
      } else {
        tile = this.opponentDiscard(hands[seat]!);
      }
      const next = this.thrown(tile, seat, true);
      if (next === WON) return true;
      seat = next & 3;
      step = next >> 2;
    }
    return false;
  }

  /** A draw by anyone, or -1 when the wall is exhausted. A bonus tile is replaced from the end. */
  private draw(): number {
    const deck = this.deck;
    if (this.left <= 0 || this.front > this.back) return -1;
    let tile = deck[this.front++]!;
    this.left -= 1;
    while (tile === BONUS) {
      if (this.left <= 0 || this.front > this.back) return -1;
      tile = deck[this.back--]!;
      this.left -= 1;
    }
    return tile;
  }

  /** The seat takes `tile` into its hand; sets `complete` when a version is finished. */
  private gain(tile: number): void {
    const before = this.held[tile]!;
    this.held[tile] = before + 1;
    if (before >= this.most[tile]!) return;
    const users = this.users[tile]!;
    const wants = this.usersWant[tile]!;
    for (let at = 0; at < users.length; at++) {
      if (before >= wants[at]!) continue;
      const index = users[at]!;
      const short = (this.missed[index]! -= 1);
      if (short === 0 && this.dead[index] === 0) this.complete = true;
    }
    this.best = -1;
  }

  /** The seat gives up `tile`. */
  private lose(tile: number): void {
    const after = (this.held[tile]! -= 1);
    if (after >= this.most[tile]!) return;
    const users = this.users[tile]!;
    const wants = this.usersWant[tile]!;
    for (let at = 0; at < users.length; at++) {
      if (after >= wants[at]!) continue;
      const index = users[at]!;
      this.missed[index]! += 1;
      if (wants[at]! - after > this.hope[tile]!) this.dead[index] = 1;
    }
    this.best = -1;
  }

  /** A copy of `tile` is thrown away in sight: it can no longer come. */
  private gone(tile: number): void {
    if (this.hope[tile]! === 0) return;
    const hope = (this.hope[tile]! -= 1);
    const held = this.held[tile]!;
    if (held >= this.most[tile]!) return;
    const users = this.users[tile]!;
    const wants = this.usersWant[tile]!;
    for (let at = 0; at < users.length; at++) {
      if (wants[at]! - held > hope && this.dead[users[at]!] === 0) {
        this.dead[users[at]!] = 1;
        this.best = -1;
      }
    }
  }

  /** The fewest tiles an open version lacks; -1 when no version is open. */
  private nearest(): number {
    if (this.best >= 0) return this.best;
    let best = -1;
    for (let index = 0; index < this.versions.length; index++) {
      if (this.dead[index] !== 0) continue;
      const short = this.missed[index]!;
      if (best < 0 || short < best) best = short;
    }
    // Out of draws for what is still missing: the last tile can be a claim, the rest must be drawn.
    if (best >= 0 && best - 1 > this.left) best = -1;
    this.best = best;
    return best;
  }

  /** The viewer's discard, or -1 when no version is open any more. */
  private discard(): number {
    const best = this.nearest();
    if (best < 0) return -1;
    const { held, locked, need, jitter, dead, missed, versions } = this;
    // How much each held tile is needed: by every nearest open version that uses all the copies held.
    need.fill(0);
    for (let index = 0; index < versions.length; index++) {
      if (missed[index] !== best || dead[index] !== 0) continue;
      const version = versions[index]!;
      const keys = version.keys;
      for (let at = 0; at < keys.length; at++) {
        const key = keys[at]!;
        if (held[key]! <= version.want[key]!) need[key]! += 1;
      }
    }
    let choice = -1;
    let choiceScore = Infinity;
    for (let tile = 0; tile < KINDS; tile++) {
      if (held[tile]! - locked[tile]! <= 0) continue;
      const score = need[tile]! + jitter[tile]!;
      if (score < choiceScore) {
        choice = tile;
        choiceScore = score;
      }
    }
    this.lose(choice);
    return choice;
  }

  private opponentDiscard(hand: Int8Array): number {
    let worst = -1;
    let worstScore = Infinity;
    for (let tile = 0; tile < KINDS; tile++) {
      if (hand[tile]! === 0) continue;
      const score = keep(hand, tile) + this.jitter[tile]!;
      if (score < worstScore) {
        worst = tile;
        worstScore = score;
      }
    }
    hand[worst]! -= 1;
    return worst;
  }

  /** Whether a nearest open version wants another `tile`, and one each of `others`. */
  private wanted(tile: number, others: readonly number[]): boolean {
    const best = this.nearest();
    if (best < 0) return false;
    const users = this.users[tile]!;
    const wants = this.usersWant[tile]!;
    const held = this.held[tile]!;
    for (let at = 0; at < users.length; at++) {
      const index = users[at]!;
      if (wants[at]! <= held || this.dead[index] !== 0 || this.missed[index] !== best) continue;
      const want = this.versions[index]!.want;
      if (others.every((other) => want[other]! >= 1)) return true;
    }
    return false;
  }

  /** Whether the viewer claims `tile` thrown by the seat at `from` for a meld, locking the meld it makes. */
  private claim(tile: number, from: number): boolean {
    if (this.claims !== "any") return false;
    const { held, locked } = this;
    if (held[tile]! - locked[tile]! >= 2 && this.wanted(tile, [])) {
      locked[tile]! += 3;
      return true;
    }
    // A chow only off the player on the viewer's left (R-060): the viewer plays next after them.
    if (from !== 3 || tile >= SUITED) return false;
    const rank = tile % 9;
    for (const [a, b] of CHOWS) {
      if (rank + a < 0 || rank + b > 8) continue;
      const x = tile + a;
      const y = tile + b;
      if (held[x]! - locked[x]! < 1 || held[y]! - locked[y]! < 1) continue;
      if (!this.wanted(tile, [x, y])) continue;
      locked[x]! += 1;
      locked[y]! += 1;
      locked[tile]! += 1;
      return true;
    }
    return false;
  }

  /**
   * A discard by the seat at `from`: `WON` when the viewer completes the hand
   * on it, else the seat that moves next (low two bits) and whether it only
   * discards, having claimed (bit 2).
   */
  private thrown(tile: number, from: number, mayClaim: boolean): number {
    if (from !== 0) {
      if (mayClaim && this.held[tile]! < this.most[tile]!) {
        if (this.claims !== "none") {
          this.gain(tile);
          if (this.complete) return WON;
          this.lose(tile);
        }
        if (this.claim(tile, from)) {
          this.gain(tile);
          return 0 | 4;
        }
      }
      this.gone(tile);
    }
    return (from + 1) & 3;
  }
}

const WON = -1;
/** The two other tiles of a chow, relative to the claimed one. */
const CHOWS: readonly (readonly [number, number])[] = [
  [-2, -1],
  [-1, 1],
  [1, 2],
];

/**
 * The chance (0..1) that the viewer completes the target, playing only for it
 * from here, before the wall runs out. Null when no hand is in play.
 */
export function handChance(table: Table, target: OddsTarget, options: OddsOptions = {}): number | null {
  if (table.start === null) return null;
  const versions = target.versions.map(versionOf);
  if (versions.length === 0) return 0;
  if (versions.some((version) => complete(version, table.held))) return 1;
  // A version needing more copies than are unseen can never be completed.
  const open = versions.filter((version) =>
    version.keys.every((key) => version.want[key]! - table.held[key]! <= table.unseen[key]!),
  );
  if (open.length === 0) return 0;
  if (Math.min(...open.map((version) => missing(version, table.held))) - 1 > table.draws) return 0;
  const trials = options.trials ?? TRIALS;
  const simulation = new Simulation(table, open, target.claims, createRng(`${table.seed}#${options.salt ?? ""}`));
  let wins = 0;
  let count = 0;
  while (count < trials) {
    if (simulation.run()) wins += 1;
    count += 1;
    if (count >= MIN_TRIALS && count % 100 === 0 && options.trials === undefined) {
      const p = (wins + 1) / (count + 2);
      if (Math.sqrt((p * (1 - p)) / count) < PRECISION) break;
    }
  }
  return wins / count;
}

/** Tiles each version lacks, and whether it is still open, for the calibration helpers below. */
function standing(held: Int8Array, versions: readonly Version[], unseen: ArrayLike<number>): { missed: number[]; open: boolean[]; best: number } {
  const missed = versions.map((version) => missing(version, held));
  const open = versions.map((version) => version.keys.every((key) => version.want[key]! - held[key]! <= unseen[key]!));
  let best = -1;
  missed.forEach((short, index) => {
    if (open[index] && (best < 0 || short < best)) best = short;
  });
  return { missed, open, best };
}

/**
 * Whether a seat playing only for `target` claims `tile` with `others` from
 * its `hand` for a meld: the simulation's own rule (a nearest open version
 * wants another `tile`, and the meld's other tiles), for the calibration run.
 */
export function targetClaim(
  hand: readonly string[],
  target: OddsTarget,
  unseen: ArrayLike<number>,
  tile: string,
  others: readonly string[],
): boolean {
  if (target.claims !== "any") return false;
  const held = countsOf(hand);
  const versions = target.versions.map(versionOf);
  const { missed, open, best } = standing(held, versions, unseen);
  const index = INDEX.get(tile);
  if (best < 0 || index === undefined) return false;
  return versions.some(
    (version, at) =>
      open[at] &&
      missed[at] === best &&
      version.want[index]! > held[index]! &&
      others.every((key) => version.want[INDEX.get(key) ?? 0]! >= 1),
  );
}

/**
 * The tile a seat playing only for `target` throws from `hand` (concealed
 * tile keys): the simulation's own rule, for the calibration run, which plays
 * a seat the way the simulation assumes. Null when the hand holds no tile.
 */
export function targetDiscard(hand: readonly string[], target: OddsTarget, unseen: ArrayLike<number>): string | null {
  const held = countsOf(hand);
  const versions = target.versions.map(versionOf);
  const { missed, open, best } = standing(held, versions, unseen);
  const need = new Float64Array(KINDS);
  if (best >= 0) needOf(held, versions, missed, (index) => open[index]!, best, need);
  let choice = -1;
  for (let tile = 0; tile < KINDS; tile++) {
    if (held[tile]! <= 0) continue;
    if (choice < 0 || need[tile]! < need[choice]!) choice = tile;
  }
  return choice < 0 ? null : PLAY_TILE_KEYS[choice]!;
}
