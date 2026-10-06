import { Emitter } from './events';
import { clamp } from './util';

/**
 * 건물의 심장 (G2). 게임 전체의 시계다.
 * 크리처의 걸음, 발소리 차폐, 음악, 조명이 모두 이 박동에 묶인다.
 *
 * 시간은 오디오 시계(초)를 쓴다. 소리는 미리(lookahead) 예약하고,
 * 게임 로직의 'lub' 이벤트는 실제로 그 시각이 되었을 때 발생한다.
 */
export interface HeartEvents extends Record<string, unknown> {
  /** 오디오 예약용: 아직 오지 않은 박동 (t = 오디오 시각) */
  schedule: { t: number; dubT: number; index: number; bpm: number; strength: number };
  /** 게임 로직용: 방금 '쿵' 했다 */
  lub: { index: number; bpm: number; t: number };
  /** 심정지가 끝나 다시 뛰기 시작했다 */
  restart: { bpm: number };
}

export class Heart extends Emitter<HeartEvents> {
  /** 현재 BPM (부드럽게 목표를 따라간다) */
  bpm = 60;
  /** 바닥 BPM: 퀴즈 오답(+15)처럼 챕터 끝까지 유지되는 상승분 */
  floor = 60;
  /** 일시적 상승분 (10초마다 -5) */
  private boost = 0;
  /** 난이도 배율 (G12.3) */
  mult = 1;
  /** 차폐 구간 반폭 (초) */
  maskHalf = 0.1;
  /** 강도 (소리 크기 배율) */
  strength = 1;

  private nextLub = 0;
  private index = 0;
  private pending: { t: number; index: number }[] = [];
  private lastLub = -10;
  private silentBeats = 0;
  private arrestBeats = 0;
  private arrestUntil = 0;
  private running = false;
  private decayAcc = 0;
  /** 게임 로직이 볼 수 있는, 최근과 다음 박동 시각 */
  private lubTimes: number[] = [];

  constructor(private readonly clock: () => number) {
    super();
  }

  get targetBpm() {
    return clamp((this.floor + this.boost) * this.mult, 30, 180);
  }

  get interval() {
    return 60 / Math.max(1, this.bpm);
  }

  get stopped() {
    return this.arrestBeats > 0 || this.clock() < this.arrestUntil;
  }

  start() {
    this.running = true;
    this.nextLub = this.clock() + 0.4;
  }

  stop() {
    this.running = false;
    this.pending.length = 0;
  }

  /** 일시적 상승 (발견 +20, 제세동기 +10 …) */
  add(delta: number) {
    this.boost = clamp(this.boost + delta, 0, 120);
  }

  /** 챕터 끝까지 남는 상승 (퀴즈 오답) */
  raiseFloor(delta: number) {
    this.floor = clamp(this.floor + delta, 40, 160);
  }

  /** 즉시 BPM 지정 (보스전 진입 등) */
  setImmediate(bpm: number) {
    this.boost = Math.max(0, bpm / this.mult - this.floor);
    this.bpm = bpm;
  }

  /** 침묵 예고 (S9-1): 다음 n박 동안 심장까지 멈춘다 */
  silence(beats = 2) {
    this.silentBeats = Math.max(this.silentBeats, beats);
  }

  /** 심정지: n박 동안 멈춘 뒤 140으로 튀어 오른다 */
  arrest(beats: number) {
    this.arrestBeats = beats;
  }

  /** 지금 차폐 구간 안인가 (박동 은신) */
  isMasked(now = this.clock()) {
    if (this.stopped) return false;
    for (const t of this.lubTimes) if (Math.abs(now - t) <= this.maskHalf) return true;
    return false;
  }

  /** 다음 '쿵'까지 남은 시간 (박동 걷기 보조용) */
  timeToNext(now = this.clock()) {
    for (const t of this.lubTimes) if (t >= now) return t - now;
    return this.interval;
  }

  /** 마지막 '쿵' 이후 지난 시간 */
  sinceLast(now = this.clock()) {
    return now - this.lastLub;
  }

  /** 화면 박동(0..1): '쿵' 직후 솟았다가 빠르게 사라진다 */
  pulse(now = this.clock()) {
    if (this.stopped) return 0;
    const a = now - this.lastLub;
    if (a < 0) return 0;
    const lub = Math.exp(-a * 9);
    const dubA = a - Math.min(0.32, this.interval * 0.35);
    const dub = dubA > 0 ? 0.55 * Math.exp(-dubA * 11) : 0;
    return clamp((lub + dub) * this.strength, 0, 1);
  }

  update(dt: number) {
    if (!this.running) return;
    const now = this.clock();
    // BPM은 목표를 부드럽게 따라간다
    const tgt = this.targetBpm;
    this.bpm += (tgt - this.bpm) * (1 - Math.exp(-dt * 1.2));
    // 일시적 상승분 감쇠: 10초마다 -5
    this.decayAcc += dt;
    if (this.decayAcc >= 10) {
      this.decayAcc -= 10;
      this.boost = Math.max(0, this.boost - 5);
    }
    // 오디오 시계가 멈췄다 다시 가면(탭 전환 등) 기준을 다시 잡는다
    if (this.nextLub < now - 1) this.nextLub = now + 0.05;

    // 미리 예약 (0.2초 앞까지)
    const ahead = 0.2;
    while (this.nextLub < now + ahead) {
      const t = this.nextLub;
      const iv = this.interval;
      if (this.arrestBeats > 0) {
        this.arrestBeats--;
        if (this.arrestBeats === 0) {
          // 끝나면 140으로 튀어 오른다
          this.arrestUntil = t + iv;
          this.boost = Math.max(this.boost, 140 / this.mult - this.floor);
          this.bpm = 140;
          this.emit('restart', { bpm: 140 });
        }
      } else if (this.silentBeats > 0) {
        this.silentBeats--;
      } else {
        this.index++;
        this.pending.push({ t, index: this.index });
        this.lubTimes.push(t);
        if (this.lubTimes.length > 4) this.lubTimes.shift();
        this.emit('schedule', { t, dubT: t + Math.min(0.32, iv * 0.35), index: this.index, bpm: this.bpm, strength: this.strength });
      }
      this.nextLub = t + iv;
    }

    // 실제로 도달한 박동을 게임 로직에 알린다
    while (this.pending.length && this.pending[0].t <= now) {
      const p = this.pending.shift()!;
      this.lastLub = p.t;
      this.emit('lub', { index: p.index, bpm: this.bpm, t: p.t });
    }
  }

  reset(bpm = 60) {
    this.floor = bpm;
    this.boost = 0;
    this.bpm = bpm;
    this.silentBeats = 0;
    this.arrestBeats = 0;
    this.arrestUntil = 0;
    this.pending.length = 0;
    this.lubTimes.length = 0;
    this.nextLub = this.clock() + 0.3;
  }
}
