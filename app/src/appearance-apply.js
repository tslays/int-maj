/**
 * Paints the look chosen in Settings, Style (`appearance.js`) onto the 3D
 * table, the tiles and the page: the CSS colour tokens, the browser's theme
 * colour, the felt, the rail and the room. Applied once at boot, before the
 * first frame, and again on every change.
 */

import { appearance } from "./appearance.js";
import { setTableLook } from "./stage.js";
import { setTileLook } from "./tiles.js";

function applyLook() {
  const felt = appearance.felt.swatch;
  const back = appearance.back.swatch;
  const front = appearance.front.swatch;
  const room = appearance.room.swatch;
  const accent = appearance.accent.swatch;
  setTableLook({ felt, room });
  setTileLook({ back: back.tile, front: front.tile });
  const tokens = {
    "--tile-back": back.chip,
    "--tile-front": front.chip,
    "--page-bg": room.floor,
    "--rail": room.rail,
    "--felt-1": felt.stops[0],
    "--felt-2": felt.stops[1],
    "--felt-3": felt.stops[2],
    "--gold-1": accent.gold[0],
    "--gold-2": accent.gold[1],
    "--blue-1": accent.blue[0],
    "--blue-2": accent.blue[1],
    "--silver-1": accent.silver[0],
    "--silver-2": accent.silver[1],
  };
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(tokens)) style.setProperty(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", room.floor);
}

/** Dress the table now and follow every change. */
export function installAppearance() {
  applyLook();
  appearance.onChange(applyLook);
}
