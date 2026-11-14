/**
 * The table's sound: every effect is synthesised live with Web Audio, so there
 * are no audio files to ship, cache or license, and the game stays offline.
 * The one exception is the dice, a short recording of real dice (CC0, in
 * assets/sounds, cached with the app): a rattle is too irregular to synthesise.
 *
 * The rhythm of a game, in the order you hear it:
 *
 *   draw       a soft, low lift of a tile from the wall (a bot's, or yours settling)
 *   clack      a weighty plastic tile landing on felt: a round, low thump (a
 *              little knock and the felt thud under it), the game's base beat
 *   dice       two dice thrown: a recording of real dice (the only sound not synthesised)
 *   meld       the tiles of a call set down together
 *   tick       the very quiet click of a hand tile under your pointer / finger
 *   stick      a dyed counter stick landing on the result card: a light, dry wooden tock
 *   alert      the bright two-note chime when the game asks you to decide
 *
 * Sounds are cued by name (`sound.cue("clack", { delay, pan, far })`) and
 * scheduled on the audio clock, so a clack lands exactly with the tile it
 * belongs to. The browser only lets a page play after a user gesture, so the
 * engine unlocks on the first tap, key or click; cues before that are dropped.
 *
 * `createVoices` is separate from the engine so it can be driven with any
 * `BaseAudioContext`, including an `OfflineAudioContext` that renders a cue to
 * a buffer.
 */

import { browserStorage, storedString } from "./prefs.js";

const MUTE_KEY = "int-maj.sound";
const LEAD = 0.004; // seconds between "now" and the earliest sound
const IDLE_MS = 5000; // quiet this long and the audio context is suspended
const FLOOR = 0.0001; // exponential ramps cannot reach zero

/** The recordings, by cue: files beside the app, fetched and decoded at the first gesture. */
export const SAMPLE_FILES = { dice: ["dice-1.mp3", "dice-2.mp3", "dice-3.mp3", "dice-4.mp3"] };

async function fetchSample(name) {
  const response = await globalThis.fetch(new URL(`../assets/sounds/${name}`, import.meta.url));
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.arrayBuffer();
}

/** Cues that may not repeat faster than this many milliseconds. */
const MIN_GAP = { tick: 22, swap: 45, draw: 30, press: 40, stick: 35 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/* --------------------------------------------------------- building blocks */

const noiseBuffers = new WeakMap();

/** Two seconds of white noise, made once per context. */
function noiseBuffer(ctx, random) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

function envelope(param, t, peak, attack, decay) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

export function createVoices(ctx, out, random = Math.random, samples = { dice: [] }) {
  /** A short filtered noise burst. */
  function burst(bus, t, { type = "bandpass", freq, q = 1, gain, attack = 0.001, decay }) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, random);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    envelope(amp.gain, t, gain, attack, decay);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    source.start(t, random() * 1.5);
    source.stop(t + attack + decay + 0.03);
  }

  /** A short pitched tone, optionally sweeping down (or up) to `to`. */
  function tone(bus, t, { freq, to = null, sweep = 0.05, gain, attack = 0.001, decay, type = "sine" }) {
    if (freq > 14000) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(to, t + sweep);
    const amp = ctx.createGain();
    envelope(amp.gain, t, gain, attack, decay);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(t);
    osc.stop(t + attack + decay + 0.03);
  }

  /**
   * One sound's own signal path: level, a lowpass (`top`, Hz) that darkens it
   * further with distance (`far`, 0..1) and a pan. Returns the node to connect
   * sources to.
   */
  function lane({ pan = 0, far = 0, gain = 1, top = 11000 } = {}) {
    const input = ctx.createGain();
    input.gain.value = gain * (1 - 0.25 * far);
    const dark = ctx.createBiquadFilter();
    dark.type = "lowpass";
    dark.frequency.value = top - far * top * 0.45;
    dark.Q.value = 0.5;
    input.connect(dark);
    let tail = dark;
    if (pan !== 0 && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      dark.connect(panner);
      tail = panner;
    }
    tail.connect(out);
    return input;
  }

  /** A struck-bell tone: inharmonic partials that fade faster the higher they are. */
  function bell(bus, t, freq, { gain = 0.3, decay = 0.5 } = {}) {
    const partials = [
      [1, 1, 1],
      [2.01, 0.28, 0.55],
      [2.76, 0.22, 0.35],
      [4.2, 0.08, 0.2],
      [5.4, 0.05, 0.14],
    ];
    for (const [ratio, level, life] of partials) {
      tone(bus, t, { freq: freq * ratio, gain: gain * level, attack: 0.002, decay: decay * life });
    }
  }

  /* ----------------------------------------------------- the tile on felt */

  /**
   * A weighty plastic tile landing on smooth felt: the base beat of the game,
   * so it sits low and round and never sharp. A soft mid "tok" from the tile's
   * edge (felt takes the sting out), the knock of the plastic body falling in
   * pitch, and the dull thud of the felt and table under it carrying most of
   * the weight. The top end is rolled off, and every hit is nearly the same,
   * a little different, like a drummer's.
   */
  function clack(t, { intensity = 1, pan = 0, far = 0 } = {}) {
    const v = 0.55 + 0.45 * clamp(intensity, 0, 1.2);
    const k = 1 + (random() - 0.5) * 0.08;
    const bus = lane({ pan, far, top: 3600, gain: 0.9 * (0.94 + random() * 0.12) });
    burst(bus, t, { freq: 1400 * k, q: 0.8, gain: 0.3 * v, attack: 0.0008, decay: 0.014 });
    tone(bus, t, { freq: 400 * k, to: 190 * k, sweep: 0.06, gain: 0.75 * v, decay: 0.09 });
    tone(bus, t, { freq: 820 * k, gain: 0.1 * v, decay: 0.03 });
    burst(bus, t, { type: "lowpass", freq: 300, q: 0.7, gain: 0.5 * v, attack: 0.001, decay: 0.07 });
    tone(bus, t, { freq: 150 * k, to: 80, sweep: 0.09, gain: 0.36 * v, decay: 0.1 });
  }

  /**
   * Two dice thrown, rattling and settling: a real recording (four takes,
   * CC0, from freesound.org, see assets/sounds/LICENSE.md; a rattle is too
   * irregular to synthesise well), a different take each time. It is played
   * faster or slower so that it ends about when the dice do (`span`,
   * seconds), and a few percent either way. Silent until the recordings are
   * decoded, which happens at the first gesture.
   */
  function dice(t, { span = 0.5, intensity = 1, pan = 0, far = 0 } = {}) {
    const takes = samples.dice;
    if (takes.length === 0) return;
    const buffer = takes[Math.floor(random() * takes.length)];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clamp((buffer.duration / span) * (0.94 + random() * 0.12), 0.7, 1.6);
    source.connect(lane({ pan, far, gain: clamp(intensity, 0, 1.2) }));
    source.start(t);
  }

  /** Tiles set down together: a call's tiles landing a hair apart. */
  function meld(t, { count = 3, intensity = 0.9, pan = 0, far = 0 } = {}) {
    for (let index = 0; index < count; index++) {
      const last = index === count - 1;
      clack(t + index * 0.021 + random() * 0.008, {
        intensity: intensity * (last ? 1 : 0.78),
        pan: pan + (index - (count - 1) / 2) * 0.05,
        far,
      });
    }
  }

  /** The wall dealt out and washed: a quick rattle of tiles, ending in two firm knocks. */
  function deal(t) {
    for (let index = 0; index < 13; index++) {
      clack(t + index * 0.047 + random() * 0.03, {
        intensity: 0.1 + random() * 0.25,
        pan: (random() - 0.5) * 1.4,
        far: 0.35,
      });
    }
    clack(t + 0.7, { intensity: 0.55, pan: -0.15, far: 0.1 });
    clack(t + 0.77, { intensity: 0.6, pan: 0.15, far: 0.1 });
  }

  /** A tile lifted off the wall, or sliding into your rack: a soft, low brush and tap. */
  function draw(t, { own = false, pan = 0, far = 0 } = {}) {
    const bus = lane({ pan, far, top: 3000, gain: own ? 1.0 : 0.7 });
    burst(bus, t, { freq: own ? 1100 : 900, q: 0.8, gain: 0.22, attack: 0.002, decay: own ? 0.032 : 0.026 });
    tone(bus, t, { freq: own ? 360 : 320, to: 200, sweep: 0.035, gain: 0.35, decay: 0.05 });
    burst(bus, t, { type: "lowpass", freq: 280, gain: 0.3, attack: 0.002, decay: 0.04 });
  }

  /* ----------------------------------------------------- the hand and buttons */

  /**
   * The very quiet click of a tile under the pointer. `pitch` (0..1, left to
   * right along the hand) moves it a little, so sweeping the hand ripples.
   */
  function tick(t, { pitch = 0.5, level = 1 } = {}) {
    const p = clamp(pitch, 0, 1);
    const bus = lane({ gain: 1.0 * level });
    burst(bus, t, { freq: 3600 + p * 1600, q: 2.2, gain: 0.4, attack: 0.0003, decay: 0.007 });
    tone(bus, t, { freq: 2300 + p * 700, to: 1900 + p * 500, sweep: 0.008, gain: 0.06, decay: 0.012 });
  }

  /** Two tiles trading places: a slightly lower, woodier double click. */
  function swap(t) {
    const bus = lane({ gain: 1.0 });
    burst(bus, t, { freq: 2500, q: 1.6, gain: 0.3, attack: 0.0004, decay: 0.01 });
    tone(bus, t, { freq: 1500, to: 1100, sweep: 0.012, gain: 0.1, decay: 0.022 });
    burst(bus, t + 0.026, { freq: 3000, q: 1.6, gain: 0.22, attack: 0.0004, decay: 0.008 });
  }

  /** A tile leaving your rack as you throw it: a short, low pluck. */
  function lift(t) {
    const bus = lane({ gain: 1.0 });
    burst(bus, t, { freq: 2100, q: 1.2, gain: 0.26, attack: 0.001, decay: 0.014 });
    tone(bus, t, { freq: 700, to: 380, sweep: 0.025, gain: 0.2, decay: 0.035 });
  }

  /** A button press: a firm but small tap. */
  function press(t) {
    const bus = lane({ gain: 1.0 });
    burst(bus, t, { freq: 2800, q: 1.4, gain: 0.32, attack: 0.0005, decay: 0.01 });
    tone(bus, t, { freq: 1100, to: 700, sweep: 0.02, gain: 0.18, decay: 0.04 });
  }

  /**
   * A counter stick landing in a player's pile on the result card: a light,
   * dry wooden tock, higher and shorter than a tile's clack. `value` (the
   * stick's points) lowers it a little for the heavier sticks.
   */
  function stick(t, { pan = 0, value = 100 } = {}) {
    const weight = clamp(Math.log10(Math.max(100, value) / 100) / Math.log10(40), 0, 1);
    const bus = lane({ pan, gain: 0.8 });
    burst(bus, t, { freq: 3200 - weight * 900, q: 2.4, gain: 0.3, attack: 0.0004, decay: 0.009 });
    tone(bus, t, { freq: 1250 - weight * 380, to: 900 - weight * 300, sweep: 0.018, gain: 0.16, decay: 0.03 });
    burst(bus, t + 0.018, { freq: 3800 - weight * 900, q: 2.4, gain: 0.12, attack: 0.0004, decay: 0.006 });
  }

  /* ----------------------------------------------------- being asked, and results */

  /**
   * "Be aware": two quick rising bell notes, a fifth apart, bright and clear
   * so that it carries over the clacking. Every call you can make plays it.
   */
  function alert(t) {
    const bus = lane({ gain: 0.85 });
    bell(bus, t, 1568, { gain: 0.3, decay: 0.42 });
    bell(bus, t + 0.095, 2349, { gain: 0.34, decay: 0.55 });
  }

  /** Mah Jong is on offer: the same chime, climbing one note further with a shimmer. */
  function alertWin(t) {
    const bus = lane({ gain: 0.85 });
    bell(bus, t, 1568, { gain: 0.28, decay: 0.42 });
    bell(bus, t + 0.085, 2093, { gain: 0.3, decay: 0.5 });
    bell(bus, t + 0.17, 2637, { gain: 0.34, decay: 0.8 });
    bell(bus, t + 0.17, 3136, { gain: 0.14, decay: 0.9 });
  }

  /** An opponent called: a soft, low bell to go with the call-out. */
  function notice(t, { pan = 0 } = {}) {
    const bus = lane({ pan, far: 0.2, gain: 0.55 });
    bell(bus, t, 784, { gain: 0.2, decay: 0.3 });
    bell(bus, t + 0.07, 1047, { gain: 0.2, decay: 0.38 });
  }

  /** Someone declared fishing: a quiet rising pair. */
  function fishing(t, { pan = 0 } = {}) {
    const bus = lane({ pan, far: 0.15, gain: 0.55 });
    bell(bus, t, 1175, { gain: 0.2, decay: 0.3 });
    bell(bus, t + 0.08, 1760, { gain: 0.22, decay: 0.4 });
  }

  /** You win: the hand is flipped over (a clatter of tiles), then a rising chime. */
  function win(t) {
    for (let index = 0; index < 7; index++) {
      clack(t + index * 0.042 + random() * 0.02, { intensity: 0.5 + random() * 0.3, pan: (random() - 0.5) * 0.8 });
    }
    const bus = lane({ gain: 0.9 });
    const notes = [1047, 1319, 1568, 2093, 2637];
    notes.forEach((freq, index) => bell(bus, t + 0.32 + index * 0.085, freq, { gain: 0.26, decay: 0.7 + index * 0.1 }));
    const finish = t + 0.32 + notes.length * 0.085;
    for (const freq of [1047, 1568, 2093]) bell(bus, finish, freq, { gain: 0.16, decay: 1.6 });
  }

  /** An opponent wins: the clatter, then two gentle falling notes. */
  function lose(t) {
    for (let index = 0; index < 5; index++) {
      clack(t + index * 0.045 + random() * 0.02, { intensity: 0.4 + random() * 0.25, pan: (random() - 0.5) * 0.8, far: 0.2 });
    }
    const bus = lane({ gain: 0.7 });
    bell(bus, t + 0.28, 988, { gain: 0.2, decay: 0.55 });
    bell(bus, t + 0.4, 740, { gain: 0.2, decay: 0.75 });
  }

  /** A drawn hand: two soft falling notes, no clatter. */
  function drawn(t) {
    const bus = lane({ gain: 0.6 });
    bell(bus, t, 880, { gain: 0.2, decay: 0.5 });
    bell(bus, t + 0.16, 659, { gain: 0.2, decay: 0.8 });
  }

  return { clack, dice, meld, deal, draw, tick, swap, lift, press, stick, alert, alertWin, notice, fishing, win, lose, drawn };
}

/* --------------------------------------------------------- the engine */

/**
 * The sound engine: unlocks audio on the first gesture, keeps the on / off
 * choice, and plays named cues. Everything is injectable for tests.
 */
export function createSound({
  storage = browserStorage,
  AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  now = () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
  random = Math.random,
  doc = globalThis.document ?? null,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
  loadSample = fetchSample,
} = {}) {
  let ctx = null;
  let voices = null;
  const samples = { dice: [] };
  const lastPlayed = new Map();
  let idleTimer = null;
  let idleSuspended = false;

  const stored = storedString(MUTE_KEY, storage);
  let muted = stored.read() === "off";

  function build() {
    if (ctx !== null || AudioContextClass === null) return;
    try {
      ctx = new AudioContextClass({ latencyHint: "interactive" });
    } catch {
      ctx = null;
      return;
    }
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 20;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    voices = createVoices(ctx, master, random, samples);
    void loadSamples(ctx);
  }

  /** Fetch and decode the recordings; one that will not load is skipped, and its cue stays silent. */
  async function loadSamples(context) {
    for (const [cue, files] of Object.entries(SAMPLE_FILES)) {
      for (const name of files) {
        try {
          const bytes = await loadSample(name);
          samples[cue].push(await context.decodeAudioData(bytes));
        } catch {
          // Offline without a cached copy, or a browser that cannot decode it.
        }
      }
    }
  }

  /** Stop the clock when nothing has sounded for a while, so iOS sees no audio activity. */
  function armIdle() {
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = setTimer(() => {
      idleTimer = null;
      if (ctx === null || ctx.state !== "running") return;
      idleSuspended = true;
      try {
        void ctx.suspend()?.catch?.(() => {});
      } catch {
        idleSuspended = false;
      }
    }, IDLE_MS);
  }

  /** Called from a user gesture: create / resume the context so sound can play. */
  function unlock() {
    if (AudioContextClass === null) return;
    try {
      // iOS: "ambient" mixes with other audio and does not count as media
      // playback, so no speaker symbol shows in the Dynamic Island. The price
      // is that the silent switch mutes the game; the menu's Sound button stays.
      if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = "ambient";
    } catch {
      // Not supported: Web Audio still plays.
    }
    build();
    if (ctx === null) return;
    idleSuspended = false;
    if (ctx.state === "running") {
      armIdle();
      return;
    }
    try {
      void ctx.resume()?.catch?.(() => {});
      // Older iOS only counts a sound started inside the gesture.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, 22050);
      silent.connect(ctx.destination);
      silent.start(0);
    } catch {
      // Try again on the next gesture.
    }
  }

  const engine = {
    /** Set to an array to record every cue asked for (tests, debugging); a page may predefine `__soundTrace`. */
    trace: globalThis.__soundTrace ?? null,

    get muted() {
      return muted;
    },

    get running() {
      return ctx !== null && ctx.state === "running";
    },

    /** Watch the page's gestures so the first tap, click or key unlocks audio. */
    install(target = globalThis.window) {
      if (!target?.addEventListener) return;
      for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
        target.addEventListener(type, unlock, { capture: true, passive: true });
      }
      doc?.addEventListener?.("visibilitychange", () => {
        if (doc.hidden || ctx === null || ctx.state === "running" || idleSuspended) return;
        void ctx.resume()?.catch?.(() => {});
      });
    },

    unlock,

    /** How many dice recordings are decoded and ready (4 once audio has started and they loaded). */
    get samplesLoaded() {
      return samples.dice.length;
    },

    setMuted(value) {
      muted = Boolean(value);
      stored.write(muted ? "off" : "on");
    },

    /**
     * Play a cue. `delay` (seconds) schedules it ahead on the audio clock, so
     * it can be asked for when an animation starts and land when it ends.
     * Returns whether anything was scheduled.
     */
    cue(name, options = {}) {
      if (engine.trace) engine.trace.push({ name, ...options });
      if (muted || ctx === null || voices === null) return false;
      if (ctx.state !== "running" && !idleSuspended) return false;
      if (doc?.hidden) return false;
      const voice = voices[name];
      if (typeof voice !== "function") return false;
      const gap = MIN_GAP[name];
      if (gap !== undefined) {
        const at = now();
        if (at - (lastPlayed.get(name) ?? -Infinity) < gap) return false;
        lastPlayed.set(name, at);
      }
      if (idleSuspended) {
        // Woken from idle: the clock is frozen while suspended, so what is
        // scheduled now starts the moment the context runs again.
        idleSuspended = false;
        try {
          void ctx.resume()?.catch?.(() => {});
        } catch {
          // The next gesture unlocks again.
        }
      }
      voice(ctx.currentTime + LEAD + Math.max(0, options.delay ?? 0), options);
      armIdle();
      return true;
    },
  };
  return engine;
}

/** The page's one engine. */
export const sound = createSound();
