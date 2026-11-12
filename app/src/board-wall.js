/**
 * The wall on the 3D table: built once per hand where the dice put the break,
 * then shown as the engine's counts say. Methods of `Board` (see board.js),
 * which installs them on its prototype; `this` is the board.
 */

import { D, TABLE, makeTile, poseFaceDown } from "./tiles.js";
import { breakFor, wallLook, wallPlan, wallSlotX } from "./layout.js";
import { easeOutCubic, tween } from "./stage.js";

const SEATS = ["E", "S", "W", "N"];
const { WALL_STACKS, WALL_R } = TABLE;

export const wallMethods = {
  /**
   * 72 stacks of two, four walls of 18, broken where the book's dice put the
   * break (see `breakFor`, `wallPlan`). The break stack is lifted off; its two
   * tiles are the loose tiles, which lie on the dead wall's end column, the one
   * touching the break (two more meshes, `markers`). Nothing on the wall ever moves.
   */
  buildWall(key, dealer = "E", { closed = false } = {}) {
    const tiles = new Map();
    const at = (entry) => tiles.get(`${entry.rel}:${entry.slot}:${entry.level}`);
    for (let rel = 0; rel < 4; rel++) {
      for (let stack = 0; stack < WALL_STACKS; stack++) {
        for (const level of [0, 1]) {
          const tile = poseFaceDown(makeTile(null), wallSlotX(stack), D / 2 + level * D, WALL_R);
          this.frames[rel].add(tile);
          tiles.set(`${rel}:${stack}:${level}`, tile);
        }
      }
    }
    const { wallSeat, count, dice: breakDice } = breakFor(key);
    const builder = SEATS[(SEATS.indexOf(dealer) + wallSeat) % 4];
    const plan = wallPlan(this.rel(builder), count);
    const markers = { far: null, near: null };
    for (const which of ["far", "near"]) {
      markers[which] = poseFaceDown(makeTile(null), 0, 0, WALL_R);
      markers[which].visible = false;
      this.frames[plan.rel].add(markers[which]);
    }
    // The break stack is lifted off: at once, or (a `closed` wall, for the
    // opening) left standing until `breakWall` lifts it.
    const lifted = [0, 1].map((level) => at({ ...plan.lifted, level }));
    if (!closed) for (const tile of lifted) tile.visible = false;
    this.wall = {
      plan,
      builder,
      dice: breakDice,
      lifted: closed ? lifted : [],
      tiles: plan.tiles.map(at),
      markers,
      goneHead: 0,
      goneTail: 0,
      held: 0,
      used: 0,
      extent: [WALL_STACKS, WALL_STACKS, WALL_STACKS, WALL_STACKS],
    };
  },

  /**
   * Lift the break stack off a `closed` wall (I p. 19, rule 6), the two tiles
   * the loose tiles. `animated` false just takes it away. Resolves when it is
   * done; a wall already broken does nothing.
   */
  breakWall(animated) {
    const lifted = this.wall.lifted;
    this.wall.lifted = [];
    return lifted.map((tile) => {
      const restY = tile.position.y;
      const done = () => {
        tile.visible = false;
        tile.position.y = restY;
      };
      if (!animated) return Promise.resolve(done());
      return tween(tile.position, { y: restY + 1.2 }, 220, easeOutCubic).then(done);
    });
  },

  /**
   * Show the wall as the engine's counts say (`wallLook`): `front` tiles gone
   * from the open end, `used` loose tiles consumed, `held` loose tiles lying
   * on the block. Tiles that go vanish where they stand; the loose tiles
   * (re)appear on top of their stacks. Only the draw itself moves.
   */
  setWall(front, used, held, animated) {
    const wall = this.wall;
    const look = wallLook(wall.plan, front, used, held);
    const work = [];
    const changed =
      look.goneHead - wall.goneHead + (look.goneTail - wall.goneTail) + Math.abs(held - wall.held);
    const lift = (tile) => {
      const restY = tile.position.y;
      work.push(
        tween(tile.position, { y: restY + 1.2 }, 180, easeOutCubic).then(() => {
          tile.visible = false;
          tile.position.y = restY;
        }),
      );
    };
    const apply = (list, head, tail) => {
      list.forEach((tile, index) => {
        const visible = index >= head && index < list.length - tail;
        if (tile.visible === visible) return;
        if (!visible && animated && changed <= 4) lift(tile);
        else tile.visible = visible;
      });
    };
    apply(wall.tiles, look.goneHead, look.goneTail);
    // Loose tiles: new ones are set down on top; one used lifts away.
    const arrived = held - (wall.held - (used - wall.used));
    for (const which of ["far", "near"]) {
      const tile = wall.markers[which];
      const place = look.markers.find((marker) => marker.which === which);
      if (!place) {
        if (tile.visible) {
          if (animated && changed <= 4) lift(tile);
          else tile.visible = false;
        }
        continue;
      }
      const wasHere =
        tile.visible && tile.userData.rel === place.rel && tile.userData.slot === place.slot && tile.userData.level === place.level;
      // Past the wall's corner the end column is on the neighbouring wall.
      if (tile.parent !== this.frames[place.rel]) this.frames[place.rel].add(tile);
      tile.userData.rel = place.rel;
      tile.position.set(wallSlotX(place.slot), D / 2 + place.level * D, WALL_R);
      tile.userData.slot = place.slot;
      tile.userData.level = place.level;
      const restY = tile.position.y;
      const dropIn = animated && arrived > 0 && changed <= 4;
      tile.visible = true;
      if (dropIn || (!wasHere && animated && changed <= 4)) {
        tile.position.y = restY + 0.8;
        work.push(tween(tile.position, { y: restY }, 220, easeOutCubic));
      }
    }
    Object.assign(wall, { goneHead: look.goneHead, goneTail: look.goneTail, held, used });
    // The lane for melds is whatever is free at a wall's left end: one more
    // than the highest slot with anything standing on it.
    const extent = [0, 0, 0, 0];
    const note = (rel, slot) => {
      extent[rel] = Math.max(extent[rel], slot + 1);
    };
    wall.plan.tiles.slice(look.goneHead, wall.plan.tiles.length - look.goneTail).forEach((entry) => note(entry.rel, entry.slot));
    for (const place of look.markers) note(place.rel, place.slot);
    wall.extent = extent;
    return work;
  },
};
