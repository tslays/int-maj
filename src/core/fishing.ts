/**
 * Fishing is the printed state of needing one tile, announced.
 *
 * A player one tile from mah jong announces the wait. If another player wins,
 * every fishing player still scores their fishing figure — a "mini win".
 * Settlement is independent of the winner's hand. The announcement does not
 * restrict what the player may claim: a player needing one tile may take any
 * discard to win and has precedence (I p. 62), and may still pung, chow or
 * kong. There is no dead-wait rule in the printed pages.
 */

import { TIER_FISHING, type Tier } from "./patterns/types.ts";
import { parseTile, parseTiles, tileKey } from "./tiles.ts";

export type FishingValues = Readonly<Partial<Record<Tier, number | null>>>;

export interface FishingDeclaration {
  readonly player: string;
  /** Announced wait, canonical tile keys. */
  readonly wait: readonly string[];
  /** Tier of the hand being fished for. */
  readonly tier: Tier;
  /** Printed fishing figure for this hand; null when unscored. */
  readonly value?: number | null;
}

export interface DeclareFishingInput {
  readonly player: string;
  /** Announced wait: a tile spec ("o5") or a list of canonical keys. */
  readonly wait: string | readonly string[];
  readonly tier: Tier;
  /** Printed fishing figure for this hand. */
  readonly value?: number | null;
}

export function declareFishing(input: DeclareFishingInput): FishingDeclaration {
  const wait = (
    typeof input.wait === "string"
      ? parseTiles(input.wait)
      : input.wait.map((key) => parseTile(key))
  ).map(tileKey);

  if (wait.length === 0) {
    throw new Error("An announced fishing wait needs at least one wait tile");
  }

  return Object.freeze({
    player: input.player,
    wait: Object.freeze([...new Set(wait)]),
    tier: input.tier,
    value: input.value ?? null,
  });
}

export interface FishingAward {
  readonly player: string;
  readonly tier: Tier;
  /** Printed fishing figure, or null while the figure is unknown. */
  readonly points: number | null;
}

/**
 * Fishing awards for one win. The winner's own declaration is not paid: the
 * winner scores the hand, while every other fishing player scores the mini
 * win. A declaration's printed value wins over the tier table; the table is
 * only the fallback for callers that omitted it.
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
      points: declaration.value ?? values[declaration.tier] ?? null,
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
