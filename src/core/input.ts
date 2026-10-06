/**
 * 키보드·마우스 입력.
 * 포인터 잠금을 우선 쓰고, 잠금이 막힌 환경(일부 iframe 등)에서는 마우스 드래그로 시점을 돌린다.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  /** 스크립트용: 누른 키를 '가져갈' 때까지 남겨 둔다 (프레임 순서와 무관) */
  private latched = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  dragLook = false;
  private dragging = false;
  /** 잠금 직후의 첫 움직임은 커서 위치 전체가 들어오는 브라우저가 있어 버린다 */
  private skipMoves = 0;
  sensitivity = 1;
  enabled = true;
  /** 포인터 잠금을 요청해도 되는 상태인가 (메뉴가 떠 있으면 false) */
  wantLock = false;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.latched.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousedown', (e) => {
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : `Mouse${e.button}`;
      this.down.add(code);
      this.pressed.add(code);
      this.latched.add(code);
      if (this.wantLock && !this.locked) this.requestLock();
      if (this.dragLook) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : `Mouse${e.button}`;
      this.down.delete(code);
      this.released.add(code);
      this.dragging = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.skipMoves > 0) {
        this.skipMoves--;
        return;
      }
      if (this.locked || (this.dragLook && this.dragging)) {
        // 한 이벤트에서 비정상적으로 큰 값은 잘라낸다
        this.mouseDX += Math.max(-160, Math.min(160, e.movementX));
        this.mouseDY += Math.max(-160, Math.min(160, e.movementY));
      }
    });
    window.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.skipMoves = 2;
      this.mouseDX = 0;
      this.mouseDY = 0;
    });
    document.addEventListener('pointerlockerror', () => {
      // 잠금이 막힌 환경: 드래그로 시점을 돌린다
      this.dragLook = true;
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => (this.dragLook = true));
    } catch {
      this.dragLook = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string) {
    return this.enabled && this.down.has(code);
  }
  wasPressed(code: string) {
    return this.enabled && this.pressed.has(code);
  }
  wasReleased(code: string) {
    return this.released.has(code);
  }
  /** 메뉴 등 입력 차단 상태와 무관하게 확인 */
  rawPressed(code: string) {
    return this.pressed.has(code);
  }

  /** 스크립트용: 눌렸으면 true를 돌려주고 지운다 */
  take(...codes: string[]) {
    for (const c of codes)
      if (this.latched.has(c)) {
        this.latched.delete(c);
        return c;
      }
    return null;
  }

  clearLatch() {
    this.latched.clear();
  }

  /** 프레임 끝에 호출 */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
