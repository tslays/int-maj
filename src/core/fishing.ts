/**
 * Fishing is a declaration, not a way of winning.
 *
 * A player one tile from mah jong announces "fishing" and fixes the wait. If
 * another player wins, every fishing player still scores the fishing value for
 * their tier — a "mini win". Settlement is therefore independent of the
 * winner's hand. A declaration is illegal once every copy of the needed tile
 * is dead (book p. 34).
 */

import { TIER_FISHING, type Tier } from "./patterns/types.ts";
import { parseTile, parseTiles, tileKey } from "./tiles.ts";

export type FishingValues = Readonly<Partial<Record<Tier, number | null>>>;

export interface FishingDeclaration {
  readonly player: string;
  /** Fixed wait, canonical tile keys. */
  readonly wait: readonly string[];
  /** Tier of the hand being fished for. */
  readonly tier: Tier;
}

export interface DeclareFishingInput {
  readonly player: string;
  /** Fixed wait: a tile spec ("o5") or a list of canonical keys. */
  readonly wait: string | readonly string[];
  readonly tier: Tier;
  /** Known-dead copies per tile key (0..4). Omitted keys are live. */
  readonly deadTiles?: Readonly<Record<string, number>>;
}

/** True while at least one copy of at least one wait tile is still live. */
export function isWaitAlive(
  wait: readonly string[],
  deadTiles: Readonly<Record<string, number>> = {},
): boolean {
  return wait.some((key) => (deadTiles[key] ?? 0) < 4);
}

export function declareFishing(input: DeclareFishingInput): FishingDeclaration {
  const wait = (
    typeof input.wait === "string"
      ? parseTiles(input.wait)
      : input.wait.map((key) => parseTile(key))
  ).map(tileKey);

  if (wait.length === 0) {
    throw new Error("A fishing declaration needs at least one wait tile");
  }
  if (!isWaitAlive(wait, input.deadTiles)) {
    throw new Error("Every copy of the wait is dead");
  }

  return Object.freeze({
    player: input.player,
    wait: Object.freeze([...new Set(wait)]),
    tier: input.tier,
  });
}

export interface FishingAward {
  readonly player: string;
  readonly tier: Tier;
  /** Fishing value for the tier, or null while the book's figure is unknown. */
  readonly points: number | null;
}

/**
 * Fishing awards for one win. The winner's own declaration is not paid: the
 * winner scores the hand, while every other fishing player scores the mini
 * win. Pass `values` to supply the circle's fishing figures.
 */
export function settleFishing(
  declarations: readonly FishingDeclaration[],
  winnerPlayer: string,
  values: FishingValues = TIER_FISHING,
): FishingAward[] {
  return declarations
    .filter((declaration) => declaration.player !== winnerPlayer)
    .map((declaration) => ({
      player: declaration.player,
      tier: declaration.tier,
      points: values[declaration.tier] ?? null,
    }));
}

/** Sum of known fishing awards, plus how many awards are still unknown. */
export function fishingTotal(awards: readonly FishingAward[]): {
  readonly points: number;
  readonly unknown: number;
} {
  let points = 0;
  let unknown = 0;
  for (const award of awards) {
    if (award.points === null) unknown++;
    else points += award.points;
  }
  return { points, unknown };
}
