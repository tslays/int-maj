/**
 * One line of plain text per action and per public event. The table service
 * sends these to the app's log, the console table prints them, and the replay
 * tool writes them; none of them ever names a concealed tile.
 */

import type { Action } from "./actions.ts";
import type { Event } from "./events.ts";

/** Compact action summary for watch mode; events carry the detail. */
export function formatAction(action: Action): string {
  switch (action.type) {
    case "Draw":
      return `${action.seat} draws`;
    case "Discard":
      return `${action.seat} discards ${action.tile}`;
    case "Claim":
      return `${action.seat} claims ${action.kind} ${action.tiles.join(" ")}`;
    case "DeclareFishing":
      return `${action.seat} fishes ${action.wait.join(" ")}`;
    case "ConcealedKong":
      return `${action.seat} declares a concealed kong ${action.tile}`;
    case "AddedKong":
      return `${action.seat} adds to a kong ${action.tile}`;
    case "Pass":
      return `${action.seat} passes`;
    case "Win":
      return `${action.seat} declares mahjong (${action.kind})`;
  }
}

/** Shared with bin/replay.ts: one printed line per public event. */
export function describeEvent(event: Event): string {
  switch (event.type) {
    case "Dealt":
      return `${event.seat} is dealt ${event.count} tiles`;
    case "Drew":
      return `${event.seat} draws ${event.tile}${event.end === "loose" ? " from the loose tiles" : ""}`;
    case "FlowerReplaced":
      return `${event.seat} replaces ${event.tile} with ${event.replacement}`;
    case "Discarded":
      return `${event.seat} discards ${event.tile}`;
    case "Promoted":
      return `${event.seat} takes the turn from ${event.from} (${event.kind})`;
    case "Claimed":
      return `${event.seat} claims ${event.kind} ${event.tiles.join(" ")} from ${event.from}`;
    case "KongDeclared":
      return `${event.seat} declares a ${event.kind} kong of ${event.tile}`;
    case "KongReplacementDrawn":
      return `${event.seat} draws the loose tile ${event.tile}`;
    case "FishingDeclared":
      return `${event.seat} announces fishing on ${event.wait.join(" ")} (${event.tier})`;
    case "WinDeclared":
      return (
        `${event.seat} wins ${event.selfDrawn ? "self-drawn" : `on ${event.from}'s discard`}` +
        ` with ${event.patternId} (${event.tier}${event.points === null ? ", calculate" : ` ${event.points}`})`
      );
    case "HandScored":
      return (
        `  score: ${event.patternName} — ${event.tier}` +
        (event.points === null ? " (calculate)" : ` ${event.points}`)
      );
    case "Payments":
      return event.entries
        .map(
          (entry) =>
            `  ${entry.from} pays ${entry.to} ${entry.points === null ? "calculate" : entry.points} (${entry.reason})`,
        )
        .join("\n");
    case "DrawnHand":
      return `drawn hand: ${event.reason}`;
    case "NextDeal":
      return `next deal: hand ${event.hand}, dealer ${event.dealer}`;
  }
}
