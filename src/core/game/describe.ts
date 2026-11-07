/**
 * One line of plain text per action and per event.
 *
 * `describeEvent` is the omniscient text the replay tool prints: it names
 * every drawn and exchanged tile. `describeEventFor` is what one seat may
 * read: another seat's drawn, replacement and exchanged tiles stay hidden.
 * Anything sent to a player - the app's log, the console table - must use
 * `describeEventFor`.
 */

import type { Action } from "./actions.ts";
import type { Event } from "./events.ts";
import type { Seat } from "./state.ts";

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
    case "GoulashExchange":
      return `${action.seat} passes three tiles for the Goulash`;
    case "RequestReshuffle":
      return `${action.seat} asks for a reshuffle`;
    case "FalseMahJong":
      return `${action.seat} declares a false Mah Jong`;
    default:
      return `${(action as Action).seat} ${(action as Action).type}`;
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
    case "GoulashExchanged":
      return `Goulash ${event.stage + 1}: ${event.a.seat} gives ${event.a.tiles.join(" ")}, ${event.b.seat} gives ${event.b.tiles.join(" ")}`;
    case "Reshuffled":
      return `${event.seat} asks for a reshuffle: hand ${event.hand} is dealt again`;
    case "DrawnHand":
      return `drawn hand: ${event.reason}`;
    case "NextDeal":
      return `next deal: hand ${event.hand}, dealer ${event.dealer}`;
    default:
      // A new event type must never break a log: name it rather than crash.
      return (event as Event).type;
  }
}

/** The text of `event` as `viewer` may read it: no other seat's hidden tile. */
export function describeEventFor(event: Event, viewer: Seat): string {
  switch (event.type) {
    case "Drew":
      if (event.seat === viewer) break;
      return `${event.seat} draws a tile${event.end === "loose" ? " from the loose tiles" : ""}`;
    case "FlowerReplaced":
      // The bonus tile goes face up on the table; its replacement does not.
      if (event.seat === viewer) break;
      return `${event.seat} sets aside ${event.tile} and draws a replacement`;
    case "KongReplacementDrawn":
      if (event.seat === viewer) break;
      return `${event.seat} draws a loose tile`;
    case "GoulashExchanged": {
      const own = [event.a, event.b].find((side) => side.seat === viewer);
      const other = [event.a, event.b].find((side) => side.seat !== viewer);
      if (own === undefined || other === undefined) {
        return `Goulash ${event.stage + 1}: ${event.a.seat} and ${event.b.seat} exchange three tiles`;
      }
      // You know what you gave and what you received; nobody else's tiles.
      return `Goulash ${event.stage + 1}: you give ${own.tiles.join(" ")} to ${other.seat} and receive ${other.tiles.join(" ")}`;
    }
    default:
      break;
  }
  return describeEvent(event);
}
