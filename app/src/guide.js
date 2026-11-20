/**
 * The guide behind Help: a few tabs of short cards, each with a picture (real
 * tile faces, copies of the game's own buttons, a sketch of the table) and a
 * line or two of text, in place of one long page. Built on first open.
 *
 * Rule statements here stay within `rules/RULES.md`: the aim is R-016 and
 * R-019 (*Illustrated* p. 5, p. 14, p. 62), the pair R-021 (p. 15).
 */

import { tipsReset } from "./tips.js";
import { $, faceChip } from "./shared.js";
import { chanceBadge } from "./hints.js";
import { KEY_NOTES, SHORTCUTS } from "./keymap.js";

/* --------------------------------------------------------- pictures */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Tile faces in groups: `tiles([["c2","c3","c4"], ["wE","wE"]])`, an optional label under each. */
function tiles(groups, labels = []) {
  const row = el("div", "guide-tiles");
  groups.forEach((keys, index) => {
    const group = el("span", "guide-group");
    const faces = el("span", "guide-faces");
    for (const key of keys) faces.append(faceChip(key));
    group.append(faces);
    if (labels[index]) group.append(el("small", "", labels[index]));
    row.append(group);
  });
  return row;
}

/** A copy of one of the game's action buttons, inert. */
function act(label, kind, keys = []) {
  const button = el("span", `act act-${kind} guide-act`);
  button.setAttribute("aria-hidden", "true");
  if (label) button.append(el("span", "", label));
  if (keys.length > 0) {
    const row = el("span", "act-tiles");
    for (const key of keys) row.append(faceChip(key));
    button.append(row);
  }
  return button;
}

/** A copy of a menu button, inert; `on` lights its status light. */
function ghost(label, on) {
  const button = el("span", `ghost guide-ghost${on ? " on" : ""}`);
  if (on !== undefined) button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-hidden", "true");
  button.append(el("span", "", label));
  return button;
}

/** A row of pictures side by side. */
function row(...items) {
  const box = el("div", "guide-row");
  box.append(...items);
  return box;
}

/** The table from above: you at the bottom, the bots round it, the panel in the middle. */
function tableSketch() {
  const box = el("div", "guide-sketch");
  box.innerHTML = `
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <rect x="40" y="4" width="140" height="112" rx="10" fill="#1f6b5c" stroke="#0e3f36" stroke-width="2"/>
      <rect x="92" y="40" width="36" height="36" rx="4" fill="#11191c"/>
      <text x="110" y="56" fill="#8ccbea" font-size="7" text-anchor="middle" font-weight="700">EAST 1</text>
      <text x="110" y="68" fill="#e9e4d6" font-size="9" text-anchor="middle" font-weight="800">87</text>
      <rect x="66" y="12" width="88" height="5" rx="1" fill="#8ccbea"/>
      <rect x="48" y="28" width="5" height="62" rx="1" fill="#8ccbea"/>
      <rect x="167" y="28" width="5" height="62" rx="1" fill="#8ccbea"/>
      <rect x="66" y="96" width="88" height="5" rx="1" fill="#8ccbea"/>
      <g fill="#f8f6f0">
        <rect x="58" y="106" width="8" height="12" rx="1.5"/><rect x="68" y="106" width="8" height="12" rx="1.5"/>
        <rect x="78" y="106" width="8" height="12" rx="1.5"/><rect x="88" y="106" width="8" height="12" rx="1.5"/>
        <rect x="98" y="106" width="8" height="12" rx="1.5"/><rect x="108" y="106" width="8" height="12" rx="1.5"/>
        <rect x="118" y="106" width="8" height="12" rx="1.5"/><rect x="128" y="106" width="8" height="12" rx="1.5"/>
        <rect x="138" y="106" width="8" height="12" rx="1.5"/><rect x="148" y="106" width="8" height="12" rx="1.5"/>
      </g>
      <g font-size="9" font-weight="700" fill="#e9e4d6" text-anchor="middle">
        <text x="20" y="63">Bot</text><text x="200" y="63">Bot</text>
      </g>
      <text x="110" y="30" font-size="8" font-weight="700" fill="#e9e4d6" text-anchor="middle">Bot</text>
      <text x="200" y="114" font-size="9" font-weight="800" fill="#ffe08a" text-anchor="middle">You</text>
      <path d="M186 111 L162 111" stroke="#ffe08a" stroke-width="1.5" fill="none"/>
    </svg>`;
  return box;
}

/** A small icon in the game's blue line style. */
function icon(paths) {
  const box = el("div", "guide-icon");
  box.innerHTML = `<svg viewBox="0 0 48 48" fill="none" stroke="#8ccbea" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return box;
}

/** One lifted tile among others, with the two taps that throw it. */
function throwPicture() {
  const box = el("div", "guide-throw");
  const hand = el("div", "guide-faces");
  ["o2", "o3", "b5", "c7", "c8"].forEach((key, index) => {
    const chip = faceChip(key);
    if (index === 2) chip.classList.add("guide-lifted");
    hand.append(chip);
  });
  box.append(hand, el("small", "", "tap to lift · tap again to throw"));
  return box;
}

/** The closest-hands panel in small. */
function closestPicture() {
  const box = el("div", "guide-panel");
  box.append(el("b", "guide-panel-head", "Closest hands"));
  for (const [name, chance, line] of [
    ["Crazy Chows", 0.66, " · Concealed · 500"],
    ["Robin", 0.27, " · Concealed · 500"],
  ]) {
    const item = el("div", "guide-panel-row");
    const meta = el("small", "");
    meta.append(chanceBadge(chance), line);
    item.append(el("span", "", name), meta);
    box.append(item);
  }
  return box;
}

/** The five chance bands, best to lowest. */
function bandsPicture() {
  const box = el("div", "guide-bands");
  for (const chance of [0.6, 0.3, 0.1, 0.04, 0.01]) box.append(chanceBadge(chance));
  return box;
}

/** Every key, one row each (the "With a keyboard" card). */
function keyTable() {
  const list = el("dl", "guide-keys");
  for (const [keys, does] of SHORTCUTS) {
    const term = el("dt");
    for (const key of keys.split(/ +/)) {
      if (key === "or" || key === "–") term.append(` ${key} `);
      else term.append(el("kbd", "", key));
    }
    list.append(term, el("dd", "", does));
  }
  return list;
}

/**
 * A device with a mouse or trackpad, where a keyboard is likely; a phone or
 * tablet never sees the "With a keyboard" card.
 */
const hasKeyboard = () => window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches;

/* --------------------------------------------------------- the content */

/** Each tab: its name and cards; each card: a title, its text, and a picture. */
const TABS = [
  {
    name: "Basics",
    cards: [
      {
        title: "The aim",
        text: "Be first to complete a hand of 14 tiles: four sets and a pair, or one of the special hands. In an ordinary hand the suit tiles are all one suit; winds and dragons may join, and only one set may be a chow.",
        picture: () =>
          tiles(
            [
              ["c2", "c3", "c4"],
              ["c6", "c6", "c6"],
              ["c9", "c9", "c9"],
              ["dR", "dR", "dR"],
              ["wE", "wE"],
            ],
            ["chow", "pung", "pung", "pung", "pair"],
          ),
        wide: true,
      },
      {
        title: "The sets",
        text: "A pung is three alike, a kong four alike, a chow a run of three in one suit.",
        picture: () =>
          tiles(
            [
              ["o5", "o5", "o5"],
              ["b7", "b7", "b7", "b7"],
              ["c3", "c4", "c5"],
            ],
            ["pung", "kong", "chow"],
          ),
      },
      {
        title: "The table",
        text: "You sit at the bottom, three bots round the table. The middle panel shows the hand, the tiles left in the wall and every score; the dealer's wind is coral.",
        picture: tableSketch,
      },
      {
        title: "A turn",
        text: "The game draws your tile for you; then you throw one away. Everything you have no choice in happens by itself.",
        picture: () =>
          row(
            icon(
              '<rect x="6" y="10" width="14" height="20" rx="2"/><path d="M24 20h14M33 15l5 5-5 5"/><rect x="28" y="30" width="14" height="14" rx="2" opacity=".5"/>',
            ),
            el("span", "guide-step", "draw · throw"),
          ),
      },
    ],
  },
  {
    name: "Your turn",
    cards: [
      {
        title: "Throw a tile",
        text: "Tap a tile to lift it, tap it again to throw it. Or hold it and swipe up; slide back down to cancel. With a mouse, one click throws.",
        picture: throwPicture,
      },
      {
        title: "Arrange your hand",
        text: "Drag a tile sideways, any time. That turns Sort off, and it stays off, in later hands too, until you tap Sort to put the hand back in order.",
        picture: () => row(icon('<path d="M8 24h32M14 18l-6 6 6 6M34 18l6 6-6 6"/>'), ghost("Sort", true)),
      },
      {
        title: "Study the discards",
        text: "Tap the middle of the table to see every seat's discards large, from above. Tap again to go back. The newest discard rests on a light plate.",
        picture: () => icon('<circle cx="21" cy="21" r="11"/><path d="M29 29l11 11"/><path d="M17 21h8M21 17v8"/>'),
      },
      {
        id: "keyboard",
        title: "With a keyboard",
        text: KEY_NOTES.join(" "),
        picture: keyTable,
        wide: true,
        when: hasKeyboard,
      },
    ],
  },
  {
    name: "Calls",
    intro: "Buttons appear above your hand, with a chime, only when you have a choice.",
    cards: [
      {
        title: "Take a discard",
        text: "Each button shows the set the tile just thrown would make. Pung or Chow takes it; when it fits more than one run, each run has its own Chow button.",
        picture: () => row(act("Pung", "claim", ["o4", "o4", "o4"]), act("Chow", "claim", ["o2", "o3", "o4"]), act("Chow", "claim", ["o3", "o4", "o5"])),
      },
      {
        title: "Let it go",
        text: "Pass lets the tile go by. Turn Calls off in the menu and you are only asked about Mah Jong.",
        picture: () => row(act("Pass", "pass"), ghost("Calls", false)),
      },
      {
        title: "Kong",
        text: "Four alike in your hand, or the fourth tile to a pung you have shown: declare a kong.",
        picture: () => act("Kong", "claim", ["b7"]),
      },
      {
        title: "Fishing",
        text: "One tile from winning: announce it, or keep it to yourself. The tiles shown are the ones you wait on. A seat that announced shows a small fish on the middle console. With the house rule Announce fishing to win, only an announced hand may go out.",
        picture: () => row(act("Fishing", "claim", ["c3", "c6"]), act("Don't announce", "pass")),
      },
      {
        title: "Mah Jong",
        text: "Your hand is complete: declare the win, from the wall or on a discard.",
        picture: () => act("Mah Jong", "win"),
      },
      {
        title: "A Goulash",
        text: "A redeal with a pass: the table shows GOULASH, and NO HALF LIMIT while those hands are barred. A chow cannot win there in Ordinary or Purity.",
        picture: () => act("Pass 3 tiles", "claim"),
      },
      {
        title: "Now and then",
        text: "Reshuffle: on your first turn, ask for a new deal when it gives you nothing to build on. Pass 3 tiles: in a Goulash (above), tap three tiles to pass on, then confirm; drag sideways to arrange the hand meanwhile. The tiles you receive are marked in teal.",
        picture: () => row(act("Reshuffle", "pass"), act("Pass 3 tiles", "claim")),
      },
    ],
  },
  {
    name: "Helpers",
    cards: [
      {
        title: "Closest hands",
        text: "Top right: the hands your tiles could build, likeliest first, often ones you would not have thought of. Tap one for its sheet; the pin keeps it in the panel. Hints in the menu shows or hides it.",
        picture: closestPicture,
      },
      {
        title: "The ring",
        text: "How likely you are to build that hand by playing only for it until the wall runs out. Worked out from what you can see, by playing the hand out up to two thousand times. Another player going out first is not counted.",
        picture: bandsPicture,
      },
      {
        title: "Arrows and gone tiles",
        text: "An arrow: the hand moved a band since your last move. If every copy of a tile it needs is in sight, the panel shows its nearest version still open; the sheet says why. Out of reach: more than six tiles away, or no longer possible.",
        picture: () => row(el("span", "guide-arrow guide-up", "\u25b2"), el("span", "guide-arrow guide-down", "\u25bc")),
      },
      {
        title: "Hint style",
        text: "In Settings. Likeliest: the hands you are most likely to build. Mixed: adds one idea you may not have thought of, marked with a spark. Discovery: only such ideas. The ring is truthful in every style.",
        picture: () => row(ghost("Likeliest"), ghost("Mixed", true), ghost("Discovery")),
      },
      {
        title: "All hands",
        text: "Start screen or Settings. Every hand in play, with the book's sample. Search by name or tiles (\"dragon pairs\", \"1-9\") and filter; during a hand each card says how likely your tiles are to build it, so you can explore hands you would not normally try.",
        picture: () =>
          row(
            el("span", "guide-search", "All hands"),
            icon('<circle cx="21" cy="21" r="11"/><path d="M29 29l11 11"/>'),
          ),
      },
      {
        title: "Practice",
        text: "On the start screen: name the hand, find the winning tile, or pick the best aim for a dealt hand. Your streak and the hands you missed are kept on this device; missed ones come back sooner.",
        picture: () => row(ghost("Name the hand", true), ghost("Winning tile"), ghost("Best aim")),
      },
      {
        title: "After a hand",
        text: "The result shows the winning hand and every seat's change; tap a seat to see who paid what, and why. Play this hand again deals the same tiles for another try and keeps the scores from before it.",
        picture: () => row(act("Next hand", "win")),
      },
    ],
  },
  {
    name: "More",
    cards: [
      {
        title: "Start screen",
        text: "Every visit opens it: Continue a saved game, Play vs bots at a level of your choice, Play with friends, Practice, and links to this guide, all hands and Settings. Menu, then Main menu, brings it back.",
        picture: () => row(act("Continue", "win"), act("Play", "claim")),
      },
      {
        title: "Play with friends",
        text: "Start a room and share its four-letter code or link; up to four people, each on their own phone. Empty seats, and seats of anyone who drops out, are played by bots. A timer pill shows the time left to move.",
        picture: () => row(act("New room", "win"), el("span", "guide-search", "Code")),
      },
      {
        title: "Hands in play",
        text: "Settings, Rules: All hands, the Companion's only, only the pictured ones, or Rare, which drops the easy hands. Two switches: no half-limit hands in a Goulash, and Announce fishing to win. Changes apply from the next deal.",
        picture: () => row(ghost("All", true), ghost("Companion"), ghost("Rare")),
      },
      {
        title: "Table settings",
        text: "Settings, Table: sound, tile numbers (a large rank or wind letter in each tile's corner, for those who don't read the characters; off gives clean tiles), large discards (the latest at twice the size), and discards in Rows, which show who threw what, or a Pile like a real table. Game has pace, table animations and the bots' level.",
        picture: () => row(ghost("Rows", true), ghost("Pile")),
      },
      {
        title: "Style",
        text: "Settings, Style: pick a theme, Classic, Midnight, Sakura or Casino, or mix your own table felt, tile backs and fronts, room and button colours. The table changes at once.",
        picture: () => row(ghost("Classic", true), ghost("Midnight"), ghost("Sakura")),
      },
      {
        title: "The menu",
        text: "Calls, Sort and Hints switch on and off; a green light is on. Settings has everything else, with a button to reset it all.",
        picture: () => row(ghost("Calls", true), ghost("Hints", true), ghost("Settings")),
      },
      {
        title: "Saving",
        text: "The game saves after every move, on this device only, and picks up where you left off.",
        picture: () => icon('<path d="M10 8h22l6 6v26H10z"/><path d="M16 8v10h14V8M16 40V28h16v12"/>'),
      },
      {
        title: "On your phone",
        text: "Play with the phone on its side. Add it to the home screen (iPhone: Share; Android: the browser menu) and it runs full screen and offline.",
        picture: () => icon('<rect x="6" y="14" width="36" height="20" rx="4"/><path d="M36 21v6"/>'),
      },
      {
        title: "Report a problem",
        text: "Settings, then Report a problem: add a line if you like and Send. It goes to the developers with the build, your device and this game's moves; no name or account.",
        picture: () => icon('<path d="M10 10h28v20H22l-8 7v-7h-4z"/><path d="M24 15v7M24 26v.5"/>'),
      },
      {
        title: "First-game tips",
        text: "Short tips pop up the first time something new happens at the table.",
        picture: () => {
          const button = el("button", "ghost guide-tips", undefined);
          button.type = "button";
          button.append(el("span", "", "Show tips again"));
          button.addEventListener("click", () => {
            tipsReset();
            button.firstElementChild.textContent = "Tips are back";
            button.disabled = true;
          });
          return button;
        },
      },
    ],
  },
];

/* --------------------------------------------------------- the sheet */

let current = 0;

function showTab(index) {
  current = index;
  const tabs = $("#guide-tabs");
  [...tabs.children].forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  const body = $("#guide-body");
  body.replaceChildren();
  const tab = TABS[index];
  if (tab.intro) body.append(el("p", "guide-intro", tab.intro));
  const grid = el("div", "guide-grid");
  // A card with `when` shows only where it holds (the keyboard card: only with a mouse).
  for (const card of tab.cards.filter((item) => item.when === undefined || item.when())) {
    const box = el("section", `guide-card-item${card.wide ? " guide-wide" : ""}`);
    if (card.id) box.id = `guide-${card.id}`;
    const picture = el("div", "guide-picture");
    picture.append(card.picture());
    box.append(picture, el("h3", "", card.title), el("p", "", card.text));
    grid.append(box);
  }
  body.append(grid);
  if (index < TABS.length - 1) {
    const next = el("button", "guide-next");
    next.type = "button";
    next.textContent = `Next: ${TABS[index + 1].name} ›`;
    next.addEventListener("click", () => {
      showTab(index + 1);
      tabs.children[index + 1].focus({ preventScroll: true });
    });
    body.append(next);
  }
  // .guide-body is the element that scrolls; .guide-card is not.
  $("#guide-body").scrollTop = 0;
}

function build() {
  const tabs = $("#guide-tabs");
  if (tabs.childElementCount > 0) return;
  TABS.forEach((tab, index) => {
    const button = el("button", "guide-tab", tab.name);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => showTab(index));
    tabs.append(button);
  });
  tabs.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const index = (current + step + TABS.length) % TABS.length;
    showTab(index);
    tabs.children[index].focus();
  });
}

/**
 * Open the guide, at its first tab, or at the card whose `id` is given
 * ("keyboard", from the keyboard tip), scrolled into view. A click handler
 * passes its event, which opens the first tab.
 */
export function openGuide(cardId) {
  build();
  const id = typeof cardId === "string" ? cardId : null;
  const at = id === null ? -1 : TABS.findIndex((tab) => tab.cards.some((card) => card.id === id));
  showTab(Math.max(0, at));
  $("#help-sheet").hidden = false;
  $("#help-close").focus();
  if (at >= 0) $(`#guide-${id}`)?.scrollIntoView({ block: "nearest" });
}
