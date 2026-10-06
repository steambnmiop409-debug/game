import { rng } from '../core/util';

/**
 * 표본 단위 악기 합성 (오프라인 → AudioBuffer).
 * 실제 녹음이 없는 악기만 여기서 만든다: 오르골, 첼레스타, 장난감 피아노, 비브라폰,
 * 유리 하모니카, 크로탈레스, 우쿨렐레, 그리고 사람의 목소리(허밍·합창·녹음기 속 목소리).
 *
 * 금속 막대·빗살 악기는 '모드 합성'(실제 진동 모드의 주파수 비와 감쇠)으로 만든다.
 *  - 오르골 빗살(한쪽 고정 막대): 1 : 5.93 : 17.6 근처 (이론값 1 : 6.27 : 17.55, 실제 빗살은 무게추로 조율)
 *  - 비브라폰 막대(가운데를 깎아 조율): 1 : 4 : 10
 *  - 첼레스타: 공명 상자 덕분에 기본음이 강하고, 2.76·5.40 부분음이 빠르게 사라진다
 */

export const SR = 44100;
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Mode {
  ratio: number;
  amp: number;
  /** 진폭이 1/e가 되는 시간 (초) */
  decay: number;
  /** 센트 */
  detune?: number;
}

export interface ModalOpts {
  dur: number;
  attack?: number;
  /** 타격 잡음 크기 */
  click?: number;
  /** 타격 잡음 밝기 (0..1) */
  clickBright?: number;
  /** 타격 순간의 '쿵' (펠트 해머, 나무 몸통) */
  thump?: number;
  thumpFreq?: number;
  /** 진폭 떨림 (비브라폰 모터) */
  tremRate?: number;
  tremDepth?: number;
  /** 시작 순간의 음정 휨 (센트, 빠르게 0으로) */
  bend?: number;
  seed?: number;
}

export function makeBuffer(ctx: BaseAudioContext, data: Float32Array, sr = SR): AudioBuffer {
  const b = ctx.createBuffer(1, data.length, sr);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return b;
}

export function normalize(d: Float32Array, peak = 0.89) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return d;
}

/** 모드 합성 */
export function modal(f0: number, modes: Mode[], o: ModalOpts): Float32Array {
  const n = Math.floor(o.dur * SR);
  const out = new Float32Array(n);
  const r = rng(o.seed ?? Math.floor(f0 * 7));
  const atk = o.attack ?? 0.0015;
  for (const m of modes) {
    const f = f0 * m.ratio * Math.pow(2, (m.detune ?? 0) / 1200);
    if (f >= SR * 0.45) continue;
    const w = (2 * Math.PI * f) / SR;
    const k = Math.exp(-1 / (m.decay * SR));
    let env = m.amp;
    let ph = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let ww = w;
      if (o.bend) ww = w * Math.pow(2, (o.bend * Math.exp(-t * 60)) / 1200);
      ph += ww;
      const a = atk > 0 ? 1 - Math.exp(-t / atk) : 1;
      out[i] += Math.sin(ph) * env * a;
      env *= k;
    }
  }
  // 타격 잡음
  if (o.click) {
    const len = Math.floor(0.012 * SR);
    let y = 0;
    const br = o.clickBright ?? 0.5;
    const a = Math.exp((-2 * Math.PI * (800 + br * 7000)) / SR);
    for (let i = 0; i < len && i < n; i++) {
      const e = Math.exp(-i / (0.0018 * SR));
      y = (1 - a) * (r() * 2 - 1) + a * y;
      out[i] += y * e * o.click * (br > 0.6 ? 1.6 : 1);
    }
  }
  if (o.thump) {
    const ff = o.thumpFreq ?? 180;
    const len = Math.floor(0.08 * SR);
    for (let i = 0; i < len && i < n; i++) {
      const t = i / SR;
      out[i] += Math.sin(2 * Math.PI * ff * t * (1 - t * 2)) * Math.exp(-t / 0.012) * o.thump;
    }
  }
  if (o.tremRate) {
    const d = o.tremDepth ?? 0.3;
    for (let i = 0; i < n; i++) out[i] *= 1 - d * 0.5 * (1 + Math.sin((2 * Math.PI * o.tremRate * i) / SR));
  }
  // 끝 페이드
  const fl = Math.min(n, Math.floor(0.03 * SR));
  for (let i = 0; i < fl; i++) out[n - 1 - i] *= i / fl;
  return out;
}

// ───────────────────────────── 악기 ─────────────────────────────

export function musicBox(midi: number, seed = 1) {
  const f = mtof(midi);
  const hi = Math.max(0.3, 1 - (midi - 72) / 48);
  return normalize(
    modal(
      f,
      [
        { ratio: 1, amp: 1, decay: 1.9 * hi },
        { ratio: 1, amp: 0.25, decay: 1.6 * hi, detune: 2.5 },
        { ratio: 2.0, amp: 0.05, decay: 0.5 },
        { ratio: 5.93, amp: 0.2, decay: 0.32 },
        { ratio: 17.6, amp: 0.06, decay: 0.07 },
      ],
      { dur: 3.2, click: 0.35, clickBright: 0.95, bend: 18, seed: midi * 3 + seed },
    ),
    0.8,
  );
}

export function celesta(midi: number) {
  const f = mtof(midi);
  return normalize(
    modal(
      f,
      [
        { ratio: 1, amp: 1, decay: 1.35 },
        { ratio: 1, amp: 0.4, decay: 1.1, detune: -3 },
        { ratio: 2.76, amp: 0.1, decay: 0.18 },
        { ratio: 4.0, amp: 0.05, decay: 0.3 },
        { ratio: 5.4, amp: 0.03, decay: 0.07 },
      ],
      { dur: 3, attack: 0.003, click: 0.05, clickBright: 0.2, thump: 0.18, thumpFreq: 260, seed: midi },
    ),
    0.8,
  );
}

export function toyPiano(midi: number) {
  const f = mtof(midi);
  return normalize(
    modal(
      f,
      [
        { ratio: 1, amp: 1, decay: 0.9 },
        { ratio: 1, amp: 0.5, decay: 0.7, detune: 9 },
        { ratio: 3.93, amp: 0.38, decay: 0.22 },
        { ratio: 6.6, amp: 0.15, decay: 0.08 },
        { ratio: 9.8, amp: 0.12, decay: 0.05 },
      ],
      { dur: 1.8, click: 0.25, clickBright: 0.75, thump: 0.3, thumpFreq: 140, seed: midi * 5 },
    ),
    0.8,
  );
}

export function vibraphone(midi: number, motor = true) {
  const f = mtof(midi);
  return normalize(
    modal(
      f,
      [
        { ratio: 1, amp: 1, decay: 2.8 },
        { ratio: 3.98, amp: 0.2, decay: 0.7 },
        { ratio: 9.9, amp: 0.05, decay: 0.18 },
      ],
      { dur: 5, attack: 0.002, click: 0.08, clickBright: 0.3, thump: 0.08, thumpFreq: 400, tremRate: motor ? 5.3 : 0, tremDepth: 0.38, seed: midi * 11 },
    ),
    0.8,
  );
}

export function crotale(midi: number) {
  const f = mtof(midi);
  return normalize(
    modal(
      f,
      [
        { ratio: 1, amp: 1, decay: 2.2 },
        { ratio: 2.0, amp: 0.12, decay: 0.8 },
        { ratio: 4.18, amp: 0.06, decay: 0.3 },
      ],
      { dur: 3.5, attack: 0.001, click: 0.06, clickBright: 0.9, seed: midi * 17 },
    ),
    0.7,
  );
}

/** 유리 하모니카: 젖은 손가락이 돌아가는 유리 그릇을 문지르는 소리 */
export function glassHarmonica(midi: number, dur: number, seed = 3) {
  const f = mtof(midi);
  const n = Math.floor((dur + 1.2) * SR);
  const out = new Float32Array(n);
  const r = rng(seed + midi);
  let lfo = 0;
  let lfoT = 0;
  let ph1 = 0;
  let ph2 = 0;
  let ph3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 512 === 0) lfoT = r() * 2 - 1;
    lfo += (lfoT - lfo) * 0.0004;
    const vib = 1 + 0.0012 * Math.sin(2 * Math.PI * 4.6 * t) + lfo * 0.0009;
    ph1 += (2 * Math.PI * f * vib) / SR;
    ph2 += (2 * Math.PI * f * 2.003 * vib) / SR;
    ph3 += (2 * Math.PI * f * 3.01 * vib) / SR;
    const atk = 1 - Math.exp(-t / 0.22);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.35) : 1;
    const rub = 1 + lfo * 0.12 + 0.04 * Math.sin(2 * Math.PI * 6.3 * t);
    out[i] = (Math.sin(ph1) + 0.07 * Math.sin(ph2) + 0.025 * Math.sin(ph3)) * atk * rel * rub;
  }
  return normalize(out, 0.7);
}

/** 활로 그은 비브라폰 */
export function bowedVibe(midi: number, dur: number) {
  const f = mtof(midi);
  const n = Math.floor((dur + 2.5) * SR);
  const out = new Float32Array(n);
  const r = rng(midi * 29);
  let ph = 0;
  let ph4 = 0;
  // 활털 잡음을 음 근처로 공명시키는 2극 공명기
  const rr = Math.exp((-Math.PI * 12) / SR);
  const a1 = -2 * rr * Math.cos((2 * Math.PI * f) / SR);
  const a2 = rr * rr;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR;
    ph4 += (2 * Math.PI * f * 3.98) / SR;
    const atk = 1 - Math.exp(-t / 0.45);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.9) : 1;
    const x = (r() * 2 - 1) * (t < dur ? 1 : 0);
    const y = x * (1 - rr) * 0.6 - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    out[i] = (Math.sin(ph) + 0.05 * Math.sin(ph4)) * atk * rel * (1 - 0.1 * Math.sin(2 * Math.PI * 0.7 * t)) + y * 0.4 * atk;
  }
  return normalize(out, 0.7);
}

/** 카플러스-스트롱 우쿨렐레 (나일론 현) */
export function ukulele(midi: number, seed = 1) {
  const f = mtof(midi);
  const N = Math.max(2, Math.round(SR / f));
  const n = Math.floor(1.8 * SR);
  const out = new Float32Array(n);
  const r = rng(midi * 41 + seed);
  const buf = new Float32Array(N);
  // 손가락 위치: 노이즈를 부드럽게 (나일론 + 손끝)
  let y = 0;
  for (let i = 0; i < N; i++) {
    y = 0.55 * y + 0.45 * (r() * 2 - 1);
    buf[i] = y;
  }
  let idx = 0;
  let last = 0;
  const damp = 0.9965 - (midi - 60) * 0.0002;
  for (let i = 0; i < n; i++) {
    const cur = buf[idx];
    const next = buf[(idx + 1) % N];
    const v = damp * (0.5 * (cur + next));
    buf[idx] = 0.7 * v + 0.3 * last;
    last = v;
    out[i] = cur;
    idx = (idx + 1) % N;
  }
  // 몸통 공명 (작은 나무 상자)
  resonate(out, 260, 30, 0.25);
  resonate(out, 520, 60, 0.12);
  return normalize(out, 0.75);
}

/** 2극 공명기를 병렬로 더한다 (몸통 울림) */
export function resonate(d: Float32Array, freq: number, bw: number, mix: number) {
  const rr = Math.exp((-Math.PI * bw) / SR);
  const a1 = -2 * rr * Math.cos((2 * Math.PI * freq) / SR);
  const a2 = rr * rr;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const y = d[i] * (1 - rr) - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    d[i] += y * mix * 6;
  }
}

// ───────────────────────────── 목소리 ─────────────────────────────

/** 모음별 포먼트 (성인 여성 기준 Hz, 대역폭) */
const VOWELS: Record<string, [number, number][]> = {
  m: [
    [260, 70],
    [1050, 300],
    [2300, 300],
  ],
  n: [
    [280, 80],
    [1500, 300],
    [2500, 300],
  ],
  u: [
    [330, 70],
    [870, 100],
    [2350, 140],
  ],
  o: [
    [480, 80],
    [900, 100],
    [2700, 150],
  ],
  a: [
    [850, 90],
    [1250, 110],
    [2850, 160],
  ],
  e: [
    [560, 80],
    [1950, 120],
    [2850, 160],
  ],
  i: [
    [320, 60],
    [2600, 140],
    [3300, 200],
  ],
  eo: [
    [650, 90],
    [1100, 110],
    [2700, 160],
  ],
  eu: [
    [380, 70],
    [1500, 110],
    [2600, 160],
  ],
  ae: [
    [700, 90],
    [1800, 120],
    [2700, 160],
  ],
};

export interface SungNote {
  midi: number;
  /** 시작 (초) */
  t: number;
  dur: number;
  vowel?: string;
  /** 자음 (잡음 파열) */
  cons?: 'p' | 't' | 'k' | 's' | 'h' | 'ch' | 'j' | 'b' | 'g' | 'd' | 'n' | 'm' | 'l' | '';
  vel?: number;
}

export interface VoiceOpts {
  /** 포먼트 배율 (어른 여성 1, 아이 1.2, 장난감 0.9) */
  formantScale?: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  /** 음 사이를 미끄러지는 시간 */
  glide?: number;
  breath?: number;
  /** 허밍(입을 다문 소리)의 코 막힘 정도 */
  closed?: number;
  seed?: number;
  /** 시작 전에 들이마시는 숨 */
  inhale?: boolean;
  /** 음 시작을 아래에서 끌어올림 (센트) */
  scoop?: number;
  tail?: number;
  jitter?: number;
}

/**
 * 포먼트 목소리 합성: 로젠버그 성문 펄스 → 숨 잡음 → 성도(포먼트 공명기 직렬) → 입/코 방사.
 * 엄마의 허밍, 아이들의 합창, 녹음기 속의 목소리에 쓴다.
 */
export function sing(notes: SungNote[], o: VoiceOpts = {}): Float32Array {
  const fs = o.formantScale ?? 1;
  const vr = o.vibratoRate ?? 5.1;
  const vd = o.vibratoDepth ?? 0.3;
  const glide = o.glide ?? 0.07;
  const breath = o.breath ?? 0.05;
  const closed = o.closed ?? 0;
  const r = rng(o.seed ?? 77);
  const pre = o.inhale ? 0.7 : 0.05;
  const end = Math.max(...notes.map((n) => n.t + n.dur)) + (o.tail ?? 0.5);
  const N = Math.floor((end + pre) * SR);
  const out = new Float32Array(N);
  const sorted = [...notes].sort((a, b) => a.t - b.t);

  // 음별 시점 계산용
  let ni = 0;
  let phase = 0;
  let f = mtof(sorted[0].midi);
  let jit = 0;
  let jitT = 0;
  let amp = 0;
  // 포먼트 상태 (3개의 2극 공명기)
  const st = [0, 0, 0, 0, 0, 0];
  const curF = VOWELS[sorted[0].vowel ?? 'm'].map((p) => [p[0] * fs, p[1]]);
  let nasY = 0;
  let lpY = 0;
  let prevGlottal = 0;

  for (let i = 0; i < N; i++) {
    const t = i / SR - pre;
    while (ni < sorted.length - 1 && t >= sorted[ni + 1].t - glide * 0.5) ni++;
    const nt = sorted[ni];
    const target = mtof(nt.midi);
    // 음 시작 끌어올림
    const since = t - nt.t;
    let cents = 0;
    if (o.scoop && since >= 0 && since < 0.12) cents = -o.scoop * (1 - since / 0.12);
    // 비브라토는 음 시작 0.25초 뒤부터 서서히
    const vibAmt = since > 0.25 ? Math.min(1, (since - 0.25) / 0.4) : 0;
    cents += vibAmt * vd * 100 * Math.sin(2 * Math.PI * vr * t + ni);
    // 미세 흔들림
    if (i % 400 === 0) jitT = (r() * 2 - 1) * (o.jitter ?? 0.004);
    jit += (jitT - jit) * 0.002;
    const goal = target * Math.pow(2, cents / 1200) * (1 + jit);
    f += (goal - f) * (1 - Math.exp(-1 / (Math.max(0.005, glide * 0.35) * SR)));

    // 진폭: 음이 있는 동안 1, 쉼에서 0
    const playing = t >= nt.t - 0.01 && t < nt.t + nt.dur;
    const next = sorted[ni + 1];
    const legato = next && next.t - (nt.t + nt.dur) < 0.03;
    let tgtAmp = playing || (legato && t < next.t) ? (nt.vel ?? 1) : 0;
    // 음과 음 사이의 작은 굴곡
    if (playing && since < 0.06) tgtAmp *= 0.82 + since * 3;
    // 올라갈 때 약 25ms, 내려갈 때 약 90ms
    const atk = tgtAmp > amp ? 0.0009 : 0.00025;
    amp += (tgtAmp - amp) * atk;

    // 모음 이동
    const vt = VOWELS[nt.vowel ?? 'm'];
    for (let k = 0; k < 3; k++) {
      curF[k][0] += (vt[k][0] * fs - curF[k][0]) * 0.0016;
      curF[k][1] += (vt[k][1] - curF[k][1]) * 0.0016;
    }

    // 성문 펄스 (로젠버그)
    phase += f / SR;
    if (phase >= 1) phase -= 1;
    const tp = 0.42;
    const tn = 0.18;
    let g = 0;
    if (phase < tp) g = 0.5 * (1 - Math.cos((Math.PI * phase) / tp));
    else if (phase < tp + tn) g = Math.cos((Math.PI * (phase - tp)) / (2 * tn));
    const dg = g - prevGlottal;
    prevGlottal = g;
    // 숨 잡음은 성문이 열린 동안 더 크다
    const noise = (r() * 2 - 1) * breath * (0.4 + g);
    let x = (dg * 40 + noise) * amp;

    // 자음: 음 시작 직전의 짧은 잡음/파열
    if (nt.cons && since > -0.07 && since < 0.02) {
      const c = nt.cons;
      const cn = r() * 2 - 1;
      const e = Math.exp(-Math.abs(since + 0.025) * 70);
      if (c === 's' || c === 'ch' || c === 'j') x += cn * 0.5 * e * (nt.vel ?? 1);
      else if (c === 'h') x += cn * 0.35 * e;
      else if (c === 'p' || c === 't' || c === 'k' || c === 'b' || c === 'd' || c === 'g') {
        if (since > -0.012 && since < 0.004) x += cn * 0.8 * Math.exp(-(since + 0.012) * 300);
      }
    }

    // 성도: 공명기 직렬
    let y = x;
    for (let k = 0; k < 3; k++) {
      const F = Math.min(curF[k][0], SR * 0.45);
      const B = curF[k][1];
      const rr = Math.exp((-Math.PI * B) / SR);
      const a1 = -2 * rr * Math.cos((2 * Math.PI * F) / SR);
      const a2 = rr * rr;
      const yy = y * (1 + a1 + a2) - a1 * st[k * 2] - a2 * st[k * 2 + 1];
      st[k * 2 + 1] = st[k * 2];
      st[k * 2] = yy;
      y = k === 0 ? yy : y * 0.35 + yy;
    }
    // 입을 다문 허밍: 코로만 나온다 → 어둡고 둥글다
    if (closed > 0) {
      nasY += (y - nasY) * 0.06;
      y = y * (1 - closed) + nasY * closed * 2.2;
    }
    // 입술 방사 (미분) + 부드러운 저역 통과
    lpY += (y - lpY) * 0.5;
    out[i] = lpY;
  }

  // 들이마시는 숨
  if (o.inhale) {
    let y = 0;
    for (let i = 0; i < Math.floor(0.55 * SR); i++) {
      const t = i / SR;
      const e = Math.sin((Math.PI * t) / 0.55) * 0.05;
      y = 0.85 * y + 0.15 * (r() * 2 - 1);
      out[i + Math.floor(0.05 * SR)] += y * e;
    }
  }
  return normalize(out, 0.8);
}

/**
 * 알아들을 수 없는 말 (녹음기·전화·장난감 음성 상자 속 목소리).
 * 음절 수와 모음, 억양만 실제 문장을 따른다. 자막이 뜻을 전한다.
 */
export function babble(syllables: string, o: { f0: number; rate: number; formantScale: number; seed: number; fall?: number }) {
  const parts = romanize(syllables);
  const notes: SungNote[] = [];
  let t = 0.05;
  const base = 12 * Math.log2(o.f0 / 440) + 69;
  parts.forEach((p, i) => {
    if (p.pause) {
      t += p.pause;
      return;
    }
    const prog = i / Math.max(1, parts.length - 1);
    const pitch = base + 2.2 * Math.sin(i * 1.7) - (o.fall ?? 3) * prog + (p.stress ? 2 : 0);
    const d = (p.long ? 0.24 : 0.15) / o.rate;
    notes.push({ midi: pitch, t, dur: d * 0.92, vowel: p.v, cons: p.c as SungNote['cons'], vel: p.stress ? 1 : 0.85 });
    t += d;
  });
  return sing(notes, { formantScale: o.formantScale, vibratoDepth: 0.05, glide: 0.05, breath: 0.12, seed: o.seed, jitter: 0.012, tail: 0.15 });
}

/** 한글 음절을 (자음, 모음) 근사로 바꾼다. 쉼표·마침표는 쉼 */
function romanize(s: string): { c: string; v: string; pause?: number; stress?: boolean; long?: boolean }[] {
  const CHO = ['g', 'g', 'n', 'd', 'd', 'l', 'm', 'b', 'b', 's', 's', '', 'j', 'j', 'ch', 'k', 't', 'p', 'h'];
  const JUNG = ['a', 'ae', 'a', 'ae', 'eo', 'e', 'eo', 'e', 'o', 'a', 'ae', 'e', 'o', 'u', 'eo', 'e', 'i', 'u', 'eu', 'i', 'i'];
  const out: { c: string; v: string; pause?: number; stress?: boolean; long?: boolean }[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const cho = Math.floor(idx / 588);
      const jung = Math.floor((idx % 588) / 28);
      const jong = idx % 28;
      out.push({ c: CHO[cho], v: JUNG[jung], long: jong !== 0 });
    } else if (ch === ',' || ch === '…') out.push({ c: '', v: '', pause: 0.22 });
    else if (ch === '.' || ch === '?' || ch === '!') {
      if (out.length) out[out.length - 1].long = true;
      if (ch === '!' && out.length) out[out.length - 1].stress = true;
      out.push({ c: '', v: '', pause: 0.35 });
    } else if (ch === ' ') out.push({ c: '', v: '', pause: 0.04 });
  }
  return out;
}

// ───────────────────────────── 잡음·환경 ─────────────────────────────

/** 이음매 없이 반복되는 잡음 (color: 0 흰, 1 분홍, 2 갈색) */
export function noiseLoop(seconds: number, color: 0 | 1 | 2, seed = 5) {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const r = rng(seed);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    br = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === 0) out[i] = w;
    else if (color === 1) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      br = (br + 0.02 * w) / 1.02;
      out[i] = br * 3.5;
    }
  }
  return crossfadeLoop(out, Math.floor(0.25 * SR));
}

/** 끝과 처음을 겹쳐 이음매를 없앤다 */
export function crossfadeLoop(d: Float32Array, fade: number) {
  const n = d.length - fade;
  const out = new Float32Array(n);
  out.set(d.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = d[i] * a + d[n + i] * (1 - a);
  }
  return out;
}

/** 단순 1극 저역/고역 통과 (제자리) */
export function onePole(d: Float32Array, cutoff: number, high = false) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  let px = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    y = (1 - a) * x + a * y;
    d[i] = high ? x - y : y;
    px = x;
  }
  void px;
  return d;
}

/** 대역 통과 (2극 공명기, 제자리) */
export function bandpass(d: Float32Array, freq: number, q: number) {
  const bw = freq / q;
  const rr = Math.exp((-Math.PI * bw) / SR);
  const a1 = -2 * rr * Math.cos((2 * Math.PI * freq) / SR);
  const a2 = rr * rr;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const y = d[i] * (1 - rr) - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
  return d;
}
