import * as THREE from 'three';
import type { Level } from '../world/level';

/**
 * 상호작용 대상: 위치, 거리, 시선 각도 안에 들어오면 [E] 안내가 뜬다.
 * 가장 '정면에 가까운' 대상 하나만 고른다. 벽 너머는 고르지 않는다.
 */
export interface Interactable {
  id: string;
  pos: THREE.Vector3 | (() => THREE.Vector3);
  prompt: string | (() => string);
  /** 최대 거리 (기본 2.2m) */
  range?: number;
  /** 시선과의 최대 각도 (라디안, 기본 0.35) */
  cone?: number;
  enabled?: () => boolean;
  onUse: () => void;
  area?: string;
  /** 키 (기본 E) */
  key?: string;
}

export class Interactions {
  private items = new Map<string, Interactable>();
  current: Interactable | null = null;

  add(i: Interactable) {
    this.items.set(i.id, i);
    return i;
  }

  remove(id: string) {
    this.items.delete(id);
    if (this.current?.id === id) this.current = null;
  }

  has(id: string) {
    return this.items.has(id);
  }

  clear() {
    this.items.clear();
    this.current = null;
  }

  posOf(i: Interactable) {
    return typeof i.pos === 'function' ? i.pos() : i.pos;
  }

  promptOf(i: Interactable) {
    return typeof i.prompt === 'function' ? i.prompt() : i.prompt;
  }

  /** 지금 바라보는 대상 */
  pick(eye: THREE.Vector3, dir: THREE.Vector3, level: Level, area: string): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    const to = new THREE.Vector3();
    for (const i of this.items.values()) {
      if (i.area && i.area !== area) continue;
      if (i.enabled && !i.enabled()) continue;
      const p = this.posOf(i);
      to.subVectors(p, eye);
      const d = to.length();
      const range = i.range ?? 2.2;
      if (d > range || d < 1e-3) continue;
      to.divideScalar(d);
      const ang = Math.acos(THREE.MathUtils.clamp(to.dot(dir), -1, 1));
      const cone = (i.cone ?? 0.35) + Math.max(0, 0.6 - d) * 0.8;
      if (ang > cone) continue;
      // 벽 너머 제외 (발밑 높이에서 확인)
      if (level.wallsBetween(eye.x, eye.z, p.x - (p.x - eye.x) * 0.05, p.z - (p.z - eye.z) * 0.05, true) > 0) continue;
      const score = ang * 2 + d * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.current = best;
    return best;
  }
}
