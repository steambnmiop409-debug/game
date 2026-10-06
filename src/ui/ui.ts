import type { Line } from '../data/text';
import type { Doc, Scan } from '../data/text';
import logoUrl from '../../assets/brand/second_nature_logo.svg?url';

export { logoUrl };

/**
 * DOM 위의 HUD와 메뉴. 글꼴은 갈무리(픽셀 한글).
 * 자막은 대사 큐로 흘러가고, await로 끝을 기다릴 수 있다.
 */

const WHO_CLASS: Record<string, string> = {
  우나: 'una',
  마커스: 'marcus',
  무전: 'radio',
  녹음: 'tape',
  방송: 'radio',
  호피: 'hoppy',
  애시퍼드: 'tape',
  헤일: 'tape',
  루스: 'tape',
  아이: 'tape',
  나: 'me',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** [E] 같은 키 표시를 <kbd>로 */
function keys(s: string) {
  return esc(s).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  sens: number;
  scale: number;
  difficulty: 'green' | 'yellow' | 'red';
  subSize: number;
}

export class UI {
  readonly hud: HTMLElement;
  private cross: HTMLElement;
  private promptEl: HTMLElement;
  private subs: HTMLElement;
  private goalEl: HTMLElement;
  private placeEl: HTMLElement;
  private tipEl: HTMLElement;
  private staminaEl: HTMLElement;
  private partsEl: HTMLElement;
  private invEl: HTMLElement;
  private scanEl: HTMLElement;
  private docEl: HTMLElement;
  private quizEl: HTMLElement;
  private vhsEl: HTMLElement;
  private cardEl: HTMLElement;
  private fadeEl: HTMLElement;
  private debugEl: HTMLElement;
  readonly menus: HTMLElement;
  private subQueue: { line: Line; resolve: () => void }[] = [];
  private subBusy = false;
  private tipTimer = 0;
  private placeTimer = 0;
  docOpen = false;
  private docResolve: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.hud = el('div', 'layer hud', root);
    this.cross = el('div', 'crosshair', this.hud);
    this.promptEl = el('div', 'prompt', this.hud);
    this.goalEl = el('div', 'goal', this.hud);
    this.placeEl = el('div', 'place', this.hud);
    this.partsEl = el('div', 'parts', this.hud);
    this.invEl = el('div', 'inv', this.hud);
    this.staminaEl = el('div', 'stamina', this.hud, '<i></i>');
    this.tipEl = el('div', 'tip', this.hud);
    this.scanEl = el('div', 'scan', this.hud);
    this.subs = el('div', 'subs', root);
    this.vhsEl = el('div', 'vhs', root, '<div class="label"></div><div class="skip">[E] 건너뛰기</div>');
    this.quizEl = el('div', 'quiz', root);
    this.docEl = el('div', 'doc', root);
    this.cardEl = el('div', 'card', root);
    this.fadeEl = el('div', 'fade', root);
    this.menus = el('div', 'layer', root);
    this.debugEl = el('div', 'debug', root);
  }

  // ───────────── HUD ─────────────

  showHud(on: boolean) {
    this.hud.style.display = on ? '' : 'none';
  }

  crosshair(hot: boolean, visible = true) {
    this.cross.classList.toggle('hot', hot);
    this.cross.style.display = visible ? '' : 'none';
  }

  prompt(text: string | null) {
    if (text) {
      const h = keys(text);
      if (this.promptEl.innerHTML !== h) this.promptEl.innerHTML = h;
      this.promptEl.classList.add('on');
    } else this.promptEl.classList.remove('on');
  }

  /** 지금 목표 문장과, 그 목표가 정해진 시각 (힌트 타이머) */
  goalText: string | null = null;
  goalAt = 0;

  goal(text: string | null) {
    if (text !== this.goalText) {
      this.goalText = text;
      this.goalAt = performance.now();
    }
    this.goalEl.innerHTML = text ? `목표<b>${esc(text)}</b>` : '';
  }

  place(name: string, sub = '') {
    this.placeEl.innerHTML = `${esc(name)}${sub ? `<br>${esc(sub)}` : ''}`;
    this.placeEl.classList.add('on');
    this.placeTimer = 4;
  }

  tip(text: string | null, secs = 6) {
    if (text === null) {
      this.tipEl.classList.remove('on');
      this.tipTimer = 0;
      return;
    }
    this.tipEl.innerHTML = keys(text);
    this.tipEl.classList.add('on');
    this.tipTimer = secs;
  }

  stamina(v: number) {
    const on = v < 0.98;
    this.staminaEl.classList.toggle('on', on);
    (this.staminaEl.firstChild as HTMLElement).style.width = `${Math.round(v * 100)}%`;
  }

  parts(got: boolean[] | null) {
    if (!got) {
      this.partsEl.innerHTML = '';
      return;
    }
    this.partsEl.innerHTML = got.map((g) => `<i class="${g ? 'got' : ''}"></i>`).join('');
  }

  inventory(items: { name: string; sel?: boolean }[]) {
    this.invEl.innerHTML = items.map((i) => `<div class="slot ${i.sel ? 'sel' : ''}">${keys(i.name)}</div>`).join('');
  }

  scan(s: Scan | null, progress = 1) {
    if (!s) {
      this.scanEl.classList.remove('on');
      return;
    }
    const lines = progress >= 1 ? s.lines : s.lines.slice(0, Math.floor(progress * s.lines.length));
    this.scanEl.innerHTML = `<div class="head">SN-RI 재지시기 · ${esc(s.head)}</div>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}${progress < 1 ? `<div class="bar"><i style="width:${Math.round(progress * 100)}%"></i></div>` : ''}`;
    this.scanEl.classList.add('on');
  }

  scanning(progress: number) {
    this.scanEl.innerHTML = `<div class="head">SN-RI 재지시기 · 판독 중</div><div>지시 기록을 읽는 중…</div><div class="bar"><i style="width:${Math.round(progress * 100)}%"></i></div>`;
    this.scanEl.classList.add('on');
  }

  update(dt: number) {
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.tipEl.classList.remove('on');
    }
    if (this.placeTimer > 0) {
      this.placeTimer -= dt;
      if (this.placeTimer <= 0) this.placeEl.classList.remove('on');
    }
  }

  debug(text: string) {
    this.debugEl.textContent = text;
  }

  // ───────────── 자막 ─────────────

  /** 대사 하나를 띄우고, 끝나면 resolve */
  say(line: Line): Promise<void> {
    return new Promise((resolve) => {
      this.subQueue.push({ line, resolve });
      if (!this.subBusy) this.nextSub();
    });
  }

  async sayAll(lines: Line[]) {
    for (const l of lines) await this.say(l);
  }

  clearSubs() {
    for (const q of this.subQueue) q.resolve();
    this.subQueue.length = 0;
    this.subs.innerHTML = '';
    this.subBusy = false;
  }

  private nextSub() {
    const item = this.subQueue.shift();
    if (!item) {
      this.subBusy = false;
      this.subs.innerHTML = '';
      return;
    }
    this.subBusy = true;
    const { line } = item;
    const dur = line.dur ?? Math.min(7, 1.6 + line.text.length * 0.075);
    const who = line.who ? `<span class="who ${WHO_CLASS[line.who] ?? ''}">${esc(line.who === '나' ? '' : line.who)}</span>` : '';
    this.subs.innerHTML = `<div class="line">${who}${esc(line.text)}</div>`;
    setTimeout(() => {
      item.resolve();
      this.nextSub();
    }, dur * 1000);
  }

  // ───────────── 문서 ─────────────

  showDoc(doc: Doc): Promise<void> {
    this.docEl.innerHTML = `<h2>${esc(doc.title)}</h2>${doc.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${doc.stamp ? `<div class="stamp">${esc(doc.stamp)}</div>` : ''}<div class="close">[E] / [Esc] 닫기</div>`;
    this.docEl.classList.add('on');
    this.docOpen = true;
    return new Promise((r) => (this.docResolve = r));
  }

  closeDoc() {
    this.docEl.classList.remove('on');
    this.docOpen = false;
    const r = this.docResolve;
    this.docResolve = null;
    r?.();
  }

  // ───────────── 퀴즈, 테이프 ─────────────

  quiz(q: { q: string; options: string[] } | null, pick = -1) {
    if (!q) {
      this.quizEl.classList.remove('on');
      return;
    }
    this.quizEl.innerHTML = `<div class="q">${esc(q.q)}</div><div class="opts">${q.options.map((o, i) => `<div class="${i === pick ? 'pick' : ''}">[${i + 1}] ${esc(o)}</div>`).join('')}</div>`;
    this.quizEl.classList.add('on');
  }

  vhs(label: string | null) {
    this.vhsEl.classList.toggle('on', !!label);
    if (label) (this.vhsEl.querySelector('.label') as HTMLElement).textContent = label;
  }

  // ───────────── 화면 전체 ─────────────

  card(html: string | null) {
    if (html === null) {
      this.cardEl.classList.remove('on');
      return;
    }
    this.cardEl.innerHTML = html;
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('on');
  }

  fade(on: boolean, secs = 0.8): Promise<void> {
    this.fadeEl.style.transition = `opacity ${secs}s`;
    this.fadeEl.style.background = '#000';
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, secs * 1000));
  }

  white(on: boolean, secs = 1.2): Promise<void> {
    this.fadeEl.style.transition = `opacity ${secs}s`;
    this.fadeEl.style.background = '#fff';
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, secs * 1000));
  }

  // ───────────── 메뉴 ─────────────

  clearMenus() {
    this.menus.innerHTML = '';
  }

  /** 첫 화면: 오디오를 켜려면 클릭이 필요하다 */
  gate(onClick: () => void) {
    this.clearMenus();
    const m = el('div', 'menu on gate', this.menus);
    el('div', 'big', m, 'SECOND NATURE');
    el('div', 'small', m, '헤드폰을 권장합니다 · 클릭하면 시작합니다');
    const bar = el('div', 'bar', m, '<i></i>');
    bar.style.visibility = 'hidden';
    const note = el('div', 'small', m, '');
    m.addEventListener(
      'click',
      () => {
        bar.style.visibility = 'visible';
        note.textContent = '악기를 조율하는 중…';
        m.style.cursor = 'default';
        onClick();
      },
      { once: true },
    );
    return {
      progress: (p: number, text?: string) => {
        (bar.firstChild as HTMLElement).style.width = `${Math.round(p * 100)}%`;
        if (text) note.textContent = text;
      },
    };
  }

  title(opts: { canContinue: boolean; onNew: () => void; onContinue: () => void; onSettings: () => void; onCredits: () => void }) {
    this.clearMenus();
    const m = el('div', 'menu on title', this.menus);
    const img = el('img', 'logo', m) as HTMLImageElement;
    img.src = logoUrl;
    img.alt = 'SECOND NATURE';
    const items = el('div', 'items', m);
    const btn = (label: string, fn: () => void, disabled = false) => {
      const b = el('button', '', items, esc(label)) as HTMLButtonElement;
      b.disabled = disabled;
      b.onclick = fn;
      return b;
    };
    btn('이어하기', opts.onContinue, !opts.canContinue);
    btn('새로 시작 — Chapter 1: 치료', opts.onNew);
    btn('설정', opts.onSettings);
    btn('만든 사람들', opts.onCredits);
    el('div', 'foot', m, 'SECOND NATURE · Chapter 1<br>WASD 이동 · 마우스 시점 · E 사용 · Esc 일시정지');
  }

  settings(s: Settings, onChange: (s: Settings) => void, onClose: () => void) {
    const wrap = el('div', 'menu on', this.menus);
    wrap.style.background = 'rgba(0,0,0,0.5)';
    const p = el('div', 'panel', wrap);
    el('h3', '', p, '설정');
    const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'sens' | 'scale' | 'subSize', min: number, max: number, step: number, fmt: (v: number) => string) => {
      const l = el('label', '', p);
      el('span', '', l, esc(label));
      const inp = el('input', '', l) as HTMLInputElement;
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(s[key]);
      const out = el('span', '', l, fmt(s[key]));
      inp.oninput = () => {
        s[key] = Number(inp.value);
        out.textContent = fmt(s[key]);
        onChange(s);
      };
    };
    slider('전체 소리', 'master', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    slider('음악', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    slider('효과음', 'sfx', 0, 1, 0.05, (v) => `${Math.round(v * 100)}`);
    slider('마우스 감도', 'sens', 0.2, 3, 0.05, (v) => v.toFixed(2));
    slider('렌더 해상도', 'scale', 0.25, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('자막 크기', 'subSize', 0.8, 1.6, 0.05, (v) => `${Math.round(v * 100)}%`);
    el('div', '', p, '<span style="color:var(--dim);font-size:13px">난이도 (중증도 분류)</span>');
    const row = el('div', 'row', p);
    const diffs: [Settings['difficulty'], string][] = [
      ['green', '초록 — 쉬움'],
      ['yellow', '노랑 — 보통'],
      ['red', '빨강 — 어려움'],
    ];
    const btns: HTMLButtonElement[] = [];
    for (const [k, label] of diffs) {
      const b = el('button', s.difficulty === k ? 'sel' : '', row, label) as HTMLButtonElement;
      btns.push(b);
      b.onclick = () => {
        s.difficulty = k;
        btns.forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        onChange(s);
      };
    }
    const close = el('button', '', p, '▸ 닫기') as HTMLButtonElement;
    close.style.marginTop = '12px';
    close.onclick = () => {
      wrap.remove();
      onClose();
    };
  }

  /** 일시정지 = 구급 활동 기록지 */
  pause(info: { time: string; place: string; patient: string; notes: string }, onResume: () => void, onSettings: () => void, onTitle: () => void) {
    this.clearMenus();
    const wrap = el('div', 'menu on', this.menus);
    wrap.style.background = 'rgba(0,0,0,0.55)';
    const p = el('div', 'pcr', wrap);
    p.innerHTML = `<div class="hd"><span>ALDER COUNTY EMS — PATIENT CARE REPORT</span><b>구급 활동 기록지</b></div>
      <div class="grid">
        <div>출동 일시</div><div class="hand">2009-11-27 02:14 / 현재 ${esc(info.time)}</div>
        <div>현장</div><div class="hand">할로 파인스 캠퍼스 — ${esc(info.place)}</div>
        <div>환자</div><div class="hand">${esc(info.patient)}</div>
        <div>활력 징후</div><div class="hand">맥박 ___ / 호흡 ___ / 체온 ___</div>
        <div>특이 사항</div><div class="hand">${esc(info.notes)}</div>
      </div>
      <div class="btns"></div>`;
    const btns = p.querySelector('.btns') as HTMLElement;
    const b = (label: string, fn: () => void) => {
      const x = el('button', '', btns, esc(label)) as HTMLButtonElement;
      x.onclick = fn;
    };
    b('계속', onResume);
    b('설정', onSettings);
    b('타이틀로', onTitle);
  }

  /** 실패 = 구급 활동 기록지의 주증상 */
  fail(info: { complaint: string; note: string; place: string }, onRetry: () => void, onTitle: () => void) {
    this.clearMenus();
    const wrap = el('div', 'menu on', this.menus);
    wrap.style.background = 'rgba(255,255,255,0.08)';
    const p = el('div', 'pcr', wrap);
    p.innerHTML = `<div class="hd"><span>ALDER COUNTY EMS — PATIENT CARE REPORT</span><b>구급 활동 기록지</b></div>
      <div class="grid">
        <div>환자</div><div class="hand">구급대원 (본인)</div>
        <div>현장</div><div class="hand">할로 파인스 캠퍼스 — ${esc(info.place)}</div>
        <div>주증상</div><div class="hand" style="color:#8a1d18">${esc(info.complaint)}</div>
        <div>경과</div><div class="hand">${esc(info.note)}</div>
        <div>처치</div><div class="hand">—</div>
      </div>
      <div class="btns"></div>`;
    const btns = p.querySelector('.btns') as HTMLElement;
    const r = el('button', '', btns, '마지막 기록부터 다시') as HTMLButtonElement;
    r.onclick = onRetry;
    const t = el('button', '', btns, '타이틀로') as HTMLButtonElement;
    t.onclick = onTitle;
  }

  credits(rows: string[][], next: string): { lyric: (s: string) => void; done: Promise<void> } {
    this.clearMenus();
    const m = el('div', 'credits on', this.menus);
    const roll = el('div', 'roll', m);
    roll.innerHTML = rows.map(([a, b]) => (a ? `<div class="h">${esc(a)}</div><div>${esc(b)}</div>` : '<div>&nbsp;</div>')).join('') + `<div style="height:40vh"></div><div class="h">다음 이야기</div><div>${esc(next)}</div>`;
    const lyric = el('div', 'lyric', m);
    const H = window.innerHeight;
    let y = H;
    const total = roll.scrollHeight + H;
    const start = performance.now();
    const dur = 40000;
    let resolveDone: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    const step = () => {
      const k = (performance.now() - start) / dur;
      y = H - k * total * 0.92;
      roll.style.transform = `translateY(${y}px)`;
      if (k < 1) requestAnimationFrame(step);
      else resolveDone();
    };
    requestAnimationFrame(step);
    return {
      lyric: (s: string) => {
        lyric.style.opacity = '0';
        setTimeout(() => {
          lyric.textContent = s;
          lyric.style.opacity = '1';
        }, 200);
      },
      done,
    };
  }

  subSize(k: number) {
    this.subs.style.fontSize = `calc(clamp(16px, 2.1vw, 22px) * ${k})`;
  }
}
