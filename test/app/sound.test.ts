/**
 * The table's sound engine (`app/src/sound.js`): which cues exist, that each
 * one schedules well-formed audio, and that the engine stays silent until the
 * browser has unlocked audio, while muted, and while the page is hidden. A
 * fake audio context records what is scheduled, so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createSound, createVoices } = await import("../../app/src/sound.js");

class FakeParam {
  value = 0;
  events: { kind: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: "set", value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "linear", value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: "exp", value, time });
  }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  playbackRate = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = "";
  buffer: unknown = null;
  starts: number[] = [];
  stops: number[] = [];
  connected: unknown[] = [];
  connect(node: unknown) {
    this.connected.push(node);
    return node;
  }
  start(time: number) {
    this.starts.push(time);
  }
  stop(time: number) {
    this.stops.push(time);
  }
}

class FakeContext {
  static created = 0;
  state = "suspended";
  currentTime = 10;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeNode[] = [];
  nodes: FakeNode[] = [];
  resumed = 0;
  constructor() {
    FakeContext.created++;
  }
  private node(source = false) {
    const node = new FakeNode();
    this.nodes.push(node);
    if (source) this.sources.push(node);
    return node;
  }
  createGain = () => this.node();
  createBiquadFilter = () => this.node();
  createStereoPanner = () => this.node();
  createDynamicsCompressor = () => this.node();
  createOscillator = () => this.node(true);
  createBufferSource = () => this.node(true);
  decodeAudioData = async (_bytes: ArrayBuffer) => ({ duration: 0.5 });
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  suspended = 0;
  async resume() {
    this.resumed++;
    this.state = "running";
  }
  async suspend() {
    this.suspended++;
    this.state = "suspended";
  }
}

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** An engine over a fake context, already unlocked. */
async function running(extra: Record<string, unknown> = {}) {
  let ctx!: FakeContext;
  const Class = function () {
    ctx = new FakeContext();
    return ctx;
  };
  const engine = createSound({ AudioContextClass: Class, storage: memory(), doc: { hidden: false }, ...extra });
  engine.unlock();
  await Promise.resolve();
  return { engine, ctx };
}

const CUES = [
  "clack",
  "meld",
  "deal",
  "draw",
  "tick",
  "swap",
  "lift",
  "press",
  "alert",
  "alertWin",
  "notice",
  "fishing",
  "win",
  "lose",
  "drawn",
];

describe("sound voices", () => {
  for (const name of CUES) {
    it(`${name} schedules well-formed audio`, () => {
      const ctx = new FakeContext();
      const voices = createVoices(ctx, ctx.destination, () => 0.5);
      assert.equal(typeof voices[name], "function");
      voices[name](5, { count: 3 });
      assert.ok(ctx.sources.length > 0, "starts at least one source");
      for (const source of ctx.sources) {
        assert.equal(source.starts.length, 1);
        assert.equal(source.stops.length, 1);
        assert.ok(source.starts[0]! >= 5, "never starts before it was asked to");
        assert.ok(source.stops[0]! > source.starts[0]!, "stops after it starts");
      }
      for (const node of ctx.nodes) {
        for (const event of node.gain.events.concat(node.frequency.events)) {
          assert.ok(Number.isFinite(event.time) && event.time >= 5);
          // An exponential ramp to zero or below throws in a real browser.
          if (event.kind === "exp") assert.ok(event.value > 0, "exponential ramps need a positive target");
        }
      }
    });
  }

  it("a call sets as many tiles down as it has", () => {
    const sourcesFor = (count: number) => {
      const ctx = new FakeContext();
      createVoices(ctx, ctx.destination, () => 0.5).meld(0, { count });
      return ctx.sources.length;
    };
    assert.equal(sourcesFor(4), (sourcesFor(2) / 2) * 4);
  });

  it("dice play a recording, fitted to the throw, and are silent without one", () => {
    const play = (takes: { duration: number }[], options: Record<string, number>) => {
      const ctx = new FakeContext();
      createVoices(ctx, ctx.destination, () => 0.5, { dice: takes }).dice(10, options);
      return ctx;
    };
    assert.equal(play([], { span: 0.5 }).sources.length, 0, "nothing decoded: nothing plays");
    const fitted = play([{ duration: 0.6 }], { span: 0.4 });
    assert.equal(fitted.sources.length, 1);
    assert.equal(fitted.sources[0]!.starts[0], 10);
    // A 0.6 s take played over 0.4 s runs at 1.5x; over 0.8 s at 0.75x; never absurdly fast or slow.
    assert.ok(Math.abs(fitted.sources[0]!.playbackRate.value - 1.5) < 1e-9);
    assert.ok(Math.abs(play([{ duration: 0.6 }], { span: 0.8 }).sources[0]!.playbackRate.value - 0.75) < 1e-9);
    assert.equal(play([{ duration: 0.6 }], { span: 0.1 }).sources[0]!.playbackRate.value, 1.6);
    assert.equal(play([{ duration: 0.6 }], { span: 5 }).sources[0]!.playbackRate.value, 0.7);
    // Each throw is a different take.
    const takes = [{ duration: 0.5 }, { duration: 0.6 }, { duration: 0.7 }, { duration: 0.8 }];
    const used = new Set<unknown>();
    for (const value of [0.05, 0.3, 0.55, 0.9]) {
      const ctx = new FakeContext();
      createVoices(ctx, ctx.destination, () => value, { dice: takes }).dice(0, { span: 0.5 });
      used.add(ctx.sources[0]!.buffer);
    }
    assert.equal(used.size, 4);
    // Throws one after another differ a little in speed, and stay within a few percent of the fit.
    const rates = [0, 0.5, 0.999].map((value) => {
      const ctx = new FakeContext();
      createVoices(ctx, ctx.destination, () => value, { dice: [{ duration: 0.6 }] }).dice(0, { span: 0.6 });
      return ctx.sources[0]!.playbackRate.value as number;
    });
    assert.ok(rates[0]! < rates[1]! && rates[1]! < rates[2]!, "the speed varies from throw to throw");
    assert.ok(rates[0]! >= 0.94 - 1e-9 && rates[2]! <= 1.06 + 1e-9, "by no more than six percent");
  });

  it("a tick is far lighter than a clack", () => {
    const sourcesFor = (name: string) => {
      const ctx = new FakeContext();
      createVoices(ctx, ctx.destination, () => 0.5)[name](0, {});
      return ctx.sources.length;
    };
    assert.ok(sourcesFor("tick") < sourcesFor("clack"));
  });
});

describe("the recordings", () => {
  it("are fetched and decoded when audio starts, and a cue plays them", async () => {
    const asked: string[] = [];
    const { engine, ctx } = await running({
      loadSample: async (name: string) => {
        asked.push(name);
        return new ArrayBuffer(8);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(asked, ["dice-1.mp3", "dice-2.mp3", "dice-3.mp3", "dice-4.mp3"]);
    ctx.state = "running";
    const before = ctx.sources.length;
    assert.equal(engine.cue("dice", { span: 0.5 }), true);
    assert.equal(ctx.sources.length, before + 1, "one recording starts");
  });

  it("leave the cue silent when a file will not load, and never break the engine", async () => {
    const { engine, ctx } = await running({
      loadSample: async () => {
        throw new Error("offline");
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    ctx.state = "running";
    const before = ctx.sources.length;
    engine.cue("dice", { span: 0.5 });
    assert.equal(ctx.sources.length, before, "nothing plays");
    assert.equal(engine.cue("clack"), true, "the other sounds still play");
  });
});

describe("sound engine", () => {
  it("stays silent until audio is unlocked by a gesture", async () => {
    const ctx = createSound({ AudioContextClass: FakeContext, storage: memory(), doc: { hidden: false } });
    assert.equal(ctx.cue("clack"), false);
    assert.equal(ctx.running, false);
    const { engine } = await running();
    assert.equal(engine.running, true);
    assert.equal(engine.cue("clack"), true);
  });

  it("unlocks once per context and keeps one context", async () => {
    FakeContext.created = 0;
    const { engine } = await running();
    engine.unlock();
    engine.unlock();
    assert.equal(FakeContext.created, 1);
  });

  it("is silent without Web Audio", () => {
    const engine = createSound({ AudioContextClass: null, storage: memory(), doc: { hidden: false } });
    engine.unlock();
    assert.equal(engine.cue("clack"), false);
  });

  it("schedules a delayed cue later on the audio clock", async () => {
    const { engine, ctx } = await running();
    const unlocked = ctx.sources.length; // the unlock's silent buffer is not a sound
    engine.cue("clack");
    const first = Math.min(...ctx.sources.slice(unlocked).map((source) => source.starts[0]!));
    const before = ctx.sources.length;
    engine.cue("clack", { delay: 0.36 });
    const later = Math.min(...ctx.sources.slice(before).map((source) => source.starts[0]!));
    assert.ok(later - first > 0.3 && later - first < 0.4);
  });

  it("asks iOS for the ambient audio session, so no speaker symbol shows", async () => {
    const nav = (globalThis as { navigator?: unknown }).navigator;
    const session = { type: "auto" };
    Object.defineProperty(globalThis, "navigator", { value: { audioSession: session }, configurable: true });
    try {
      await running();
      assert.equal(session.type, "ambient");
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    }
  });

  it("suspends when idle and the first cue after idle still plays on time", async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const { engine, ctx } = await running({
      setTimer: (fn: () => void, ms: number) => timers.push({ fn, ms }) - 1,
      clearTimer: (id: number) => void (timers[id] = { fn: () => {}, ms: 0 }),
    });
    assert.equal(engine.cue("clack"), true);
    timers.at(-1)!.fn(); // the idle timer fires
    assert.equal(ctx.state, "suspended");
    assert.equal(ctx.suspended, 1);
    const resumedBefore = ctx.resumed;
    const sources = ctx.sources.length;
    assert.equal(engine.cue("clack"), true, "a cue after idle is not dropped");
    assert.equal(ctx.resumed, resumedBefore + 1, "the context resumes for it");
    const starts = ctx.sources.slice(sources).map((source) => source.starts[0]!);
    assert.ok(Math.min(...starts) >= ctx.currentTime && Math.min(...starts) < ctx.currentTime + 0.05);
    await Promise.resolve();
    assert.equal(engine.running, true);
  });

  it("mutes, and remembers the choice", async () => {
    const storage = memory();
    const { engine } = await running({ storage });
    engine.setMuted(true);
    assert.equal(engine.cue("alert"), false);
    assert.equal(storage.getItem("int-maj.sound"), "off");
    engine.setMuted(false);
    assert.equal(engine.cue("alert"), true);
    assert.equal(storage.getItem("int-maj.sound"), "on");

    storage.setItem("int-maj.sound", "off");
    const again = createSound({ AudioContextClass: FakeContext, storage, doc: { hidden: false } });
    assert.equal(again.muted, true);
  });

  it("survives storage that throws", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const { engine } = await running({ storage: broken });
    assert.equal(engine.muted, false);
    engine.setMuted(true);
    assert.equal(engine.muted, true);
  });

  it("does not play into a hidden page", async () => {
    const doc = { hidden: true };
    const { engine } = await running({ doc });
    assert.equal(engine.cue("clack"), false);
    doc.hidden = false;
    assert.equal(engine.cue("clack"), true);
  });

  it("ignores unknown cues", async () => {
    const { engine } = await running();
    assert.equal(engine.cue("nope"), false);
  });

  it("limits how fast the hover tick can repeat, but not the clacks", async () => {
    let clock = 1000;
    const { engine } = await running({ now: () => clock });
    assert.equal(engine.cue("tick"), true);
    clock += 5;
    assert.equal(engine.cue("tick"), false);
    clock += 30;
    assert.equal(engine.cue("tick"), true);
    assert.equal(engine.cue("clack"), true);
    assert.equal(engine.cue("clack"), true);
  });

  it("records the cues asked for when traced, even when it cannot play", () => {
    const engine = createSound({ AudioContextClass: FakeContext, storage: memory(), doc: { hidden: false } });
    engine.trace = [];
    engine.cue("clack", { delay: 0.36 });
    engine.cue("alert");
    assert.deepEqual(
      engine.trace.map((entry: { name: string }) => entry.name),
      ["clack", "alert"],
    );
  });
});
