// Procedural audio for ПЕРЕГРУЗКА: a synthwave sequencer plus synthesized SFX.
// Everything is built from Web Audio primitives; there are no asset files.
//
// Graph:
//   music voices -> layer level -> (sidechain duck) -> musicGain --\
//   sfx voices ---------------------------------------> sfxGain ----+-> master lowpass (slow-mo) -> compressor -> out
//   big sfx / pad / arp / boss sends -> convolver reverb ----------/

import type { SimEvent } from '../sim/types';

// ---------------------------------------------------------------- music data

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

interface SectorDef {
  /** MIDI note of the bass root. */
  root: number;
  scale: number[];
  /** Scale degrees of the 4-bar chord progression. */
  prog: number[];
  bpm: number;
  /** 16 steps: -1 rest, otherwise semitones above the chord root. */
  bass: number[];
  /** 16 steps: index into the 6-note arp chord (2 octaves). */
  arp: number[];
}

const SECTORS: SectorDef[] = [
  // A minor, i-VI-III-VII (Am F C G), 118 BPM.
  {
    root: 33,
    scale: MINOR,
    prog: [0, 5, 2, 6],
    bpm: 118,
    bass: [-1, 0, 0, 0, -1, 0, 0, 12, -1, 0, 0, 0, -1, 0, 12, 0],
    arp: [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 3, 2, 1],
  },
  // F# harmonic minor, i-VI-iv-V (F#m D Bm C#), 124 BPM.
  {
    root: 30,
    scale: HARM_MINOR,
    prog: [0, 5, 3, 4],
    bpm: 124,
    bass: [-1, 0, 0, 12, -1, 0, 0, 7, -1, 0, 0, 12, -1, 0, 7, 12],
    arp: [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 0, 1, 3],
  },
  // D phrygian, i-bII-VI-vii (Dm Eb Bb Cm), 132 BPM.
  {
    root: 38,
    scale: PHRYGIAN,
    prog: [0, 1, 5, 6],
    bpm: 132,
    bass: [-1, 0, 12, 0, -1, 0, 12, 0, -1, 0, 12, 0, -1, 12, 0, 7],
    arp: [0, 3, 1, 4, 2, 5, 3, 4, 0, 3, 1, 4, 5, 2, 4, 1],
  },
];

const MENU_BPM = 96;
const BOSS_BPM_ADD = 8;
const LOOKAHEAD = 0.12;
/** Mix level of each music layer: pad, drums, bass, arp, boss. */
const LAYER_MIX = [0.5, 0.85, 0.55, 0.3, 0.55];
/** Intensity at which drums, bass, arp come in. */
const LAYER_TH = [0, 0.28, 0.53, 0.78];
const LAYER_HYST = 0.07;
const MAX_VOICES = 30;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const BOSS_TYPES = new Set<string>(['hydraHead', 'core', 'zeroday']);

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const vary = (p = 0.07): number => 1 + (Math.random() * 2 - 1) * p;
const safeF = (f: number): number => clamp(Number.isFinite(f) ? f : 440, 20, 20000);

const degSemi = (scale: number[], d: number): number => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const chordTones = (scale: number[], d: number): number[] => [degSemi(scale, d), degSemi(scale, d + 2), degSemi(scale, d + 4)];
/** Fold a semitone offset into [lo, lo + 12). */
const fold = (x: number, lo: number): number => ((((x - lo) % 12) + 12) % 12) + lo;
/** Bass register: keep the root within a fifth either side so it stays heavy. */
const bassSemi = (x: number): number => {
  const s = ((x % 12) + 12) % 12;
  return s > 7 ? s - 12 : s;
};

function driveCurve(k: number) {
  const n = 1024;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

function stairCurve(levels: number) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.round(x * levels) / levels;
  }
  return c;
}

// ---------------------------------------------------------------- graph

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
  pulse: PeriodicWave;
  music: GainNode;
  sfx: GainNode;
  lp: BiquadFilterNode;
  sfxRev: GainNode;
  musRev: GainNode;
  /** Shared distortion bus for crunchy SFX. */
  dist: WaveShaperNode;
  /** Shared amplitude-quantizer bus (bitcrush-ish). */
  crush: WaveShaperNode;
  padFilter: BiquadFilterNode;
  /** pad, drums, bass, arp, boss */
  levels: GainNode[];
  padDuck: GainNode;
  bassDuck: GainNode;
  arpDelay: DelayNode;
  /** Distortion input for boss lead stabs. */
  lead: WaveShaperNode;
}

interface ToneOpts {
  t: number;
  f: number;
  /** Exponential glide target. */
  f2?: number;
  glide?: number;
  type?: OscillatorType;
  wave?: PeriodicWave;
  dur: number;
  v: number;
  a?: number;
  hold?: number;
  dest?: AudioNode;
  rev?: number;
  lp?: number;
  lp2?: number;
  q?: number;
  hp?: number;
  detune?: number;
  /** Random frequency jumps every `jitter` seconds (zaps, glitches). */
  jitter?: number;
  /** Music voice: not counted against the SFX voice cap. */
  mus?: boolean;
  /** Bypass the voice cap (rare, important sounds). */
  force?: boolean;
  onEnd?: () => void;
}

interface NoiseOpts {
  t: number;
  dur: number;
  v: number;
  a?: number;
  hold?: number;
  type?: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  rate?: number;
  dest?: AudioNode;
  rev?: number;
  mus?: boolean;
  force?: boolean;
}

interface PadVoice {
  o: OscillatorNode;
  base: number;
}

export class AudioEngine {
  beat = 0;

  private g: Graph | null = null;
  private failed = false;

  private musicVol = 0.7;
  private sfxVol = 0.8;
  private intensity = 0;
  private intensSm = 0;
  private sector = 0;
  private boss = false;
  private menu = false;
  private timeScale = 1;
  private pitchCents = 0;

  private bpm = SECTORS[0].bpm;
  private nextStep = 0;
  private step = 0;
  private kickQ: number[] = [];

  private layerOn = [true, false, false, false];
  private layerT = [1, 0, 0, 0, 0];
  private layerOffAt = [0, 0, 0, 0, 0];

  private last = new Map<string, number>();
  private voices = 0;
  private livePad = new Set<PadVoice>();
  private dataStep = 0;
  private lastData = -1;

  constructor() {
    // Intentionally empty: the AudioContext is created in unlock().
  }

  // ------------------------------------------------------------ public API

  unlock(): void {
    try {
      if (this.g) {
        if (this.g.ctx.state === 'suspended') this.g.ctx.resume().catch(() => undefined);
        return;
      }
      if (this.failed || typeof window === 'undefined') return;
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        this.failed = true;
        return;
      }
      const ctx = new AC();
      try {
        this.g = this.build(ctx);
      } catch {
        this.failed = true;
        ctx.close().catch(() => undefined);
        return;
      }
      this.applyVolumes();
      this.applyTimeScale();
      this.bpm = this.targetBpm();
      this.nextStep = ctx.currentTime + 0.1;
      this.applyLayers(ctx.currentTime, 0.05);
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.g = null;
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = clamp(num(music, 0.7), 0, 1);
    this.sfxVol = clamp(num(sfx, 0.8), 0, 1);
    try {
      this.applyVolumes();
    } catch {
      /* ignore */
    }
  }

  handle(events: SimEvent[]): void {
    const g = this.g;
    if (!g || g.ctx.state !== 'running' || !events || events.length === 0) return;
    const now = g.ctx.currentTime;
    for (const e of events) {
      try {
        this.sfxFor(g, e, now);
      } catch {
        /* a bad event must never break the frame */
      }
    }
  }

  setIntensity(x: number): void {
    this.intensity = clamp(num(x, 0), 0, 1);
  }

  setSector(i: number): void {
    this.sector = clamp(Math.floor(num(i, 0)), 0, SECTORS.length - 1);
  }

  setBoss(on: boolean): void {
    if (this.boss === !!on) return;
    this.boss = !!on;
    // After everything already scheduled, so a queued bar-start change cannot override this one.
    if (this.g) this.applyLayers(Math.max(this.g.ctx.currentTime, this.nextStep), 0.3);
  }

  setMenu(on: boolean): void {
    if (this.menu === !!on) return;
    this.menu = !!on;
    if (this.g) this.applyLayers(Math.max(this.g.ctx.currentTime, this.nextStep), 0.6);
  }

  setTimeScale(s: number): void {
    const v = clamp(num(s, 1), 0.2, 1);
    if (Math.abs(v - this.timeScale) < 0.003) return;
    this.timeScale = v;
    this.pitchCents = (v - 1) * 120;
    try {
      this.applyTimeScale();
    } catch {
      /* ignore */
    }
  }

  update(dt: number): void {
    const d = clamp(num(dt, 0), 0, 0.5);
    this.beat = Math.max(0, this.beat - d / 0.25);
    const g = this.g;
    if (!g) return;
    try {
      const k = this.intensity > this.intensSm ? 1 / 0.8 : 1 / 3;
      this.intensSm += (this.intensity - this.intensSm) * (1 - Math.exp(-d * k));

      if (g.ctx.state !== 'running') return;
      const now = g.ctx.currentTime;
      // Tab was hidden or a frame stalled: jump forward instead of bursting catch-up notes.
      if (this.nextStep < now - 0.3) {
        this.nextStep = now + 0.05;
        this.kickQ.length = 0;
      }
      while (this.nextStep < now + LOOKAHEAD) {
        this.scheduleStep(g, this.step, this.nextStep);
        this.nextStep += 15 / this.bpm;
        this.step++;
      }
      while (this.kickQ.length > 0 && this.kickQ[0] <= now) {
        this.kickQ.shift();
        this.beat = 1;
      }
    } catch {
      /* ignore */
    }
  }

  ui(kind: 'hover' | 'click' | 'card' | 'pick'): void {
    const g = this.g;
    if (!g || g.ctx.state !== 'running') return;
    try {
      const t = g.ctx.currentTime;
      if (!this.ok('ui' + kind, kind === 'hover' ? 0.03 : 0.05, t)) return;
      switch (kind) {
        case 'hover':
          this.tone({ t, f: 1800 * vary(0.03), type: 'sine', dur: 0.035, v: 0.022, a: 0.002 });
          break;
        case 'click':
          this.tone({ t, f: 900, f2: 560, type: 'square', dur: 0.06, v: 0.04, a: 0.002, lp: 3000 });
          this.tone({ t, f: 2700, type: 'sine', dur: 0.03, v: 0.025, a: 0.001 });
          break;
        case 'card':
          this.noise({ t, dur: 0.14, v: 0.06, a: 0.02, type: 'bandpass', f: 1000, f2: 3200, q: 1.5 });
          this.tone({ t: t + 0.02, f: 1320, type: 'triangle', dur: 0.12, v: 0.035, a: 0.003 });
          break;
        case 'pick': {
          const notes = [880, 1108.7, 1318.5, 1760];
          notes.forEach((f, i) => {
            this.tone({ t: t + i * 0.045, f, type: 'triangle', dur: 0.45, v: 0.055, a: 0.003, rev: 0.25, force: true });
          });
          this.tone({ t, f: 440, type: 'sine', dur: 0.4, v: 0.06, a: 0.005, force: true });
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ setup

  private build(ctx: AudioContext): Graph {
    const sr = ctx.sampleRate;

    // One shared 2 s white-noise buffer.
    const noise = ctx.createBuffer(1, Math.floor(sr * 2), sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // 25% pulse wave for the arp.
    const H = 32;
    const real: number[] = [];
    const imag: number[] = [];
    for (let n = 0; n < H; n++) {
      real.push(n === 0 ? 0 : (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25));
      imag.push(0);
    }
    const pulse = ctx.createPeriodicWave(real, imag);

    // Master chain.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    comp.connect(out);
    out.connect(ctx.destination);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    lp.Q.value = 0.9;
    lp.connect(comp);

    const music = ctx.createGain();
    music.connect(lp);
    const sfx = ctx.createGain();
    sfx.connect(lp);

    // Reverb: generated decaying-noise impulse.
    const irLen = Math.floor(sr * 2.4);
    const ir = ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    conv.connect(revOut);
    revOut.connect(lp);
    const sfxRev = ctx.createGain();
    sfxRev.connect(conv);
    const musRev = ctx.createGain();
    musRev.connect(conv);

    // SFX buses.
    const dist = ctx.createWaveShaper();
    dist.curve = driveCurve(10);
    dist.oversample = '2x';
    const distOut = ctx.createGain();
    distOut.gain.value = 0.45;
    dist.connect(distOut);
    distOut.connect(sfx);

    const crush = ctx.createWaveShaper();
    crush.curve = stairCurve(5);
    const crushOut = ctx.createGain();
    crushOut.gain.value = 0.3;
    crush.connect(crushOut);
    crushOut.connect(sfx);

    // Music layers.
    const levels: GainNode[] = [];
    for (let i = 0; i < 5; i++) {
      const l = ctx.createGain();
      l.gain.value = i === 0 ? LAYER_MIX[0] : 0;
      levels.push(l);
    }

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1100;
    padFilter.Q.value = 1.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 320;
    lfo.connect(lfoAmt);
    lfoAmt.connect(padFilter.frequency);
    lfo.start();
    const padDuck = ctx.createGain();
    padFilter.connect(levels[0]);
    levels[0].connect(padDuck);
    padDuck.connect(music);
    padDuck.connect(musRev);

    levels[1].connect(music);

    const bassDuck = ctx.createGain();
    levels[2].connect(bassDuck);
    bassDuck.connect(music);

    const arpDelay = ctx.createDelay(2);
    arpDelay.delayTime.value = (15 / SECTORS[0].bpm) * 3;
    const fbFilter = ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.55;
    levels[3].connect(music);
    levels[3].connect(arpDelay);
    levels[3].connect(musRev);
    arpDelay.connect(fbFilter);
    fbFilter.connect(fb);
    fb.connect(arpDelay);
    fbFilter.connect(delayOut);
    delayOut.connect(music);

    const lead = ctx.createWaveShaper();
    lead.curve = driveCurve(5);
    lead.oversample = '2x';
    const leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.value = 2600;
    leadFilter.Q.value = 3;
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.5;
    lead.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(levels[4]);
    levels[4].connect(music);
    levels[4].connect(musRev);

    return {
      ctx,
      noise,
      pulse,
      music,
      sfx,
      lp,
      sfxRev,
      musRev,
      dist,
      crush,
      padFilter,
      levels,
      padDuck,
      bassDuck,
      arpDelay,
      lead,
    };
  }

  private applyVolumes(): void {
    const g = this.g;
    if (!g) return;
    const t = g.ctx.currentTime;
    g.music.gain.setTargetAtTime(this.musicVol * 0.6, t, 0.05);
    g.sfx.gain.setTargetAtTime(this.sfxVol * 0.9, t, 0.05);
    g.musRev.gain.setTargetAtTime(this.musicVol * 0.22, t, 0.05);
    g.sfxRev.gain.setTargetAtTime(this.sfxVol * 0.7, t, 0.05);
  }

  private applyTimeScale(): void {
    const g = this.g;
    if (!g) return;
    const t = g.ctx.currentTime;
    const s = this.timeScale;
    const f = s >= 0.995 ? 20000 : 450 * Math.pow(20000 / 450, (s - 0.2) / 0.8);
    g.lp.frequency.setTargetAtTime(f, t, 0.08);
    for (const p of this.livePad) p.o.detune.setTargetAtTime(p.base + this.pitchCents, t, 0.1);
  }

  private targetBpm(): number {
    if (this.menu) return MENU_BPM;
    return SECTORS[this.sector].bpm + (this.boss ? BOSS_BPM_ADD : 0);
  }

  private applyLayers(t: number, tc: number): void {
    const g = this.g;
    if (!g) return;
    const s = this.boss ? Math.max(this.intensSm, 0.9) : this.intensSm;
    for (let i = 1; i <= 3; i++) {
      if (!this.layerOn[i] && s >= LAYER_TH[i]) this.layerOn[i] = true;
      else if (this.layerOn[i] && s < LAYER_TH[i] - LAYER_HYST) this.layerOn[i] = false;
    }
    const tg = this.menu
      ? [1, 0, 0, 0.75, 0]
      : [1, this.layerOn[1] ? 1 : 0, this.layerOn[2] ? 1 : 0, this.layerOn[3] ? 1 : 0, this.boss ? 1 : 0];
    for (let i = 0; i < 5; i++) {
      if (tg[i] === this.layerT[i]) continue;
      if (tg[i] === 0) this.layerOffAt[i] = t + 1.2;
      this.layerT[i] = tg[i];
      g.levels[i].gain.setTargetAtTime(tg[i] * LAYER_MIX[i], t, tc);
    }
  }

  /** Whether a layer still needs notes scheduled (audible or fading out). */
  private active(i: number, t: number): boolean {
    return this.layerT[i] > 0 || t < this.layerOffAt[i];
  }

  // ------------------------------------------------------------ sequencer

  private scheduleStep(g: Graph, step: number, t: number): void {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    if (s16 === 0) {
      this.bpm = this.targetBpm();
      this.applyLayers(t, 0.25);
      g.arpDelay.delayTime.setTargetAtTime((15 / this.bpm) * 3, t, 0.05);
      const cut = this.menu ? 850 : this.boss ? 1000 : 1000 + this.intensSm * 1400;
      g.padFilter.frequency.setTargetAtTime(cut, t, 0.8);
    }
    const sd = 15 / this.bpm;
    const sec = SECTORS[this.sector];
    const tones = chordTones(sec.scale, sec.prog[bar % 4]);
    const chordRoot = bassSemi(tones[0]);

    if (s16 === 0) this.padChord(g, t, sec.root, tones, 16 * sd);

    // Beat pulse follows quarter notes even when the drums are not in yet.
    if (s16 % 4 === 0 && !this.menu) this.kickQ.push(t);
    if (this.menu && s16 % 8 === 0) this.kickQ.push(t);
    if (this.kickQ.length > 64) this.kickQ.splice(0, this.kickQ.length - 64);

    const drumsOn = this.layerT[1] > 0;
    if (this.active(1, t)) {
      const kickHere = s16 % 4 === 0 || (this.boss && bar % 2 === 1 && s16 === 14);
      if (kickHere) {
        this.kick(g, t);
        if (drumsOn) {
          // Recover within 2 steps: the boss pickup kick on step 14 is only 2 steps after step 12.
          const rel = Math.min(0.24, sd * 1.8);
          this.duck(g.padDuck.gain, t, 0.45, rel);
          this.duck(g.bassDuck.gain, t, 0.35, rel);
        }
      }
      if (s16 % 4 === 2) {
        this.noise({ t, dur: 0.09, v: 0.16, a: 0.001, type: 'highpass', f: 7500, q: 0.7, dest: g.levels[1], mus: true });
      } else if (s16 % 2 === 1 && (this.intensSm > 0.65 || this.boss)) {
        this.noise({ t, dur: 0.03, v: 0.06, a: 0.001, type: 'highpass', f: 9000, q: 0.7, dest: g.levels[1], mus: true });
      }
    }

    if (this.active(2, t)) {
      const p = sec.bass[s16];
      if (p >= 0) this.bassNote(g, t, sec.root + chordRoot + p, sd, s16 % 4 === 1);
    }

    if (this.active(3, t)) {
      const notes = tones.map((x) => fold(x, 36)).sort((a, b) => a - b);
      const six = [...notes, ...notes.map((x) => x + 12)];
      if (this.menu) {
        if (s16 % 2 === 0) {
          const m = sec.root + six[sec.arp[s16] % 6];
          this.tone({
            t, f: mtof(m), type: 'triangle', dur: sd * 3, v: 0.3, a: 0.004, lp: 2200, lp2: 900, q: 1,
            dest: g.levels[3], mus: true,
          });
        }
      } else {
        const m = sec.root + six[sec.arp[s16] % 6];
        const acc = s16 % 4 === 0 ? 1.25 : 1;
        this.tone({
          t, f: mtof(m), wave: g.pulse, dur: sd * 0.85, v: 0.26 * acc, a: 0.002, lp: 4200, lp2: 1300, q: 2,
          dest: g.levels[3], mus: true,
        });
      }
    }

    if (this.active(4, t)) {
      if (s16 === 4 || s16 === 12) this.snare(g, t, 1);
      else if (s16 === 15 && bar % 2 === 1) this.snare(g, t, 0.35);
      const stabs = bar % 2 === 0 ? [0, 3, 6, 10] : [0, 3, 6, 8, 11, 14];
      if (stabs.includes(s16)) {
        const r = sec.root + fold(chordRoot, 24);
        for (const [m, dt] of [[r, -6], [r + 7, 5], [r + 12, 0]]) {
          this.tone({
            t, f: mtof(m), type: 'sawtooth', dur: sd * 1.5, v: 0.22, a: 0.003, hold: sd * 0.6, detune: dt,
            dest: g.lead, mus: true,
          });
        }
      }
    }
  }

  private padChord(g: Graph, t: number, root: number, tones: number[], barDur: number): void {
    const notes = tones.map((x) => root + fold(x, 21));
    notes.push(root + 12 + bassSemi(tones[0]));
    const atk = this.menu ? 1.2 : 0.3;
    const dur = barDur + 1.1;
    const hold = barDur + 0.1;
    for (const m of notes) {
      for (const dt of [-9, 9]) {
        let rec: PadVoice | null = null;
        const o = this.tone({
          t, f: mtof(m), type: 'sawtooth', dur, v: 0.045, a: atk, hold, detune: dt,
          dest: g.padFilter, mus: true,
          onEnd: () => {
            if (rec) this.livePad.delete(rec);
          },
        });
        if (o) {
          rec = { o, base: dt };
          this.livePad.add(rec);
        }
      }
    }
  }

  private kick(g: Graph, t: number): void {
    this.tone({ t, f: 165, f2: 44, glide: 0.11, type: 'sine', dur: 0.42, v: 0.95, a: 0.002, dest: g.levels[1], mus: true });
    this.tone({ t, f: 2400, f2: 400, type: 'triangle', dur: 0.025, v: 0.16, a: 0.001, dest: g.levels[1], mus: true });
  }

  private snare(g: Graph, t: number, v: number): void {
    this.noise({ t, dur: 0.2, v: 0.5 * v, a: 0.001, type: 'bandpass', f: 1900, q: 0.8, dest: g.levels[4], mus: true });
    this.noise({ t: t + 0.012, dur: 0.12, v: 0.25 * v, a: 0.001, type: 'highpass', f: 3000, dest: g.levels[4], mus: true });
    this.tone({ t, f: 210, f2: 150, type: 'triangle', dur: 0.1, v: 0.35 * v, a: 0.001, dest: g.levels[4], mus: true });
  }

  private bassNote(g: Graph, t: number, m: number, sd: number, acc: boolean): void {
    const ctx = g.ctx;
    const f = mtof(m);
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = this.boss ? 10 : 7;
    const peak = (this.boss ? 2400 : 1500) * (acc ? 1.4 : 1);
    fl.frequency.setValueAtTime(peak, t);
    fl.frequency.exponentialRampToValueAtTime(130, t + sd * 1.8);
    const amp = ctx.createGain();
    this.env(amp.gain, t, 0.003, acc ? 0.5 : 0.38, sd * 0.55, sd * 0.95);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = f;
    o1.detune.value = this.pitchCents;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f;
    o2.detune.value = this.pitchCents - 7;
    const sub = ctx.createGain();
    sub.gain.value = 0.6;
    o1.connect(fl);
    o2.connect(sub);
    sub.connect(fl);
    fl.connect(amp);
    amp.connect(g.levels[2]);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      sub.disconnect();
      fl.disconnect();
      amp.disconnect();
    };
    const end = t + sd * 0.95 + 0.03;
    o1.start(t);
    o2.start(t);
    o1.stop(end);
    o2.stop(end);
  }

  private duck(p: AudioParam, t: number, depth: number, rel: number): void {
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(depth, t + 0.008);
    p.linearRampToValueAtTime(1, t + rel);
  }

  // ------------------------------------------------------------ voices

  private env(p: AudioParam, t: number, a: number, v: number, hold: number, dur: number): void {
    const peak = Math.max(0.0008, v);
    const at = Math.min(Math.max(0.001, a), dur * 0.6);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + at);
    if (hold > at) p.setValueAtTime(peak, t + Math.min(hold, dur - 0.01));
    p.exponentialRampToValueAtTime(0.0006, t + dur);
  }

  private tone(o: ToneOpts): OscillatorNode | null {
    const g = this.g;
    if (!g) return null;
    const isSfx = !o.mus;
    if (isSfx && this.voices >= MAX_VOICES && !o.force) return null;
    const ctx = g.ctx;
    const t = Math.max(o.t, ctx.currentTime);
    const dur = Math.max(0.02, o.dur);
    const osc = ctx.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave);
    else osc.type = o.type ?? 'sine';
    const f = safeF(o.f);
    osc.frequency.setValueAtTime(f, t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(safeF(o.f2), t + Math.min(o.glide ?? dur, dur));
    if (o.jitter && o.jitter > 0.004) {
      for (let tt = t + o.jitter; tt < t + dur; tt += o.jitter) {
        osc.frequency.setValueAtTime(safeF(f * (0.35 + Math.random() * 1.3)), tt);
      }
    }
    osc.detune.value = (o.detune ?? 0) + this.pitchCents;
    const amp = ctx.createGain();
    this.env(amp.gain, t, o.a ?? 0.004, o.v, o.hold ?? 0, dur);
    const nodes: AudioNode[] = [osc, amp];
    let head: AudioNode = osc;
    if (o.lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(safeF(o.lp), t);
      if (o.lp2) fl.frequency.exponentialRampToValueAtTime(safeF(o.lp2), t + dur);
      fl.Q.value = o.q ?? 0.7;
      head.connect(fl);
      head = fl;
      nodes.push(fl);
    }
    if (o.hp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'highpass';
      fl.frequency.value = safeF(o.hp);
      head.connect(fl);
      head = fl;
      nodes.push(fl);
    }
    head.connect(amp);
    amp.connect(o.dest ?? (isSfx ? g.sfx : g.music));
    if (o.rev) {
      const s = ctx.createGain();
      s.gain.value = o.rev;
      amp.connect(s);
      s.connect(g.sfxRev);
      nodes.push(s);
    }
    const onEnd = o.onEnd;
    osc.onended = () => {
      for (const n of nodes) n.disconnect();
      if (isSfx) this.voices = Math.max(0, this.voices - 1);
      if (onEnd) onEnd();
    };
    osc.start(t);
    osc.stop(t + dur + 0.03);
    if (isSfx) this.voices++;
    return osc;
  }

  private noise(o: NoiseOpts): void {
    const g = this.g;
    if (!g) return;
    const isSfx = !o.mus;
    if (isSfx && this.voices >= MAX_VOICES && !o.force) return;
    const ctx = g.ctx;
    const t = Math.max(o.t, ctx.currentTime);
    const dur = Math.max(0.01, o.dur);
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    src.detune.value = this.pitchCents;
    const fl = ctx.createBiquadFilter();
    fl.type = o.type ?? 'lowpass';
    fl.frequency.setValueAtTime(safeF(o.f), t);
    if (o.f2 !== undefined) fl.frequency.exponentialRampToValueAtTime(safeF(o.f2), t + dur);
    fl.Q.value = o.q ?? 0.7;
    const amp = ctx.createGain();
    this.env(amp.gain, t, o.a ?? 0.003, o.v, o.hold ?? 0, dur);
    src.connect(fl);
    fl.connect(amp);
    amp.connect(o.dest ?? (isSfx ? g.sfx : g.music));
    let send: GainNode | null = null;
    if (o.rev) {
      send = ctx.createGain();
      send.gain.value = o.rev;
      amp.connect(send);
      send.connect(g.sfxRev);
    }
    src.onended = () => {
      src.disconnect();
      fl.disconnect();
      amp.disconnect();
      if (send) send.disconnect();
      if (isSfx) this.voices = Math.max(0, this.voices - 1);
    };
    src.start(t, Math.random() * 1.9);
    src.stop(t + dur + 0.03);
    if (isSfx) this.voices++;
  }

  private ok(key: string, gap: number, now: number): boolean {
    const l = this.last.get(key);
    if (l !== undefined && now - l < gap) return false;
    this.last.set(key, now);
    return true;
  }

  // ------------------------------------------------------------ SFX

  private sfxFor(g: Graph, e: SimEvent, t: number): void {
    switch (e.t) {
      case 'shoot': {
        if (e.team === 0) {
          if (!this.ok('shoot0', 0.035, t)) return;
          const p = vary(0.08);
          this.tone({ t, f: 1900 * p, f2: 620 * p, glide: 0.07, type: 'square', dur: 0.08, v: 0.05, a: 0.002, lp: 5200 });
          this.tone({ t, f: 3800 * p, f2: 1500 * p, glide: 0.04, type: 'sine', dur: 0.04, v: 0.025, a: 0.001 });
        } else {
          if (!this.ok('shoot1', 0.045, t)) return;
          const p = vary(0.1);
          this.tone({ t, f: 430 * p, f2: 170 * p, type: 'sawtooth', dur: 0.11, v: 0.035, a: 0.003, lp: 1800, q: 3 });
        }
        return;
      }
      case 'hit': {
        if (e.crit) {
          if (!this.ok('crit', 0.04, t)) return;
          const p = vary(0.06);
          this.tone({ t, f: 2600 * p, f2: 3600 * p, type: 'square', dur: 0.05, v: 0.04, a: 0.001, lp: 7000 });
          this.tone({ t, f: 5200 * p, type: 'sine', dur: 0.07, v: 0.025, a: 0.001 });
        } else {
          if (!this.ok('hit', 0.03, t)) return;
          const p = vary(0.08);
          this.tone({ t, f: 1400 * p, f2: 850 * p, type: 'triangle', dur: 0.03, v: 0.045, a: 0.001 });
        }
        return;
      }
      case 'kill': {
        if (!this.ok('kill', 0.03, t)) return;
        const sz = clamp((num(e.r, 0.5) - 0.3) / 1.5, 0, 1.5) + (e.elite ? 0.4 : 0);
        const p = vary(0.08);
        this.noise({
          t, dur: 0.1 + 0.12 * sz, v: 0.5 + 0.2 * sz, a: 0.002, type: 'lowpass', f: 3800 * p, f2: 280,
          q: 1.5, dest: g.dist, rev: sz > 0.6 ? 0.3 : 0,
        });
        this.tone({ t, f: (260 / (1 + sz)) * p, f2: 42, type: 'sine', dur: 0.14 + 0.16 * sz, v: 0.2 + 0.05 * sz, a: 0.002 });
        return;
      }
      case 'playerHit': {
        if (!this.ok('playerHit', 0.08, t)) return;
        if (e.shield) {
          const p = vary(0.04);
          for (const [f, d, v] of [[1760, 0, 0.06], [2637, 0.012, 0.045], [3520, 0.024, 0.03], [5274, 0.03, 0.015]]) {
            this.tone({ t: t + d, f: f * p, type: 'sine', dur: 0.45, v, a: 0.002, rev: 0.35, force: true });
          }
        } else {
          this.tone({ t, f: 150, f2: 38, type: 'sine', dur: 0.28, v: 0.7, a: 0.002, dest: g.dist, force: true });
          this.tone({ t, f: 90, f2: 50, type: 'square', dur: 0.15, v: 0.18, a: 0.002, lp: 900, force: true });
          this.noise({ t, dur: 0.2, v: 0.9, a: 0.002, type: 'lowpass', f: 5000, f2: 600, rate: 0.22, dest: g.crush, force: true });
        }
        return;
      }
      case 'playerDeath': {
        this.noise({ t, dur: 1.8, v: 0.32, a: 0.005, type: 'lowpass', f: 7000, f2: 90, q: 2, rev: 0.6, force: true });
        this.tone({ t, f: 110, f2: 24, type: 'sine', dur: 2.0, v: 0.55, a: 0.005, force: true });
        this.tone({ t, f: 880, f2: 50, type: 'sawtooth', dur: 2.2, v: 0.07, a: 0.01, lp: 3000, lp2: 200, rev: 0.4, force: true });
        this.noise({ t, dur: 0.4, v: 0.9, a: 0.002, type: 'lowpass', f: 4000, f2: 400, rate: 0.15, dest: g.crush, force: true });
        return;
      }
      case 'dash': {
        if (!this.ok('dash', 0.06, t)) return;
        const p = vary(0.08);
        this.noise({ t, dur: 0.24, v: 0.15, a: 0.035, type: 'bandpass', f: 450 * p, f2: 3200 * p, q: 1.6 });
        this.tone({ t, f: 220 * p, f2: 520 * p, type: 'sine', dur: 0.16, v: 0.04, a: 0.01 });
        return;
      }
      case 'emp': {
        if (!this.ok('emp', 0.15, t)) return;
        this.tone({ t, f: 95, f2: 26, type: 'sine', dur: 1.1, v: 0.6, a: 0.003, force: true });
        this.noise({ t, dur: 0.7, v: 0.28, a: 0.003, type: 'lowpass', f: 2400, f2: 70, q: 1.5, rev: 0.5, force: true });
        [0, 0.05, 0.1, 0.15].forEach((d, i) => {
          const f0 = 700 * (1 + i * 0.5);
          this.tone({ t: t + d, f: f0, f2: f0 * 4, type: 'triangle', dur: 0.8, v: 0.03, a: 0.08, rev: 0.6, force: true });
        });
        return;
      }
      case 'explode': {
        if (!this.ok('explode', 0.04, t)) return;
        const sz = clamp(num(e.r, 2) / 3, 0.3, 2);
        const v = e.team === 1 ? 0.8 : 1;
        const p = vary(0.08);
        this.noise({
          t, dur: 0.25 + 0.3 * sz, v: (0.2 + 0.08 * sz) * v, a: 0.002, type: 'lowpass', f: 4500 * p, f2: 140,
          q: 1.2, rev: sz > 1 ? 0.35 : 0.1,
        });
        this.tone({ t, f: 90 * p, f2: 32, type: 'sine', dur: 0.2 + 0.3 * sz, v: 0.3 * v, a: 0.002 });
        return;
      }
      case 'pickup': {
        if (e.kind === 'heal') {
          if (!this.ok('pickupHeal', 0.1, t)) return;
          this.tone({ t, f: 880, type: 'sine', dur: 0.35, v: 0.07, a: 0.003, rev: 0.25 });
          this.tone({ t: t + 0.09, f: 1318.5, type: 'sine', dur: 0.45, v: 0.07, a: 0.003, rev: 0.25 });
          this.tone({ t: t + 0.09, f: 2637, type: 'triangle', dur: 0.25, v: 0.015, a: 0.003 });
        } else {
          if (!this.ok('pickup', 0.035, t)) return;
          this.dataStep = this.lastData >= 0 && t - this.lastData < 0.45 ? Math.min(this.dataStep + 1, PENTA.length - 1) : 0;
          this.lastData = t;
          const f = 1046.5 * Math.pow(2, PENTA[this.dataStep] / 12);
          this.tone({ t, f, f2: f * 1.06, type: 'sine', dur: 0.07, v: 0.028, a: 0.002 });
        }
        return;
      }
      case 'spawn': {
        if (BOSS_TYPES.has(e.type)) {
          if (!this.ok('bossSpawn', 2, t)) return;
          this.tone({ t, f: 38, f2: 80, type: 'sawtooth', dur: 2.4, v: 0.2, a: 1.6, lp: 180, lp2: 1800, q: 4, rev: 0.4, force: true });
          this.tone({ t, f: 55, f2: 58, type: 'sine', dur: 2.6, v: 0.3, a: 1.2, force: true });
          this.noise({ t, dur: 2.2, v: 0.08, a: 1.8, type: 'bandpass', f: 200, f2: 2600, q: 3, rev: 0.5, force: true });
        } else {
          if (!this.ok('spawn', 0.05, t)) return;
          this.tone({ t, f: 600 + Math.random() * 400, type: 'square', dur: 0.07, v: 0.018, a: 0.002, lp: 2600, jitter: 0.018 });
        }
        return;
      }
      case 'chain': {
        if (!this.ok('chain', 0.045, t)) return;
        const segs = clamp(Math.floor((e.pts?.length ?? 4) / 2) - 1, 1, 5);
        const dur = 0.08 + 0.025 * segs;
        this.tone({ t, f: 320 * vary(0.1), type: 'square', dur, v: 0.045, a: 0.002, hp: 700, jitter: 0.011 });
        this.noise({ t, dur: dur * 0.7, v: 0.05, a: 0.001, type: 'highpass', f: 4000 });
        return;
      }
      case 'blocked': {
        if (!this.ok('blocked', 0.04, t)) return;
        const p = vary(0.06);
        this.tone({ t, f: 1900 * p, type: 'triangle', dur: 0.18, v: 0.045, a: 0.001 });
        this.tone({ t, f: 2790 * p, type: 'sine', dur: 0.12, v: 0.03, a: 0.001 });
        return;
      }
      case 'bounce': {
        if (!this.ok('bounce', 0.04, t)) return;
        const p = vary(0.08);
        this.tone({ t, f: 900 * p, f2: 680 * p, type: 'triangle', dur: 0.025, v: 0.028, a: 0.001 });
        return;
      }
      case 'charge': {
        if (!this.ok('charge', 0.12, t)) return;
        const p = vary(0.07);
        this.tone({ t, f: 70 * p, f2: 230 * p, type: 'sawtooth', dur: 0.5, v: 0.3, a: 0.02, lp: 300, lp2: 2200, q: 5, dest: g.dist });
        this.tone({ t, f: 73 * p, f2: 236 * p, type: 'square', dur: 0.5, v: 0.05, a: 0.02, lp: 1200 });
        return;
      }
      case 'snipe': {
        if (!this.ok('snipe', 0.06, t)) return;
        this.noise({ t, dur: 0.07, v: 0.22, a: 0.001, type: 'highpass', f: 2200 * vary(0.08) });
        this.tone({ t, f: 2300, f2: 220, type: 'square', dur: 0.06, v: 0.05, a: 0.001, lp: 6000 });
        return;
      }
      case 'waveStart': {
        if (!this.ok('waveStart', 0.5, t)) return;
        if (e.boss) {
          for (let i = 0; i < 6; i++) {
            this.tone({
              t: t + i * 0.28, f: i % 2 === 0 ? 660 : 880, type: 'sawtooth', dur: 0.27, v: 0.05, a: 0.01, hold: 0.24,
              lp: 2400, q: 2, force: true,
            });
          }
          this.impact(g, t + 1.7, 1.3);
        } else {
          this.noise({ t, dur: 1.0, v: 0.1, a: 0.9, type: 'bandpass', f: 300, f2: 4200, q: 2.5, force: true });
          this.tone({ t, f: 110, f2: 440, type: 'sawtooth', dur: 1.0, v: 0.04, a: 0.85, lp: 600, lp2: 3000, force: true });
          this.impact(g, t + 0.95, 1);
        }
        return;
      }
      case 'waveClear': {
        if (!this.ok('waveClear', 0.5, t)) return;
        const base = SECTORS[clamp(Math.floor(num(e.sector, this.sector)), 0, SECTORS.length - 1)].root + 36;
        const steps = e.boss ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12, 16];
        steps.forEach((s, i) => {
          const f = mtof(base + s);
          this.tone({ t: t + i * 0.07, f, type: 'triangle', dur: 0.55, v: 0.06, a: 0.003, rev: 0.35, force: true });
          this.tone({ t: t + i * 0.07, f, type: 'square', dur: 0.2, v: 0.018, a: 0.003, lp: 4000, force: true });
        });
        return;
      }
      case 'bossPhase': {
        if (!this.ok('bossPhase', 0.4, t)) return;
        for (let i = 0; i < 7; i++) {
          const tt = t + i * 0.05;
          this.noise({ t: tt, dur: 0.03, v: 0.16, a: 0.001, type: 'bandpass', f: 800 + Math.random() * 3200, q: 2, force: true });
          this.tone({ t: tt, f: 200 + Math.random() * 1000, type: 'square', dur: 0.03, v: 0.04, a: 0.001, force: true });
        }
        const d = t + 0.36;
        this.tone({ t: d, f: 1400, f2: 50, type: 'sawtooth', dur: 1.3, v: 0.09, a: 0.01, lp: 4000, lp2: 200, rev: 0.4, force: true });
        this.noise({ t: d, dur: 1.3, v: 0.12, a: 0.01, type: 'lowpass', f: 6000, f2: 200, rev: 0.3, force: true });
        this.tone({ t: d, f: 70, f2: 30, type: 'sine', dur: 0.9, v: 0.4, a: 0.003, force: true });
        return;
      }
      case 'bossDeath': {
        if (!this.ok('bossDeath', 1, t)) return;
        this.tone({ t, f: 65, f2: 18, type: 'sine', dur: 2.8, v: 0.7, a: 0.003, force: true });
        this.noise({ t, dur: 2.6, v: 0.4, a: 0.003, type: 'lowpass', f: 9000, f2: 90, q: 1.2, rev: 0.9, force: true });
        this.noise({ t, dur: 0.6, v: 0.9, a: 0.002, type: 'lowpass', f: 5000, f2: 300, dest: g.dist, force: true });
        for (const [d, s] of [[0.18, 0.9], [0.42, 1.2], [0.75, 1.5]]) {
          this.noise({ t: t + d, dur: 0.5 * s, v: 0.25, a: 0.002, type: 'lowpass', f: 4000, f2: 150, rev: 0.6, force: true });
          this.tone({ t: t + d, f: 100 / s, f2: 30, type: 'sine', dur: 0.4 * s, v: 0.35, a: 0.002, force: true });
        }
        this.tone({ t: t + 0.1, f: 2400, f2: 200, type: 'triangle', dur: 2.2, v: 0.04, a: 0.05, rev: 0.8, force: true });
        return;
      }
      case 'heal': {
        if (!this.ok('heal', 0.12, t)) return;
        this.tone({ t, f: 520, f2: 1040, glide: 0.25, type: 'sine', dur: 0.4, v: 0.05, a: 0.01, rev: 0.3 });
        this.tone({ t: t + 0.06, f: 1560, type: 'triangle', dur: 0.3, v: 0.02, a: 0.01, rev: 0.3 });
        return;
      }
    }
  }

  /** Low thump used at the end of wave risers. */
  private impact(g: Graph, t: number, size: number): void {
    this.tone({ t, f: 85, f2: 30, type: 'sine', dur: 0.6 * size, v: 0.5, a: 0.002, force: true });
    this.noise({ t, dur: 0.4 * size, v: 0.22, a: 0.002, type: 'lowpass', f: 3500, f2: 120, rev: 0.5, force: true });
    this.noise({ t, dur: 0.15, v: 0.6, a: 0.002, type: 'lowpass', f: 3000, f2: 400, dest: g.dist, force: true });
  }
}
