import * as THREE from 'three';
import type { Game } from '../game';
import { Cancel } from '../game';
import { CHARTS, CREDITS, EXAMINE, GOALS, IMPOSSIBLE, L, NEXT, PART_NAMES, PROLOGUE, QUIZ, QUIZ_LINES, SCANS, TIPS, UNA, type Quiz } from '../data/text';
import { makeMarcus, walkPose } from '../entities/models';
import { Round } from '../entities/rounds';
import { mat } from '../world/materials';
import { rng } from '../core/util';
import { logoUrl } from '../ui/ui';

/**
 * 챕터 1 스크립트.
 * 체크포인트마다 '그 지점부터 시작할 때의 세계 상태'를 세우고, 이어서 연출을 진행한다.
 * 재시작되면 game.token이 바뀌어 진행 중이던 await가 Cancel로 끊긴다.
 */

const ORDER = ['prologue', 'gate', 'lobby', 'ward', 'una', 'quiz', 'r304', 'playroom', 'chase', 'basement', 'clean'] as const;
type Stage = (typeof ORDER)[number];

/** TV마다의 부품 */
const QUIZ_TVS: [string, number][] = [
  ['r301', 0],
  ['r303', 1],
  ['r305', 2],
  ['lounge', 3],
  ['r307', 4],
  ['r309', 5],
];

interface TVState {
  state: 'off' | 'idle' | 'ask' | 'right' | 'wrong' | 'done' | 'cool' | 'impossible';
  t: number;
  part: number;
  q: Quiz | null;
  /** 바닥에 떨어진 부품 메시 */
  drop?: THREE.Mesh;
}

export class Story {
  private g: Game;
  private tvs = new Map<string, TVState>();
  private quizPool: Quiz[] = [];
  private r = rng(1987);
  private patrolT = 0;
  private patrolOn = false;
  private marcus: ReturnType<typeof makeMarcus> | null = null;
  private marcusWalk = 0;
  private flags: Record<string, boolean> = {};
  private tvAnimT = 0;
  private hideBed: { under: THREE.Vector3; head: THREE.Vector3 } | null = null;
  private thing: THREE.Mesh | null = null;

  constructor(g: Game) {
    this.g = g;
  }

  // ───────────────────────────── 실행 ─────────────────────────────

  run(cp: string) {
    const g = this.g;
    g.token++;
    const tok = g.token;
    const start = Math.max(0, ORDER.indexOf(cp as Stage));
    this.reset(ORDER[start]);
    (async () => {
      for (let i = start; i < ORDER.length; i++) {
        await this.stage(ORDER[i], tok, i === start);
        g.check(tok);
      }
    })().catch((e) => {
      if (!(e instanceof Cancel)) console.error(e);
    });
  }

  /** 체크포인트 공통 초기화 */
  private reset(stage: Stage) {
    const g = this.g;
    g.vmForce = false;
    g.vm.env = 'normal';
    g.ui.clearSubs();
    g.ui.clearMenus();
    g.ui.card(null);
    g.ui.fade(false, 0.4);
    g.ui.scan(null);
    g.ui.quiz(null);
    g.inter.clear();
    g.scanTargets.clear();
    g.rounds.clear();
    g.hoppy.place(new THREE.Vector3(0, 0, 0), 0, 'hidden');
    g.una.show(false);
    g.una.sit = false;
    g.una.crouch = 0;
    g.una.standUp();
    g.player.mode = 'walk';
    g.player.holding = false;
    g.player.camOverride = null;
    g.player.lookLimit = null;
    g.player.hideAt = null;
    g.player.speedMul = 1;
    g.allowHold = !!g.save.flags.metUna;
    g.busy = false;
    g.warp = 0;
    g.red = 0;
    g.extraDim = 0;
    g.light.master = 1;
    g.music.chase = 0;
    g.music.tension = 0;
    g.music.zone = 0.5;
    g.audio.muffle(0, 0.2);
    g.audio.worldLevel(1, 0.2);
    g.audio.busLevel('music', 1, 0.2);
    g.onBeat = [];
    this.patrolOn = false;
    this.flags = {};
    this.thing?.removeFromParent();
    this.thing = null;
    if (this.marcus) {
      this.marcus.root.removeFromParent();
      this.marcus = null;
    }
    for (const k of ['engine', 'static', 'wind', 'pipes', 'room', 'elev', 'tvhum', 'machine', 'air']) g.stopLoop(k, 0.2);
    g.vm.tool = 'none';
    g.vm.pose = 'idle';
    // 문 상태
    const L0 = g.world.level;
    for (const d of L0.doors) {
      d.locked = !!d.def.locked;
      d.setOpen(!!d.def.open);
      d.angle = d.target;
      d.slide = d.open ? 1 : 0;
      d.update(0);
    }
    const idx = ORDER.indexOf(stage);
    if (idx > ORDER.indexOf('playroom')) {
      g.door('playroom').locked = false;
      g.door('playroom').setOpen(true);
    }
    if (idx >= ORDER.indexOf('chase')) g.door('staff').locked = false;
    // 형광등 상태 원래대로
    for (const f of L0.fixtures) f.state = (f as { orig?: typeof f.state }).orig ?? f.state;
    for (const f of L0.fixtures) (f as { orig?: typeof f.state }).orig = f.state;
    // 상호작용, 판독 대상
    g.initDoors();
    this.setupStatic();
    this.setupQuiz(idx >= ORDER.indexOf('quiz'));
    g.ui.parts(g.save.flags.quiz ? g.save.parts : null);
    g.ui.goal(null);
    g.ui.inventory([]);
    this.updateInventory();
  }

  private updateInventory() {
    const g = this.g;
    const items: { name: string; sel?: boolean }[] = [{ name: '[F] 손전등' }];
    if (g.hasDevice) items.push({ name: `재지시기 · 진정 ×${g.save.charges}`, sel: true });
    if (g.save.flags.card) items.push({ name: '직원 카드' });
    if (g.save.flags.key) items.push({ name: '직원 통로 열쇠' });
    g.ui.inventory(items);
  }

  private async stage(s: Stage, tok: number, fresh: boolean) {
    switch (s) {
      case 'prologue':
        return this.prologue(tok);
      case 'gate':
        return this.gate(tok, fresh);
      case 'lobby':
        return this.lobby(tok, fresh);
      case 'ward':
        return this.ward(tok, fresh);
      case 'una':
        return this.unaStage(tok, fresh);
      case 'quiz':
        return this.quiz(tok, fresh);
      case 'r304':
        return this.r304(tok, fresh);
      case 'playroom':
        return this.playroom(tok, fresh);
      case 'chase':
        return this.chase(tok, fresh);
      case 'basement':
        return this.basement(tok, fresh);
      case 'clean':
        return this.clean(tok, fresh);
    }
  }

  // ───────────────────────────── 정적 상호작용 ─────────────────────────────

  private setupStatic() {
    const g = this.g;
    const at = g.world.at;
    const ex = (id: string, pos: THREE.Vector3, key: string, label = '살펴보기', range = 2.4) =>
      g.inter.add({ id: 'ex:' + id, pos, prompt: `[E] ${label}`, range, onUse: () => g.examine(key) });
    ex('letters', at.letters, 'letters', '감사 편지 벽 살펴보기', 3);
    g.inter.add({
      id: 'ex:mydrawing',
      pos: at.myDrawing,
      prompt: '[E] 구석의 크레용 그림',
      range: 2,
      cone: 0.25,
      onUse: () => {
        g.examine('myDrawing');
        g.music.stinger('memory');
        g.save.flags.drawing = 1;
      },
    });
    ex('portrait', at.portrait, 'portrait', '초상화 살펴보기', 3);
    ex('slogan', new THREE.Vector3(0, 2.5, -12), 'slogan', '벽의 글씨 읽기', 6);
    ex('posterChance', at.posterChance, 'posterChance');
    ex('posterSwap', at.posterSwap, 'posterSwap');
    ex('posterShape', at.posterShape, 'posterShape');
    ex('stair', at.stair, 'stair');
    ex('stairW', at.stairW, 'stair');
    ex('clock', at.clock, 'clock', '시계 보기', 5);
    ex('booth', at.booth, 'scratches', '부스 안쪽 벽 보기', 2);
    g.inter.add({
      id: 'ex:handset',
      pos: at.handset,
      prompt: '[E] 매달린 수화기',
      range: 2,
      onUse: () => {
        g.examine('handset');
        g.sfx.play('dial_tone', { pos: at.handset, gain: 0.15, duration: 2.5 });
        g.save.flags.handset = 1;
      },
    });
    g.inter.add({
      id: 'ex:pedestal',
      pos: at.pedestal,
      prompt: () => (g.hoppy.state === 'seated' && g.area === 'ground' ? '[E] 호피 스와피 동상' : '[E] 빈 받침대'),
      range: 3.2,
      onUse: () => g.examine(g.hoppy.state === 'seated' && g.area === 'ground' ? 'pedestal' : 'pedestalEmpty'),
    });
    g.inter.add({ id: 'ex:cage', pos: at.cage, prompt: '[E] 빈 쥐 우리', range: 2, onUse: () => g.examine('cage') });
    g.inter.add({ id: 'doc:seclog', pos: at.securityLog, prompt: '[E] 경비 일지 읽기', range: 2, onUse: () => g.readDoc('securityLog') });
    // 테이프
    const tape = (id: string, screen: string, pos: THREE.Vector3, label: string) =>
      g.inter.add({
        id: 'tape:' + id,
        pos,
        prompt: () => (g.save.tapes.includes(id) ? `[E] ${label} 다시 보기` : `[E] ${label} 재생`),
        range: 2.4,
        onUse: () => {
          g.playTape(id, screen).catch(() => {});
          if (id === 'intake' && g.una.rig.root.visible && !this.flags.intakeUna) {
            this.flags.intakeUna = true;
            setTimeout(() => g.sayAll(UNA.nurseTape).catch(() => {}), 34000);
          }
        },
      });
    tape('orientation', 'orientation', at.orientation, '테이프 #1');
    tape('demo', 'demo', at.demo, '테이프 #2');
    tape('intake', 'intake', at.intake, '테이프 #3');
    // 차트
    for (const id of ['r301', 'r303', 'r305', 'r306', 'r307', 'r308', 'r309']) {
      g.inter.add({ id: 'chart:' + id, pos: at['chart_' + id], prompt: '[E] 진료 차트 읽기', range: 2, onUse: () => g.readDoc(id) });
    }
    ex('mugs', at.mugs, 'mugs', '머그컵');
    ex('calendar', at.calendar, 'calendar', '달력');
    ex('heightMarks', at.heightMarks, 'heightMarks', '문틀의 연필 자국', 1.8);
    ex('moodChart', at.moodChart, 'moodChart', '표정 차트');
    ex('supply', at.supply, 'supply', '물품 창고', 3);
    ex('crash', g.world.at.studioOut.clone().set(210.9, 1, 4.4), 'crashCart', '응급 카트');
    ex('chute', at.chute, 'chute', '세탁물 투입구', 2.4);
    // 판독 대상
    g.addScan({ id: 'cage', pos: () => at.cage, scan: SCANS.cage, onDone: () => this.flags.scannedCage = true });
    g.addScan({
      id: 'statue',
      pos: () => at.pedestal,
      scan: () => (g.hoppy.state === 'seated' && g.area === 'ground' ? SCANS.pedestal : SCANS.pedestalEmpty),
      range: 8,
    });
    g.addScan({ id: 'una', pos: () => g.una.chest, scan: SCANS.una, enabled: () => g.una.rig.root.visible });
    g.addScan({
      id: 'round',
      pos: () => {
        const n = g.rounds.nearest(g.player.pos).round;
        return n ? n.pos.clone().setY(1.6) : new THREE.Vector3(0, -99, 0);
      },
      scan: SCANS.round,
      range: 9,
      enabled: () => g.rounds.members.length > 0,
    });
    g.addScan({ id: 'hoppy', pos: () => g.hoppy.pos.clone().setY(g.hoppy.pos.y + 1.2), scan: SCANS.hoppy, range: 9, enabled: () => g.hoppy.state !== 'hidden' && g.area !== 'ground' });
    g.addScan({
      id: 'self',
      pos: () => g.player.eye,
      scan: () => (g.save.flags.chart304 ? SCANS.self : SCANS.selfEarly),
      onDone: () => {
        if (g.save.flags.chart304) {
          g.save.flags.encroach = 0.35;
          g.vm.setSkin(0.35);
          g.music.stinger('reveal');
          this.flags.selfScan = true;
        }
      },
    });
    g.addScan({ id: 'studio', pos: () => at.studioSlot, scan: SCANS.studio, range: 6 });
  }

  // ───────────────────────────── 퀴즈 ─────────────────────────────

  private setupQuiz(on: boolean) {
    const g = this.g;
    this.tvs.clear();
    this.quizPool = [...QUIZ].sort(() => this.r() - 0.5);
    for (const s of g.screens.values()) s.off();
    for (const [key, part] of QUIZ_TVS) {
      const st: TVState = { state: on && !g.save.parts[part] ? 'idle' : 'off', t: 0, part, q: null };
      if (on && g.save.parts[part]) st.state = 'done';
      this.tvs.set(key, st);
      const tv = g.world.tvs[key];
      g.inter.add({
        id: 'tv:' + key,
        pos: tv.pos,
        range: 2.8,
        cone: 0.4,
        enabled: () => st.state === 'idle',
        prompt: '[E] 호피의 건강 시간',
        onUse: () => this.ask(key).catch(() => {}),
      });
    }
    const imp: TVState = { state: 'off', t: 0, part: -1, q: IMPOSSIBLE };
    this.tvs.set('r306', imp);
    g.inter.add({
      id: 'tv:r306',
      pos: g.world.tvs.r306.pos,
      range: 2.8,
      cone: 0.4,
      enabled: () => imp.state === 'impossible',
      prompt: '[E] 마지막 문제',
      onUse: () => this.askImpossible().catch(() => {}),
    });
  }

  private tvsOn() {
    for (const st of this.tvs.values()) if (st.state === 'off' && st.part >= 0 && !this.g.save.parts[st.part]) st.state = 'idle';
  }

  private nextQuestion() {
    if (!this.quizPool.length) this.quizPool = [...QUIZ].sort(() => this.r() - 0.5);
    return this.quizPool.pop()!;
  }

  /** 문제 하나 */
  private async ask(key: string) {
    const g = this.g;
    const tok = g.token;
    const st = this.tvs.get(key)!;
    const tv = g.world.tvs[key];
    const scr = g.screens.get(key)!;
    st.state = 'ask';
    st.q = this.nextQuestion();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tv.screen.getWorldQuaternion(new THREE.Quaternion()));
    g.player.mode = 'locked';
    g.player.camOverride = { pos: tv.pos.clone().addScaledVector(normal, 1.1).add(new THREE.Vector3(0, -0.15, 0)), look: tv.pos.clone(), k: 4, fov: 60 };
    g.busy = true;
    const voice = g.sfx.play('hoppy_q', { pos: tv.pos, gain: 0.9 });
    g.ui.say({ who: '호피', text: '문제 나갑니다! 잘 듣고 골라 보세요.', dur: 2.2 });
    let pick = -1;
    const t0 = g.t;
    g.input.clearLatch();
    try {
      while (pick < 0) {
        scr.frame('quiz', g.t, 'HOPPY 88', g.t - t0);
        g.ui.quiz(st.q);
        for (let i = 0; i < 4; i++) if (g.input.take('Digit' + (i + 1), 'Numpad' + (i + 1))) pick = i;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        g.check(tok);
      }
      voice?.stop(0.1);
      g.ui.quiz(st.q, pick);
      g.sfx.penClick();
      await g.wait(0.6, tok);
      g.ui.quiz(null);
      const right = pick === st.q.answer;
      const t1 = g.t;
      if (right) {
        g.sfx.play('hoppy_right', { pos: tv.pos, gain: 0.9 });
        g.audio.note('xylo', 72, { pos: tv.pos, gain: 0.5 });
        g.audio.note('xylo', 76, { pos: tv.pos, gain: 0.5, at: g.audio.now + 0.12 });
        g.audio.note('xylo', 79, { pos: tv.pos, gain: 0.5, at: g.audio.now + 0.24 });
        g.ui.say({ who: '호피', text: st.q.after ?? QUIZ_LINES.right, dur: 3 });
        while (g.t - t1 < 2.6) {
          scr.frame('quiz_right', g.t, 'HOPPY 88', g.t - t1);
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          g.check(tok);
        }
        st.state = 'done';
        this.dropPart(key, st);
      } else {
        g.sfx.play('hoppy_wrong', { pos: tv.pos, gain: 1 });
        g.music.stinger('wrong');
        g.ui.say({ who: '호피', text: `${QUIZ_LINES.wrong} ${QUIZ_LINES.wrongExtra}`, dur: 3 });
        while (g.t - t1 < 2.4) {
          scr.frame('quiz_wrong', g.t, 'HOPPY 88', g.t - t1, 0.6);
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          g.check(tok);
        }
        this.penalty();
        st.state = 'cool';
        st.t = 9;
      }
    } finally {
      g.ui.quiz(null);
      g.player.camOverride = null;
      g.player.mode = 'walk';
      g.busy = false;
      if (st.state !== 'cool' && st.state !== 'done') st.state = 'idle';
    }
  }

  /** 오답: 건물이 흥분하고 회진이 더 나온다, 놀이방 문 안쪽에서 무언가가 두드린다 */
  private penalty() {
    const g = this.g;
    g.save.wrong++;
    g.pace.raiseFloor(15);
    g.writeSave();
    const door = g.door('playroom').center.setY(1.2);
    for (let i = 0; i < 3; i++) setTimeout(() => g.sfx.play('door_slam', { pos: door, gain: 0.9, rate: 0.8 + i * 0.05 }), 600 + i * 420);
    setTimeout(() => this.spawnPatrol(true), 2500);
  }

  private dropPart(key: string, st: TVState) {
    const g = this.g;
    const tv = g.world.tvs[key];
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tv.screen.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const p = tv.pos.clone().addScaledVector(normal, 0.6);
    const geo = st.part === 0 ? new THREE.SphereGeometry(0.13, 10, 8) : st.part === 1 ? new THREE.SphereGeometry(0.16, 10, 8) : new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8);
    const m = new THREE.Mesh(geo, mat('plush', false).mat);
    m.castShadow = true;
    m.position.copy(p);
    if (st.part >= 2) m.rotation.z = Math.PI / 2;
    g.world.level.areaGroup('ward').add(m);
    st.drop = m;
    // 떨어지는 애니메이션
    const y0 = p.y;
    const t0 = g.t;
    const fall = () => {
      const k = Math.min(1, (g.t - t0) / 0.5);
      m.position.y = y0 + (0.12 - y0) * k * k;
      if (k < 1) requestAnimationFrame(fall);
      else g.sfx.play('thump_small', { pos: m.position, gain: 0.4, rate: 1.6 });
    };
    fall();
    g.inter.add({
      id: 'part:' + key,
      pos: () => m.position,
      range: 2,
      cone: 0.6,
      prompt: `[E] 호피 부품 줍기 — ${PART_NAMES[st.part]}`,
      onUse: () => {
        g.save.parts[st.part] = true;
        g.writeSave();
        m.removeFromParent();
        g.inter.remove('part:' + key);
        g.sfx.play(`velcro_${st.part % 3}`, { bus: 'ui', gain: 0.5 });
        g.ui.parts(g.save.parts);
        const n = g.save.parts.filter(Boolean).length;
        g.ui.tip(`호피 부품 ${n}/6 — ${PART_NAMES[st.part]}`, 3);
      },
    });
  }

  /** 풀 수 없는 문제 */
  private async askImpossible() {
    const g = this.g;
    const tok = g.token;
    const st = this.tvs.get('r306')!;
    const tv = g.world.tvs.r306;
    const scr = g.screens.get('r306')!;
    st.state = 'ask';
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tv.screen.getWorldQuaternion(new THREE.Quaternion()));
    g.player.mode = 'locked';
    g.player.camOverride = { pos: tv.pos.clone().addScaledVector(normal, 1.1).add(new THREE.Vector3(0, -0.15, 0)), look: tv.pos.clone(), k: 4, fov: 58 };
    g.busy = true;
    g.sfx.play('hoppy_q', { pos: tv.pos, gain: 0.9, rate: 0.92 });
    let pick = -1;
    const t0 = g.t;
    g.input.clearLatch();
    while (pick < 0) {
      scr.frame('quiz', g.t, 'HOPPY 88', g.t - t0, 0.15);
      g.ui.quiz(IMPOSSIBLE);
      for (let i = 0; i < 4; i++) if (g.input.take('Digit' + (i + 1), 'Numpad' + (i + 1))) pick = i;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      g.check(tok);
    }
    g.ui.quiz(IMPOSSIBLE, pick);
    g.sfx.penClick();
    await g.wait(0.7, tok);
    g.ui.quiz(null);
    // 무엇을 골라도 틀렸다
    g.warp = 1;
    g.red = 0.25;
    g.music.stinger('wrong');
    for (const [i, line] of QUIZ_LINES.impossible.entries()) {
      g.sfx.play('hoppy_wrong', { pos: tv.pos, gain: 1, rate: 1 - i * 0.12 });
      g.ui.say({ who: '호피', text: line, dur: 1.3 });
      const t1 = g.t;
      while (g.t - t1 < 1.3) {
        scr.frame('quiz_impossible', g.t, 'HOPPY 88', g.t - t1, 1);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        g.check(tok);
      }
    }
    g.save.wrong++;
    g.pace.raiseFloor(15);
    // 정전
    scr.off();
    g.sfx.play('buzz_2', { bus: 'world', pos: g.player.eye, gain: 0.8 });
    g.light.master = 0;
    g.warp = 0;
    g.red = 0;
    const door = g.door('playroom').center.setY(1.2);
    for (let i = 0; i < 5; i++) setTimeout(() => g.sfx.play('door_slam', { pos: door, gain: 1, rate: 0.7 + i * 0.03 }), 300 + i * 260);
    g.music.stinger('dread');
    g.player.camOverride = null;
    g.player.mode = 'walk';
    g.busy = false;
    st.state = 'done';
    this.flags.impossibleDone = true;
  }

  /** 순찰 회진 두 명 (복도 동쪽 끝 → 엘리베이터 홀) */
  private spawnPatrol(extra = false) {
    const g = this.g;
    if (g.area !== 'ward') return;
    g.sfx.chime();
    setTimeout(() => {
      g.sfx.speak('회진 시간입니다. 병실에 머물러 주세요.', 'pa', { bus: 'world', gain: 0.7, send: 0.6 });
      g.ui.say(L('방송', '회진 시간입니다. 병실에 머물러 주세요.', 3)).catch(() => {});
    }, 1900);
    const path = [...g.world.roundsPath].reverse();
    // 플레이어 가까운 쪽 끝에서 나오는 경우 (오답)
    const route = extra && g.player.pos.x > 218 ? g.world.roundsPath : path;
    setTimeout(() => {
      if (g.area === 'ward') g.rounds.spawn(route, extra ? 2 : 2, 1.4);
    }, 3000);
  }

  // ───────────────────────────── 프롤로그 ─────────────────────────────

  private async prologue(tok: number) {
    const g = this.g;
    const P = g.prologue;
    g.setArea('road');
    g.engine.scene.fog = new THREE.FogExp2(0x4a4f55, 0.06);
    g.light.setFlash(false);
    P.speed = 15;
    P.rumble = 1;
    P.radioLed.visible = true;
    const seat = P.seatWorld();
    g.player.teleport(seat.clone().setY(seat.y - 1.62), 0);
    g.player.mode = 'locked';
    g.player.lookLimit = { yaw: 0, range: 1.9, down: -1.0 };
    g.ui.inventory([]);
    g.audio.setRoom('ambulance');
    g.startLoop('engine', 'engine', { bus: 'amb', gain: 0.5, lowpass: 900 });
    g.startLoop('static', 'static', { bus: 'amb', gain: 0.03, highpass: 400 });
    g.ui.showHud(true);
    g.ui.goal(null);
    await g.ui.fade(true, 0.01);
    g.ui.card(`<div>${PROLOGUE.card[0]}</div><div class="small">${PROLOGUE.card[1]}</div>`);
    await g.wait(4.2, tok);
    g.ui.card(null);
    await g.ui.fade(false, 2.4);
    g.ui.tip(TIPS.move.split('·')[0] + ' — 마우스로 둘러본다', 4);
    await g.wait(1.5, tok);
    await g.sayAll(PROLOGUE.talk1, tok);
    await g.wait(1.0, tok);
    // 무전 지령
    g.sfx.play('squelch', { bus: 'voice', gain: 0.6 });
    const disp = g.sfx.play('radio_disp', { bus: 'voice', gain: 0.65 });
    await g.say(PROLOGUE.dispatch[0], tok);
    disp?.stop(0.2);
    await g.wait(0.6, tok);
    // 녹음: 아이의 목소리
    g.audio.busLevel('amb', 0.5, 0.5);
    const call = g.sfx.play('call_911', { bus: 'voice', gain: 0.9 });
    await g.say(PROLOGUE.call[0], tok);
    call?.stop(0.4);
    g.sfx.play('squelch', { bus: 'voice', gain: 0.5 });
    g.audio.busLevel('amb', 1, 1);
    await g.wait(1.2, tok);
    await g.sayAll(PROLOGUE.talk2, tok);
    await g.wait(1.5, tok);
    // 왼팔
    g.ui.tip('왼팔이 가렵다 — 아래를 내려다본다', 6);
    const tArm = g.t;
    await g.until(() => g.player.pitch < -0.5 || g.t - tArm > 9, tok);
    g.ui.tip(null);
    g.vmForce = true;
    g.vm.env = 'cab';
    g.vm.pose = 'inspect';
    g.vm.tool = 'none';
    await g.wait(1.4, tok);
    // 1초짜리 기억
    g.sfx.play('fire', { bus: 'ui', gain: 0.7 });
    g.engine.post.u.uWhite.value = 0.8;
    g.music.stinger('memory');
    await g.sayAll(PROLOGUE.armLook, tok);
    g.vm.pose = 'idle';
    g.vmForce = false;
    g.vm.env = 'normal';
    // 같은 표지판, 세 번
    for (let k = 0; k < 3; k++) {
      await g.wait(k === 0 ? 2 : 3, tok);
      P.spawnSign(80, k === 2);
      if (k === 2) {
        // 마커스가 속도를 줄인다: 이번엔 표지판이 천천히 지나간다
        await g.until(() => P.signDistance < 45, tok);
        const t1 = g.t;
        await g.until(() => {
          P.speed = 15 - Math.min(1, (g.t - t1) / 2.5) * 9;
          return P.signDistance < -2;
        }, tok);
        P.speed = 15;
      } else await g.until(() => P.signDistance < -2, tok);
      if (k === 1) await g.say(L('마커스', PROLOGUE.deer[1]), tok);
      if (k === 2) {
        g.stopLoop('static', 0.1);
        P.radioLed.visible = false;
        await g.say(L('마커스', PROLOGUE.deer[2]), tok);
        await g.wait(0.8, tok);
        await g.say(PROLOGUE.radioDead, tok);
      }
    }
    await g.wait(2.5, tok);
    // 정문
    P.spawnGate(70);
    g.music.stinger('soft');
    await g.until(() => P.gateZ > -30, tok);
    const v0 = P.speed;
    const t0 = g.t;
    await g.until(() => {
      const k = Math.min(1, (g.t - t0) / 3.2);
      P.speed = v0 * (1 - k);
      P.rumble = 1 - k * 0.7;
      return k >= 1;
    }, tok);
    g.engine.post.u.uWhite.value = 0;
    await g.sayAll(PROLOGUE.gate, tok);
    await g.ui.fade(true, 1.5);
    g.stopLoop('engine', 1);
    g.player.lookLimit = null;
    this.updateInventory();
    g.checkpoint('gate');
  }

  // ───────────────────────────── 정문 ─────────────────────────────

  private async gate(tok: number, fresh: boolean) {
    const g = this.g;
    const w = g.world;
    g.setArea('ground');
    g.player.teleport(w.spawn.gate.pos, w.spawn.gate.yaw);
    g.player.mode = 'walk';
    g.light.setFlash(true);
    g.save.flags.sirens = 1;
    g.hoppy.place(new THREE.Vector3(0, 0.6, -6.5), 0, 'seated');
    g.audio.setRoom('outside');
    g.startLoop('wind', 'wind', { bus: 'amb', gain: 0.32 });
    // 마커스가 안개 속 언덕으로 걸어간다
    this.marcus = makeMarcus();
    this.marcus.root.position.set(0.2, 0, 44.5);
    g.world.level.areaGroup('ground').add(this.marcus.root);
    this.marcusWalk = 0;
    await g.ui.fade(false, fresh ? 1.2 : 2);
    if (!g.save.flags.titleCard) {
      g.save.flags.titleCard = 1;
      await g.wait(1.5, tok);
      g.ui.card(`<img src="${logoUrl}" alt="SECOND NATURE"><div class="small">CHAPTER 1 — 치료</div>`);
      const at = g.audio.now;
      [76, 74, 76, 79, 81, 79, 76].forEach((m, i) => g.audio.note('mbox', m + 12, { bus: 'music', at: at + i * 0.4 + (i > 3 ? 0.4 : 0), gain: 0.32, hall: 0.6 }));
      await g.wait(5.5, tok);
      g.ui.card(null);
    }
    g.ui.goal(GOALS.gate);
    g.ui.tip(TIPS.move, 7);
    await g.wait(2, tok);
    g.ui.tip(TIPS.flash, 4);
    await g.until(() => g.player.pos.z < -0.5, tok);
    g.stopLoop('wind', 2);
  }

  // ───────────────────────────── 로비 ─────────────────────────────

  private async lobby(tok: number, fresh: boolean) {
    const g = this.g;
    const at = g.world.at;
    if (fresh) {
      g.setArea('ground');
      g.player.teleport(new THREE.Vector3(0, 0, -1.6), 0);
      g.light.setFlash(true);
      await g.ui.fade(false, 1);
    }
    g.checkpoint('lobby');
    const hasCard = !!g.save.flags.card;
    g.hasDevice = !!g.save.flags.device;
    g.hoppy.place(new THREE.Vector3(0, 0.6, -6.5), 0, hasCard ? 'hidden' : 'seated');
    g.startLoop('room', 'room_tone', { bus: 'amb', gain: 0.25 });
    g.ui.goal(GOALS.lobby);
    // 오리엔테이션 TV는 켜져서 정지 화면
    const scr = g.screens.get('orientation')!;
    scr.frame('logo', 0, 'JAN 14 1986', 0);
    // 엘리베이터 호출
    let called = false;
    g.inter.add({
      id: 'elevG',
      pos: at.elevG,
      range: 2.6,
      prompt: () => (called ? '[E] 엘리베이터에 탄다' : '[E] 엘리베이터 호출'),
      enabled: () => !this.flags.riding,
      onUse: () => {
        if (!called) {
          called = true;
          g.sfx.play('switch', { pos: at.elevG, gain: 0.5 });
          setTimeout(() => {
            g.audio.note('tbell', 84, { pos: at.elevG, gain: 0.5 });
            g.openDoor('elevG', true);
          }, 1800);
        } else g.ui.tip('엘리베이터 안의 조작판을 본다', 3);
      },
    });
    g.inter.add({
      id: 'carPanelG',
      pos: at.carPanelG,
      range: 1.8,
      cone: 0.6,
      prompt: () => (g.save.flags.card ? '[E] 3층 (직원 카드)' : '[E] 3층 버튼'),
      enabled: () => !this.flags.riding,
      onUse: () => {
        if (!g.save.flags.card) {
          g.sfx.play('switch', { pos: at.carPanelG, gain: 0.4 });
          g.audio.note('crot', 81, { pos: at.carPanelG, gain: 0.3 });
          g.ui.say(L('', '"3 — PEDIATRICS / STAFF CARD REQUIRED"  3층 소아 병동은 직원 카드가 필요하다.'));
          g.ui.goal(GOALS.security);
          return;
        }
        this.flags.riding = true;
      },
    });
    // 경비실: 재지시기와 직원 카드
    if (!g.save.flags.device) {
      g.inter.add({
        id: 'tool',
        pos: at.tool,
        range: 2,
        prompt: '[E] 충전 거치대의 기기를 집는다',
        onUse: () => {
          g.save.flags.device = 1;
          g.hasDevice = true;
          g.writeSave();
          (g.world.meshes.toolOnDock as THREE.Mesh).visible = false;
          g.inter.remove('tool');
          g.sfx.play('switch', { bus: 'ui', gain: 0.5 });
          g.sfx.beep(0.3);
          g.ui.say(L('', '"SN-RI 3 — 재지시기(Re-Instructor). 세컨드 네이처 직원 전용."'));
          g.ui.say(L('', '손잡이 옆에 초록 카드가 꽂혀 있다. "RELAX — 진정".'));
          g.ui.tip(TIPS.tool, 8);
          this.updateInventory();
        },
      });
    } else (g.world.meshes.toolOnDock as THREE.Mesh).visible = false;
    if (!g.save.flags.card) {
      g.inter.add({
        id: 'card',
        pos: at.card,
        range: 2,
        prompt: '[E] 직원 카드',
        enabled: () => g.hasDevice,
        onUse: () => {
          g.save.flags.card = 1;
          g.writeSave();
          (g.world.meshes.card as THREE.Mesh).visible = false;
          g.inter.remove('card');
          g.sfx.play('paper_0', { bus: 'ui', gain: 0.4 });
          g.ui.tip('직원 카드: "R. CALLOWAY, R.N. — 3F"', 4);
          g.ui.goal(GOALS.elevator);
          this.updateInventory();
          // 로비의 동상이 사라진다
          g.hoppy.place(new THREE.Vector3(0, 0.6, -6.5), 0, 'hidden');
          this.flags.statueGone = true;
        },
      });
    } else (g.world.meshes.card as THREE.Mesh).visible = false;
    // 진행: 카드 → (동상이 사라진 걸 본다) → 엘리베이터
    let thud = false;
    await g.until(() => {
      if (this.flags.statueGone && !thud && g.player.room?.id === 'lobby') {
        thud = true;
        g.sfx.play('thud', { bus: 'world', pos: new THREE.Vector3(0, 9, -14), gain: 0.9 });
        g.music.stinger('dread');
        g.ui.tip('…받침대가 비어 있다.', 4);
      }
      return !!this.flags.riding;
    }, tok);
    // 엘리베이터
    g.inter.remove('carPanelG');
    g.player.mode = 'locked';
    g.player.camOverride = { pos: new THREE.Vector3(-5, 1.6, -15.9), look: new THREE.Vector3(-5, 1.5, -13), k: 3 };
    g.openDoor('elevG', false);
    g.stopLoop('room', 1);
    await g.wait(1.8, tok);
    g.startLoop('elev', 'elev_motor', { bus: 'amb', gain: 0.4 });
    g.player.shake = 0.3;
    await g.wait(3.2, tok);
    // 층 사이에서 멈춘다
    g.stopLoop('elev', 0.1);
    g.sfx.play('thud', { bus: 'ui', gain: 0.8 });
    g.light.master = 0.05;
    g.player.shake = 1;
    await g.wait(2.6, tok);
    g.sfx.play('buzz_0', { bus: 'ui', gain: 0.4 });
    g.light.master = 1;
    g.startLoop('elev', 'elev_motor', { bus: 'amb', gain: 0.4 });
    await g.wait(2.5, tok);
    g.stopLoop('elev', 0.3);
    g.audio.note('tbell', 84, { bus: 'ui', gain: 0.4 });
    await g.ui.fade(true, 0.5);
    this.flags.riding = false;
  }

  // ───────────────────────────── 3층: 회진, 우나 ─────────────────────────────

  private async ward(tok: number, fresh: boolean) {
    const g = this.g;
    const w = g.world;
    g.setArea('ward');
    g.hasDevice = !!g.save.flags.device;
    g.player.camOverride = null;
    g.player.teleport(w.spawn.carW.pos, w.spawn.carW.yaw);
    g.player.mode = 'walk';
    g.light.setFlash(true);
    g.checkpoint('ward');
    g.startLoop('pipes', 'pipes', { bus: 'amb', gain: 0.18 });
    await g.ui.fade(false, fresh ? 1 : 0.6);
    g.openDoor('elevW', true);
    g.ui.goal(GOALS.ward);
    g.music.zone = 0.6;
    // 엘리베이터가 혼자 내려간다
    await g.until(() => g.player.pos.z < 5.6, tok);
    await g.wait(1.2, tok);
    g.openDoor('elevW', false);
    setTimeout(() => g.sfx.play('elev_motor', { pos: new THREE.Vector3(195, 1, 7.6), gain: 0.4, duration: 3 }), 1500);
    // 복도에 들어서면 회진이 시작된다
    await g.until(() => g.player.pos.x > 199.5, tok);
    await g.wait(2.5, tok);
    g.pace.silence(2);
    g.stopLoop('pipes', 0.3);
    await g.wait(1.5, tok);
    g.sfx.chime();
    await g.wait(1.9, tok);
    g.sfx.speak('회진 시간입니다. 병실에 머물러 주세요.', 'pa', { bus: 'world', gain: 0.75, send: 0.6 });
    g.say(L('방송', '회진 시간입니다. 병실에 머물러 주세요.', 3)).catch(() => {});
    await g.wait(1.5, tok);
    // 복도 한가운데 어둠 속에서 나타난다
    const route = [new THREE.Vector3(221, 0, 1.5), ...[...w.roundsPath].reverse().slice(2)];
    g.rounds.spawn(route, 3, 1.3);
    g.music.tension = 0.6;
    g.ui.goal(GOALS.hide);
    g.ui.tip('회진이다. 병실 침대 밑에 숨는다 [E]', 6);
    // 숨을 침대
    const hideIds = ['r301', 'r302', 'r303', 'r307', 'r308', 'r309'];
    let hidden: string | null = null;
    for (const id of hideIds) {
      const b = w.beds[id];
      g.inter.add({
        id: 'hide:' + id,
        pos: b.under.clone().setY(0.6),
        range: 2.2,
        cone: 0.7,
        prompt: '[E] 침대 밑에 숨기',
        enabled: () => !hidden,
        onUse: () => {
          hidden = id;
          this.hideBed = b;
        },
      });
    }
    await g.until(() => !!hidden, tok);
    for (const id of hideIds) g.inter.remove('hide:' + id);
    // 침대 밑으로
    const bed = this.hideBed!;
    const roomId = hidden!;
    const doorPos = g.door(roomId).center;
    const lookDir = Math.atan2(-(doorPos.x - bed.under.x), -(doorPos.z - bed.under.z));
    g.player.mode = 'hidden';
    g.player.hideAt = bed.under.clone().setY(0.2);
    g.player.yaw = lookDir;
    g.player.pitch = -0.05;
    g.player.lookLimit = { yaw: lookDir, range: 1.6 };
    g.audio.muffle(0.35, 0.6, 1600);
    g.sfx.play('paper_2', { bus: 'ui', gain: 0.4, rate: 0.6 });
    // 맞은편의 우나
    await g.wait(1.6, tok);
    const fwd = new THREE.Vector3(-Math.sin(lookDir), 0, -Math.cos(lookDir));
    const away = fwd.clone().negate();
    const side = new THREE.Vector3(Math.cos(lookDir), 0, -Math.sin(lookDir));
    // 같은 침대 밑, 맞은편: 옆으로 누워 이쪽을 본다
    const hips = bed.under.clone().setY(0.16).addScaledVector(side, 0.72).addScaledVector(fwd, -0.55);
    g.una.place(hips.clone().setY(0));
    g.una.lieDown(hips, fwd, side.clone().negate());
    g.una.face('worry');
    // 플레이어가 고개를 돌리면 알아챈다
    g.ui.tip('…무언가가 옆에 있다', 3);
    const tSide = g.t;
    await g.until(() => {
      const toU = new THREE.Vector3().subVectors(hips, g.player.hideAt!).setY(0).normalize();
      const f = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
      return f.dot(toU) > 0.6 || g.t - tSide > 6;
    }, tok);
    g.save.flags.metUna = 1;
    await g.sayAll(UNA.meet, tok);
    // 회진 하나가 병실로 들어온다
    const members = g.rounds.members;
    const intruder: Round | undefined = members[0];
    for (const m of members.slice(1)) m.state = 'wait';
    if (intruder) {
      intruder.state = 'script';
      intruder.scriptTarget = doorPos.clone().setY(0);
      // 이야기 속도를 위해: 너무 멀리 있으면 복도 가까이로 옮겨 둔다 (플레이어는 침대 밑이라 보지 못한다)
      const corr = new THREE.Vector3(doorPos.x + 6, 0, 1.5);
      if (intruder.pos.distanceTo(doorPos) > 9) {
        members.forEach((m, i) => m.pos.copy(corr).add(new THREE.Vector3(i * 1.3, 0, (i % 2) * 0.4)));
      }
    }
    await g.until(() => !intruder || intruder.pos.distanceTo(doorPos) < 1.2, tok);
    await g.say(UNA.hold, tok);
    g.allowHold = true;
    g.ui.tip(UNA.holdTip, 8);
    let held = false;
    const holdWatch = () => {
      if (g.input.isDown('KeyQ')) {
        if (!g.player.holding) g.sfx.play('paper_1', { bus: 'ui', gain: 0.15, rate: 0.5 });
        g.player.holding = true;
        g.vm.pose = 'hold';
        held = true;
      } else if (g.player.holding) {
        g.player.holding = false;
        g.vm.pose = 'idle';
      }
    };
    // 침대 곁까지 다가온다
    if (intruder) intruder.scriptTarget = bed.under.clone().setY(0).addScaledVector(away, -1.3);
    let beatsNear = 0;
    let caught = false;
    g.onBeat.push(() => {
      if (!intruder) return;
      if (intruder.pos.distanceTo(bed.under.clone().setY(0)) < 1.9) beatsNear++;
    });
    await g.until(() => {
      holdWatch();
      if (intruder && intruder.pos.distanceTo(bed.under.clone().setY(0)) < 1.6 && !g.player.holding) caught = true;
      return caught || beatsNear >= 4;
    }, tok);
    if (caught) {
      g.fail('rounds');
      throw new Cancel();
    }
    if (held && !g.save.flags.firstHold) {
      g.save.flags.firstHold = 1;
      g.say(UNA.flinch).catch(() => {});
    }
    // 돌아서 나간다
    if (intruder) {
      intruder.scriptTarget = doorPos.clone().setY(0).add(new THREE.Vector3(0, 0, doorPos.z < 1 ? 1.5 : -1.5));
    }
    await g.until(() => {
      holdWatch();
      return !intruder || intruder.pos.distanceTo(doorPos) > 1.3;
    }, tok);
    for (const m of g.rounds.members) {
      m.state = 'patrol';
      m.done = false;
    }
    await g.until(() => {
      holdWatch();
      return g.rounds.members.every((m) => m.pos.x < 199) || g.rounds.members.length === 0;
    }, tok);
    g.rounds.clear();
    g.music.tension = 0;
    g.player.holding = false;
    g.vm.pose = 'idle';
    await g.wait(1.2, tok);
    // 침대 밑에서 나온다
    await g.ui.fade(true, 0.6);
    g.audio.muffle(0, 0.5);
    g.player.mode = 'walk';
    g.player.hideAt = null;
    g.player.lookLimit = null;
    const outPos = bed.under.clone().setY(0).addScaledVector(away, -1.0).addScaledVector(side, -0.3);
    g.player.teleport(outPos, lookDir);
    g.una.standUp();
    g.una.place(outPos.clone().addScaledVector(side, 0.9).addScaledVector(away, -0.4), lookDir);
    g.una.face('neutral');
    g.una.follow();
    g.una.mode = 'idle';
    await g.ui.fade(false, 0.8);
    g.writeSave();
  }

  private async unaStage(tok: number, fresh: boolean) {
    const g = this.g;
    if (fresh) {
      g.setArea('ward');
      g.player.teleport(new THREE.Vector3(207, 0, -1.2), Math.PI);
      g.una.place(new THREE.Vector3(206.2, 0, -2.0), 0);
      g.light.setFlash(true);
      await g.ui.fade(false, 0.8);
    }
    g.checkpoint('una');
    g.ui.goal(null);
    g.save.flags.metUna = 1;
    g.allowHold = true;
    g.una.show(true);
    g.una.mode = 'idle';
    g.una.face('neutral');
    g.startLoop('pipes', 'pipes', { bus: 'amb', gain: 0.18 });
    await g.sayAll(UNA.after.slice(0, 2), tok);
    g.una.face('smile');
    await g.say(UNA.after[2], tok);
    g.una.face('neutral');
    await g.sayAll(UNA.after.slice(3), tok);
    g.una.follow();
    this.setupUnaTalk();
    g.ui.goal(GOALS.follow);
    g.ui.tip(TIPS.talk, 5);
    // 복도로 나가면 TV가 켜진다
    await g.until(() => g.player.room?.id === 'corridor', tok);
    await g.wait(3, tok);
  }

  private setupUnaTalk() {
    const g = this.g;
    let i = 0;
    g.inter.add({
      id: 'una:talk',
      pos: () => g.una.head,
      range: 2.0,
      cone: 0.5,
      prompt: '[E] 우나에게 말 걸기',
      enabled: () => g.una.rig.root.visible && g.una.mode !== 'hold' && !this.flags.talking,
      onUse: async () => {
        this.flags.talking = true;
        const lines = UNA.idle[i++ % UNA.idle.length];
        g.una.face(i % 2 ? 'smile' : 'neutral');
        try {
          await g.sayAll(lines);
        } catch {
          /* 끊김 */
        }
        g.una.face('neutral');
        this.flags.talking = false;
      },
    });
  }

  // ───────────────────────────── 호피의 건강 시간 ─────────────────────────────

  private async quiz(tok: number, fresh: boolean) {
    const g = this.g;
    if (fresh) {
      g.setArea('ward');
      g.player.teleport(new THREE.Vector3(207, 0, 1.5), Math.PI / 2);
      g.una.place(new THREE.Vector3(208.5, 0, 1.2), 0);
      g.una.show(true);
      g.una.follow();
      g.light.setFlash(true);
      this.setupUnaTalk();
      g.startLoop('pipes', 'pipes', { bus: 'amb', gain: 0.18 });
      await g.ui.fade(false, 0.8);
    }
    g.save.flags.quiz = 1;
    g.checkpoint('quiz');
    // 모든 TV가 켜진다
    this.tvsOn();
    g.ui.parts(g.save.parts);
    for (const [key] of QUIZ_TVS) {
      const tv = g.world.tvs[key];
      if (this.tvs.get(key)!.state === 'idle') {
        g.sfx.play('crt_on', { pos: tv.pos, gain: 0.5 });
        setTimeout(() => g.sfx.play('hoppy_hello', { pos: tv.pos, gain: 0.55, rate: 0.98 + this.r() * 0.04 }), 600 + this.r() * 900);
      }
    }
    g.say(L('호피', QUIZ_LINES.hello, 3)).catch(() => {});
    await g.wait(3.5, tok);
    await g.sayAll(UNA.tvOn, tok);
    g.ui.goal(GOALS.quiz);
    g.ui.tip(TIPS.quiz + ' · ' + TIPS.hold, 7);
    this.patrolOn = true;
    this.patrolT = 55;
    await g.until(() => g.save.parts.every(Boolean), tok);
    // 마지막 TV
    await g.wait(2, tok);
    g.say(L('호피', QUIZ_LINES.allParts, 3)).catch(() => {});
    const imp = this.tvs.get('r306')!;
    imp.state = 'impossible';
    g.sfx.play('crt_on', { pos: g.world.tvs.r306.pos, gain: 0.7 });
    g.ui.goal(GOALS.impossible);
    await g.until(() => !!this.flags.impossibleDone, tok);
    this.patrolOn = false;
    g.rounds.clear();
    await g.wait(1.5, tok);
    await g.sayAll(UNA.impossible, tok);
  }

  // ───────────────────────────── 304호 ─────────────────────────────

  private async r304(tok: number, fresh: boolean) {
    const g = this.g;
    const L0 = g.world.level;
    if (fresh) {
      g.setArea('ward');
      g.player.teleport(new THREE.Vector3(229, 0, 1.5), Math.PI / 2);
      g.una.place(new THREE.Vector3(230.3, 0, 1.2), 0);
      g.una.show(true);
      g.una.follow();
      g.light.setFlash(true);
      this.setupUnaTalk();
      await g.ui.fade(false, 0.8);
    }
    g.checkpoint('r304');
    g.save.flags.quiz = 1;
    // 정전: 병동의 불이 모두 꺼지고, 304호만 깜빡이며 켜진다
    for (const f of L0.fixtures) if (f.room.area === 'ward') f.state = f.room.id === 'r304' ? 'flicker' : 'off';
    g.light.master = 1;
    g.music.zone = 0.2;
    await g.wait(1.5, tok);
    g.openDoor('r304', true);
    g.ui.goal(GOALS.r304);
    await g.say(L('우나', '…저기 불 켜졌어요. 304호.'), tok);
    // 304호의 이야기들
    g.inter.add({
      id: 'chart:r304',
      pos: g.world.at.chart_r304,
      prompt: '[E] 진료 차트 읽기',
      range: 2,
      onUse: async () => {
        await g.readDoc('r304');
        if (!g.save.flags.chart304) {
          g.save.flags.chart304 = 1;
          g.writeSave();
          g.music.stinger('memory');
          g.ui.tip(TIPS.scanSelf, 7);
        }
      },
    });
    g.inter.add({
      id: 'water',
      pos: g.world.at.water,
      range: 2,
      prompt: () => (this.flags.drank ? '[E] 물 한 컵을 우나에게 건넨다' : '[E] 물을 마신다'),
      enabled: () => !this.flags.gave,
      onUse: async () => {
        if (!this.flags.drank) {
          this.flags.drank = true;
          g.sfx.play('gulp', { bus: 'ui', gain: 0.6 });
          return;
        }
        this.flags.gave = true;
        g.una.face('smile');
        await g.say(UNA.water).catch(() => {});
        g.una.face('neutral');
        g.ui.tip('우나는 차가운 타일 위에 맨발로 서 있다.', 4);
      },
    });
    g.inter.add({
      id: 'window304',
      pos: g.world.at.window304,
      range: 3,
      cone: 0.5,
      prompt: '[E] 창밖을 본다',
      onUse: async () => {
        g.examine('window304');
        if (!this.flags.window) {
          this.flags.window = true;
          await g.wait(6.5).catch(() => {});
          g.una.lookAt = g.world.sedanDome;
          await g.sayAll(UNA.window).catch(() => {});
          g.una.lookAt = null;
        }
      },
    });
    await g.until(() => g.player.room?.id === 'r304', tok);
    await g.wait(1, tok);
    await g.sayAll(UNA.r304, tok);
    // 차트를 읽고, (창을 보거나 조금 지나면) 불이 돌아온다
    const tIn = g.t;
    await g.until(() => !!g.save.flags.chart304 && (!!this.flags.window || !!this.flags.selfScan || g.t - tIn > 60), tok);
    await g.wait(4, tok);
    for (const f of L0.fixtures) if (f.room.area === 'ward') f.state = (f as { orig?: typeof f.state }).orig ?? 'on';
    g.sfx.play('buzz_1', { bus: 'world', pos: g.player.eye, gain: 0.5 });
    await g.wait(1.2, tok);
    // 놀이방으로 오세요
    g.sfx.chime();
    await g.wait(1.9, tok);
    g.sfx.play('hoppy_hello', { bus: 'world', pos: g.door('playroom').center.setY(2.5), gain: 0.9, send: 0.7 });
    await g.say(L('호피', QUIZ_LINES.invite, 4), tok);
    g.door('playroom').locked = false;
    g.openDoor('playroom', true);
    g.music.zone = 0.5;
    g.ui.goal(GOALS.playroom);
  }

  // ───────────────────────────── 놀이방 · 모양 공방 ─────────────────────────────

  private async playroom(tok: number, fresh: boolean) {
    const g = this.g;
    const at = g.world.at;
    if (fresh) {
      g.setArea('ward');
      g.player.teleport(new THREE.Vector3(231, 0, 1.5), Math.PI / 2 * -1 + Math.PI);
      g.player.yaw = -Math.PI / 2;
      g.una.place(new THREE.Vector3(230, 0, 2.2), 0);
      g.una.show(true);
      g.una.follow();
      g.light.setFlash(true);
      this.setupUnaTalk();
      g.door('playroom').locked = false;
      g.openDoor('playroom', true, false);
      await g.ui.fade(false, 0.8);
    }
    g.checkpoint('playroom');
    g.hoppy.place(at.hoppySeat.clone(), -Math.PI / 2, 'seated');
    g.ui.goal(GOALS.playroom);
    await g.until(() => g.player.room?.id === 'playroom', tok);
    await g.sayAll(UNA.playroom, tok);
    g.inter.add({ id: 'ex:stage', pos: at.stage.clone().setY(1.2), range: 3.5, prompt: '[E] 무대 위의 인형탈', onUse: () => g.examine('stageHoppy') });
    g.ui.goal(GOALS.studio);
    // 부품 끼우기
    let inserted = 0;
    const frame = g.world.meshes.studioFrame as THREE.Mesh;
    const marks: THREE.Mesh[] = [];
    const slotOffsets = [
      [0, 0.22],
      [0, -0.14],
      [-0.28, -0.08],
      [0.28, -0.08],
      [-0.1, -0.38],
      [0.1, -0.38],
    ];
    g.inter.add({
      id: 'studio:slot',
      pos: at.studioSlot,
      range: 2.4,
      cone: 0.6,
      enabled: () => inserted < 6,
      prompt: () => `[E] 인형 틀에 부품을 끼운다 (${inserted}/6)`,
      onUse: () => {
        // 어디에 끼워도 맞는다
        const i = inserted++;
        const o = slotOffsets[(i * 4 + 1) % 6];
        const m = new THREE.Mesh(i < 2 ? new THREE.SphereGeometry(0.08, 8, 6) : new THREE.CylinderGeometry(0.035, 0.04, 0.16, 6), mat('plush', false).mat);
        m.position.copy(frame.position).add(new THREE.Vector3(o[0], o[1], 0.03));
        m.rotation.z = i >= 2 ? this.r() * 3 : 0;
        frame.parent!.add(m);
        marks.push(m);
        g.sfx.play(`velcro_${i % 3}`, { pos: at.studioSlot, gain: 0.6 });
        if (inserted === 6) {
          g.say(L('', '"어떤 모양이든 좋은 모양이에요!"')).catch(() => {});
          g.ui.tip('조작반의 버튼을 누른다', 4);
        }
      },
    });
    let pressed = false;
    g.inter.add({
      id: 'studio:panel',
      pos: at.studioPanel,
      range: 2.2,
      cone: 0.6,
      enabled: () => inserted >= 6 && !pressed,
      prompt: '[E] 버튼을 누른다',
      onUse: () => (pressed = true),
    });
    await g.until(() => pressed, tok);
    // 기계가 돌아간다 + 테이프 #4
    g.inter.remove('studio:panel');
    g.sfx.play('switch', { pos: at.studioPanel, gain: 0.6 });
    g.startLoop('machine', 'elev_motor', { pos: at.studioSlot, gain: 0.5, rate: 1.6 });
    g.audio.play(g.audio.any('ratchet'), { pos: at.studioSlot, gain: 0.6 });
    await g.wait(1.5, tok);
    await g.playTape('studio', 'studio', tok);
    g.stopLoop('machine', 0.5);
    g.audio.note('tbell', 79, { pos: at.studioOut, gain: 0.6 });
    for (const m of marks) m.removeFromParent();
    // 상품: 열쇠와 선택 기록
    const capsule = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('plastic_pink', false).mat);
    capsule.position.copy(at.studioOut);
    capsule.castShadow = true;
    g.world.level.areaGroup('ward').add(capsule);
    g.sfx.play('thump_small', { pos: at.studioOut, gain: 0.6, rate: 1.4 });
    let gotKey = false;
    g.inter.add({
      id: 'studio:prize',
      pos: () => capsule.position,
      range: 2,
      cone: 0.7,
      prompt: '[E] 상품 캡슐을 연다',
      onUse: () => {
        gotKey = true;
        capsule.removeFromParent();
        g.inter.remove('studio:prize');
        g.save.flags.key = 1;
        g.door('staff').locked = false;
        g.writeSave();
        g.sfx.play('paper_1', { bus: 'ui', gain: 0.5 });
        g.audio.play(g.audio.any('metal'), { bus: 'ui', gain: 0.3, rate: 2 });
        this.updateInventory();
        g.readDoc('receipt');
      },
    });
    await g.until(() => gotKey && !g.ui.docOpen, tok);
    await g.sayAll(UNA.studioDone, tok);
    g.ui.goal(GOALS.backDoor);
    // 직원 통로 쪽으로 가거나 잠시 지나면 — 무대의 그것이 일어선다
    const t0 = g.t;
    await g.until(() => g.player.pos.distanceTo(at.staffDoor) < 4 || g.t - t0 > 14, tok);
  }

  // ───────────────────────────── 추격 ─────────────────────────────

  private async chase(tok: number, fresh: boolean) {
    const g = this.g;
    const at = g.world.at;
    if (fresh) {
      g.setArea('ward');
      g.player.teleport(new THREE.Vector3(238.5, 0, -1.8), Math.PI);
      g.una.place(new THREE.Vector3(237.5, 0, -1.2), 0);
      g.una.show(true);
      g.light.setFlash(true);
      g.door('staff').locked = false;
      g.save.flags.key = 1;
      g.hoppy.place(at.hoppySeat.clone(), -Math.PI / 2, 'seated');
      await g.ui.fade(false, 0.6);
    }
    g.checkpoint('chase');
    this.updateInventory();
    g.save.charges = Math.max(g.save.charges, 3);
    // 침묵, 그리고 무대 조명
    g.pace.silence(2);
    g.music.zone = 0;
    g.stopLoop('pipes', 0.2);
    g.audio.busLevel('amb', 0.2, 0.5);
    await g.wait(1.6, tok);
    g.sfx.play('switch', { pos: at.stage.clone().setY(3), gain: 0.9 });
    const spot = new THREE.SpotLight(0xffe0c0, 40, 12, 0.5, 0.4, 1.2);
    spot.position.set(at.stage.x - 3, 3.2, at.stage.z);
    spot.target.position.copy(at.hoppySeat);
    spot.castShadow = false;
    g.world.level.areaGroup('ward').add(spot, spot.target);
    g.music.stinger('reveal');
    await g.wait(1.4, tok);
    g.hoppy.state = 'rise';
    g.sfx.play('plush_breath', { pos: g.hoppy.pos.clone().setY(1.5), gain: 0.8 });
    g.sfx.play('zipper', { pos: g.hoppy.pos.clone().setY(1.2), gain: 0.6 });
    await g.wait(1.2, tok);
    g.sfx.speak('새 친구! 부품 바꾸자!', 'toy', { pos: g.hoppy.pos.clone().setY(1.6), gain: 1, rate: 0.85 });
    g.say(L('호피', '새 친구! 부품 바꾸자!', 2)).catch(() => {});
    await g.wait(1.4, tok);
    // 추격 시작
    g.hoppy.state = 'chase';
    g.pace.setImmediate(140);
    g.music.chase = 1;
    g.audio.busLevel('amb', 1, 1);
    g.una.run = true;
    g.say(UNA.chase).catch(() => {});
    g.ui.goal(GOALS.chase);
    g.ui.tip(TIPS.crouch + ' · ' + TIPS.stun, 7);
    // 우나는 앞서 달린다: 직원 통로 → 통풍구 → 세탁실 투입구
    (async () => {
      await g.una.goTo(new THREE.Vector3(242.5, 0, 8.3), true);
      if (!g.door('staff').open) g.openDoor('staff', true);
      await g.una.goTo(new THREE.Vector3(234, 0, 10), true);
      await g.una.goTo(new THREE.Vector3(226.5, 0, 11.8), true);
      g.una.lookAt = g.player.eye;
      await g.say(UNA.chuteFirst, tok);
      g.sfx.play('chute', { pos: at.chute, gain: 0.8 });
      g.una.show(false);
    })().catch(() => {});
    // 투입구
    let jumped = false;
    g.inter.add({
      id: 'chute:go',
      pos: at.chute,
      range: 2.2,
      cone: 0.6,
      prompt: '[E] 투입구 덮개를 열고 뛰어든다',
      onUse: () => (jumped = true),
    });
    await g.until(() => jumped, tok);
    g.inter.remove('chute:go');
    const lid = g.world.meshes.chuteLid;
    lid.rotation.x = -1.2;
    g.sfx.play('chute', { bus: 'ui', gain: 0.9 });
    g.player.mode = 'locked';
    g.music.chase = 0;
    await g.ui.fade(true, 0.4);
    lid.rotation.x = 0;
    spot.removeFromParent();
    g.hoppy.state = 'hidden';
    g.pace.reset(60 + g.save.wrong * 15);
  }

  // ───────────────────────────── 지하 ─────────────────────────────

  private async basement(tok: number, fresh: boolean) {
    const g = this.g;
    const at = g.world.at;
    g.setArea('basement');
    g.player.teleport(g.world.spawn.basement.pos, g.world.spawn.basement.yaw);
    g.player.mode = 'locked';
    g.player.camOverride = { pos: new THREE.Vector3(405.8, 1.25, 6.4), look: at.chuteOut.clone().add(new THREE.Vector3(0, -0.9, 0)), k: 20, fov: 62 };
    g.ui.goal(null);
    g.una.place(new THREE.Vector3(403.4, 0, 3.6), Math.PI);
    g.una.show(true);
    g.una.mode = 'idle';
    g.light.setFlash(true);
    g.checkpoint('basement');
    g.save.flags.key = 1;
    g.startLoop('room', 'room_tone', { bus: 'amb', gain: 0.3 });
    if (!fresh) g.sfx.play('thud', { bus: 'ui', gain: 0.9 });
    await g.ui.fade(false, 0.6);
    // 투입구에 걸린 인형탈
    const h = g.hoppy;
    h.place(at.chuteOut.clone().add(new THREE.Vector3(0, 0.7, 0)), 0.4, 'stuck');
    h.rig.root.rotation.set(Math.PI, 0.4, 0);
    const base = h.rig.root.position.clone();
    const t0 = g.t;
    g.sfx.play('plush_breath', { pos: at.chuteOut, gain: 1 });
    await g.until(() => {
      const k = g.t - t0;
      h.rig.root.position.copy(base).add(new THREE.Vector3(Math.sin(k * 23) * 0.06 * Math.max(0, 1 - k / 3.5), 0, Math.cos(k * 19) * 0.04 * Math.max(0, 1 - k / 3.5)));
      h.rig.armL.rotation.x = Math.sin(k * 15) * 0.8 * Math.max(0, 1 - k / 3.5);
      h.rig.armR.rotation.x = Math.cos(k * 13) * 0.8 * Math.max(0, 1 - k / 3.5);
      if (Math.floor(k * 3) !== Math.floor((k - 0.02) * 3) && k < 3.2) g.sfx.play('velcro_' + Math.floor(this.r() * 3), { pos: at.chuteOut, gain: 0.6 });
      return k > 4.2;
    }, tok);
    // 무언가가 접혀서 빠져나간다
    await g.wait(1.0, tok);
    g.sfx.play('zipper', { pos: at.chuteOut, gain: 0.7, rate: 0.8 });
    await g.wait(0.8, tok);
    // 종이처럼 접힌 납작한 몸 (지그재그로 접힌 띠)
    const fold = new THREE.BufferGeometry();
    {
      const pts: number[] = [];
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const y0 = (i / segs) * 1.3 - 0.65;
        const y1 = ((i + 1) / segs) * 1.3 - 0.65;
        const z0 = i % 2 ? 0.07 : -0.07;
        const z1 = i % 2 ? -0.07 : 0.07;
        const w = 0.2 - Math.abs(i - 2.5) * 0.02;
        pts.push(-w, y0, z0, w, y0, z0, w, y1, z1, -w, y0, z0, w, y1, z1, -w, y1, z1);
      }
      fold.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      fold.computeVertexNormals();
    }
    const thing = new THREE.Mesh(fold, new THREE.MeshStandardMaterial({ color: 0xead2bf, roughness: 0.75, side: THREE.DoubleSide }));
    thing.position.copy(at.chuteOut).add(new THREE.Vector3(0, -0.2, 0));
    thing.castShadow = true;
    g.world.level.areaGroup('basement').add(thing);
    this.thing = thing;
    g.sfx.play('fold', { pos: at.chuteOut, gain: 0.9 });
    const t1 = g.t;
    g.player.camOverride = { pos: new THREE.Vector3(406.2, 1.2, 5.6), look: at.drain.clone().add(new THREE.Vector3(-1.2, 0.5, 0.4)), k: 1.2, fov: 62 };
    await g.until(() => {
      const k = Math.min(1, (g.t - t1) / 2.6);
      // 떨어져서 바닥을 따라 미끄러진다, 납작하게
      const fall = Math.min(1, k * 2.5);
      const slide = Math.max(0, (k - 0.4) / 0.6);
      thing.position.set(at.chuteOut.x + (at.drain.x - at.chuteOut.x) * slide, Math.max(0.02, at.chuteOut.y - 0.2 - fall * 3), at.chuteOut.z + (at.drain.z - at.chuteOut.z) * slide);
      thing.rotation.set(-Math.PI / 2 * fall, slide * 1.2, 0);
      thing.scale.set(1 - slide * 0.85, 1 - slide * 0.5, 1);
      return k >= 1;
    }, tok);
    thing.visible = false;
    g.audio.play(g.audio.any('bubbles'), { pos: at.drain, gain: 0.3, lowpass: 900 });
    await g.wait(1.0, tok);
    // 빈 인형탈만 매달려 있다
    h.rig.root.position.copy(base).add(new THREE.Vector3(0, 0.15, 0));
    h.rig.body.scale.set(1, 0.92, 0.7);
    g.player.camOverride = null;
    g.player.syncFromCamera(g.engine.camera);
    g.player.mode = 'walk';
    g.una.lookAt = at.chuteOut;
    await g.sayAll(UNA.basement, tok);
    g.una.lookAt = null;
    g.una.follow();
    this.setupUnaTalk();
    g.allowHold = true;
    g.ui.goal(GOALS.basement);
    g.inter.add({ id: 'ex:washer', pos: new THREE.Vector3(405, 0.8, 8), range: 2.2, prompt: '[E] 세탁기', onUse: () => g.examine('washer') });
    // 전실
    let inAir = false;
    await g.until(() => {
      if (!inAir && g.player.room?.id === 'airlock') {
        inAir = true;
        g.sfx.play('airshower', { pos: g.player.eye, gain: 0.6 });
        g.openDoor('air1', false);
        setTimeout(() => g.openDoor('air2', true), 3200);
      }
      return g.player.room?.id === 'clean';
    }, tok);
  }

  // ───────────────────────────── 무균실 · 마지막 장면 ─────────────────────────────

  private async clean(tok: number, fresh: boolean) {
    const g = this.g;
    const at = g.world.at;
    if (fresh) {
      g.setArea('basement');
      g.player.teleport(g.world.spawn.clean.pos, g.world.spawn.clean.yaw);
      g.una.place(new THREE.Vector3(420.5, 0, 5.2), -Math.PI / 2);
      g.una.show(true);
      g.una.follow();
      g.light.setFlash(true);
      this.setupUnaTalk();
      await g.ui.fade(false, 0.8);
    }
    g.checkpoint('clean');
    g.stopLoop('room', 1);
    g.music.zone = 0;
    g.allowHold = false;
    g.player.holding = false;
    await g.wait(1, tok);
    await g.sayAll(UNA.cleanRoom, tok);
    g.una.goTo(at.unaChair.clone()).then(() => {
      g.una.sit = true;
      g.una.yaw = 0;
    });
    g.ui.goal(GOALS.rest);
    let lie = false;
    g.inter.add({ id: 'bed:clean', pos: at.cleanBed, range: 2.4, cone: 0.6, prompt: '[E] 병상에 앉는다', onUse: () => (lie = true) });
    await g.until(() => lie, tok);
    g.inter.clear();
    g.ui.goal(null);
    g.writeSave();
    g.sfx.paper(undefined, 0.5);
    g.sfx.beep(0.2);
    // 마지막 장면
    g.player.mode = 'locked';
    const una = g.una;
    una.sit = true;
    una.place(at.unaChair.clone(), 0);
    una.mode = 'idle';
    const sitCam = at.cleanBed.clone().add(new THREE.Vector3(1.0, 0.45, 0.2));
    g.player.pos.set(sitCam.x, 0, sitCam.z);
    una.yaw = Math.atan2(sitCam.x - una.pos.x, sitCam.z - una.pos.z);
    g.player.camOverride = { pos: sitCam, look: una.head.clone().add(new THREE.Vector3(0, -0.1, 0)), k: 2, fov: 55 };
    g.audio.worldLevel(0.6, 2);
    await g.wait(2.5, tok);
    una.face('smile');
    await g.sayAll(UNA.ending, tok);
    g.ui.prompt('[E] 청진기를 건넨다');
    g.input.clearLatch();
    await g.until(() => !!g.input.take('KeyE', 'Mouse0'), tok);
    g.ui.prompt(null);
    g.sfx.play('switch', { bus: 'ui', gain: 0.2, rate: 0.6 });
    // 우나가 내 가슴에 청진기를 댄다: 내 심장 소리
    una.reach = 1;
    una.lookAt = g.engine.camera.position.clone().add(new THREE.Vector3(0, -0.4, 0));
    await g.wait(0.8, tok);
    const hb = setInterval(() => g.sfx.play('heart_ear', { bus: 'heart', gain: 0.9, rate: 1.05 }), 520);
    try {
      await g.wait(1.6, tok);
      una.face('laugh');
      await g.say(UNA.endingListen, tok);
      await g.wait(1.0, tok);
    } finally {
      clearInterval(hb);
    }
    una.face('smile');
    una.reach = 0.3;
    await g.say(UNA.endingSwap, tok);
    g.ui.prompt('[E] 듣는다');
    g.input.clearLatch();
    await g.until(() => !!g.input.take('KeyE', 'Mouse0'), tok);
    g.ui.prompt(null);
    // 아무 소리도 나지 않는다
    {
      const toCam = new THREE.Vector3(sitCam.x - una.pos.x, 0, sitCam.z - una.pos.z).normalize();
      g.player.camOverride = { pos: una.head.clone().addScaledVector(toCam, 0.8).add(new THREE.Vector3(0, 0.02, 0)), look: una.head.clone().add(new THREE.Vector3(0, -0.04, 0)), k: 0.8, fov: 45 };
    }
    g.audio.worldLevel(0, 1.2);
    g.audio.busLevel('music', 0, 1);
    g.audio.busLevel('amb', 0, 1);
    g.light.update(0, g.area);
    una.face('neutral');
    g.sfx.play('thump_small', { bus: 'ui', gain: 0.15, rate: 0.6 });
    await g.wait(5.5, tok);
    una.face('smile');
    await g.wait(1.2, tok);
    una.face('laugh');
    await g.say({ ...UNA.endingLaugh, dur: 2.4 }, tok);
    // 암전
    g.ui.fade(true, 0.05);
    await g.wait(2.5, tok);
    g.audio.busLevel('music', 1, 0.1);
    g.audio.busLevel('amb', 1, 0.1);
    g.audio.worldLevel(1, 0.1);
    g.save.flags.ch1done = 1;
    g.save.checkpoint = 'clean';
    g.writeSave();
    // 크레딧
    g.ui.showHud(false);
    g.state = 'credits';
    g.input.exitLock();
    const c = g.ui.credits(CREDITS, NEXT);
    g.music.onLyric = (l) => c.lyric(l);
    g.music.startCredits();
    await new Promise<void>((r) => (g.music.onCreditsEnd = r));
    await c.done;
    g.ui.fade(false, 0.1);
    g.showTitle();
  }

  // ───────────────────────────── 매 프레임 ─────────────────────────────

  update(dt: number) {
    const g = this.g;
    // 마커스가 걸어간다
    if (this.marcus) {
      const m = this.marcus;
      this.marcusWalk += dt;
      const target = g.world.at.marcusWalk;
      const p = m.root.position;
      const to = new THREE.Vector3(target.x - p.x, 0, target.z - p.z);
      if (to.length() > 0.5 && this.marcusWalk > 1.5) {
        to.normalize();
        p.addScaledVector(to, dt * 1.3);
        m.root.rotation.y = Math.atan2(to.x, to.z);
        walkPose(m, this.marcusWalk * 6, 0.8);
      } else if (to.length() <= 0.5) {
        m.root.visible = false;
      }
    }
    // TV 화면 (퀴즈 대기 중: 호피가 기다린다)
    this.tvAnimT -= dt;
    if (this.tvAnimT <= 0 && g.area === 'ward') {
      this.tvAnimT = 1 / 12;
      for (const [key, st] of this.tvs) {
        const scr = g.screens.get(key);
        if (!scr) continue;
        const tv = g.world.tvs[key];
        const near = tv.pos.distanceTo(g.player.eye) < 14;
        if (st.state === 'idle' && near) scr.frame('hhh_title', g.t, 'HOPPY 88', g.t % 5);
        else if (st.state === 'impossible' && near) scr.static(g.t, 0.5 + Math.sin(g.t * 7) * 0.2);
        else if (st.state === 'cool') {
          st.t -= 1 / 12;
          if (near) scr.static(g.t, 0.35);
          if (st.t <= 0) st.state = 'idle';
        } else if ((st.state === 'done' || st.state === 'off') && scr.on) scr.off();
      }
    }
    // 순찰 회진
    if (this.patrolOn && g.area === 'ward' && g.state === 'play' && !g.busy) {
      this.patrolT -= dt;
      if (this.patrolT <= 0) {
        this.patrolT = 80 + this.r() * 30;
        this.spawnPatrol(false);
      }
    }
    // 정문 바깥의 구급차 소리
    void EXAMINE;
    void CHARTS;
  }
}
