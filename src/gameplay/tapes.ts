import * as THREE from 'three';
import { drawHoppy } from '../world/textures';
import { rng } from '../core/util';

/**
 * TV 화면 (캔버스 텍스처). VHS 테이프 장면, 호피의 건강 시간, 잡음, 꺼짐.
 * 장면은 128×96 픽셀 그림으로 그리고, 테이프 특유의 추적 잡음과 날짜 도장을 덧씌운다.
 */
export class Screen {
  readonly canvas = document.createElement('canvas');
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;
  private r = rng(7);
  on = false;
  constructor(readonly mesh: THREE.Mesh) {
    this.canvas.width = 128;
    this.canvas.height = 96;
    this.g = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.g.imageSmoothingEnabled = false;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, fog: false });
    this.off();
  }

  off() {
    this.on = false;
    const g = this.g;
    const gr = g.createRadialGradient(64, 44, 4, 64, 48, 70);
    gr.addColorStop(0, '#26302d');
    gr.addColorStop(1, '#0a0e0d');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(14, 10, 30, 6);
    this.tex.needsUpdate = true;
    this.mesh.material = this.mat;
    this.mat.color.setScalar(1);
  }

  /** 잡음 화면 */
  static(t: number, k = 1) {
    this.on = true;
    const g = this.g;
    const img = g.createImageData(128, 96);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = this.r() * 255 * k;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const y = Math.floor((t * 60) % 96);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(0, y, 128, 3);
    this.tex.needsUpdate = true;
    this.mat.color.setScalar(1.6);
  }

  /** 장면 하나 그리기 + VHS 효과 */
  frame(scene: string, t: number, stamp: string, local: number, glitch = 0) {
    this.on = true;
    const g = this.g;
    g.save();
    drawScene(g, scene, local, this.r);
    g.restore();
    vhs(g, t, stamp, this.r, glitch);
    this.tex.needsUpdate = true;
    this.mat.color.setScalar(1.7);
  }
}

function vhs(g: CanvasRenderingContext2D, t: number, stamp: string, r: () => number, glitch: number) {
  // 색 번짐: 한 줄씩 살짝 밀기
  const img = g.getImageData(0, 0, 128, 96);
  const d = img.data;
  const out = g.createImageData(128, 96);
  const o = out.data;
  const band = (t * 23) % 96;
  for (let y = 0; y < 96; y++) {
    let shift = Math.sin(y * 0.7 + t * 3) > 0.97 ? 2 : 0;
    if (Math.abs(y - band) < 3) shift += 3;
    if (glitch > 0 && r() < glitch * 0.3) shift += Math.floor((r() - 0.5) * 20 * glitch);
    for (let x = 0; x < 128; x++) {
      const sx = Math.min(127, Math.max(0, x - shift));
      const i = (y * 128 + x) * 4;
      const j = (y * 128 + sx) * 4;
      const jr = (y * 128 + Math.min(127, sx + 1)) * 4;
      o[i] = d[jr];
      o[i + 1] = d[j + 1];
      o[i + 2] = d[j + 2];
      o[i + 3] = 255;
      if (y % 2 === 0) {
        o[i] *= 0.88;
        o[i + 1] *= 0.88;
        o[i + 2] *= 0.88;
      }
      const n = (r() - 0.5) * 18;
      o[i] += n;
      o[i + 1] += n;
      o[i + 2] += n;
    }
  }
  g.putImageData(out, 0, 0);
  // 아래쪽 추적 잡음
  for (let k = 0; k < 18; k++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.3})`;
    g.fillRect(r() * 128, 88 + r() * 8, 2 + r() * 10, 1);
  }
  g.font = 'bold 7px monospace';
  g.fillStyle = '#fff';
  g.textBaseline = 'top';
  g.fillText('PLAY ▶', 4, 4);
  g.fillText(stamp, 70, 84);
}

// ───────────────────────────── 장면 그림 ─────────────────────────────

function bg(g: CanvasRenderingContext2D, top: string, bottom: string) {
  const gr = g.createLinearGradient(0, 0, 0, 96);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 96);
}

function person(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: { coat?: string; hair?: string; skin?: string; hairStyle?: 'bob' | 'short' | 'bald' | 'kid'; mouth?: number; glasses?: boolean }) {
  const coat = o.coat ?? '#e8e4d8';
  const skin = o.skin ?? '#e9c4a6';
  // 몸
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(x - 18 * s, y + 40 * s);
  g.quadraticCurveTo(x - 16 * s, y + 8 * s, x, y + 6 * s);
  g.quadraticCurveTo(x + 16 * s, y + 8 * s, x + 18 * s, y + 40 * s);
  g.fill();
  // 목, 얼굴
  g.fillStyle = skin;
  g.fillRect(x - 3 * s, y, 6 * s, 8 * s);
  g.beginPath();
  g.ellipse(x, y - 6 * s, 9 * s, 11 * s, 0, 0, Math.PI * 2);
  g.fill();
  // 머리
  g.fillStyle = o.hair ?? '#3a2a20';
  if (o.hairStyle === 'bob') {
    g.beginPath();
    g.ellipse(x, y - 10 * s, 11 * s, 9 * s, 0, Math.PI, 0);
    g.fill();
    g.fillRect(x - 11 * s, y - 10 * s, 4 * s, 13 * s);
    g.fillRect(x + 7 * s, y - 10 * s, 4 * s, 13 * s);
  } else if (o.hairStyle === 'kid') {
    g.beginPath();
    g.ellipse(x, y - 11 * s, 10 * s, 8 * s, 0, Math.PI, 0);
    g.fill();
  } else if (o.hairStyle !== 'bald') {
    g.beginPath();
    g.ellipse(x, y - 12 * s, 9.5 * s, 6 * s, 0, Math.PI, 0);
    g.fill();
  }
  // 눈, 입
  g.fillStyle = '#2a1a14';
  g.fillRect(x - 4 * s, y - 7 * s, 2 * s, 2 * s);
  g.fillRect(x + 2 * s, y - 7 * s, 2 * s, 2 * s);
  if (o.glasses) {
    g.strokeStyle = '#222';
    g.lineWidth = 1;
    g.strokeRect(x - 6 * s, y - 9 * s, 5 * s, 4 * s);
    g.strokeRect(x + 1 * s, y - 9 * s, 5 * s, 4 * s);
  }
  g.fillStyle = '#9a4a4a';
  const m = o.mouth ?? 0;
  g.fillRect(x - 3 * s, y - 1 * s + m, 6 * s, 1 * s + Math.abs(m));
}

function mouse(g: CanvasRenderingContext2D, x: number, y: number, toes: number, t: number) {
  g.fillStyle = '#efefe8';
  g.beginPath();
  g.ellipse(x, y, 14, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(x + 13, y - 3, 6, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8b0b0';
  g.beginPath();
  g.arc(x + 12, y - 8, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c33';
  g.fillRect(x + 16, y - 4, 1, 1);
  g.strokeStyle = '#e8b0b0';
  g.beginPath();
  g.moveTo(x - 14, y);
  g.quadraticCurveTo(x - 24, y - 4 + Math.sin(t * 3) * 2, x - 30, y + 2);
  g.stroke();
  // 확대한 발 (오른쪽 위 원)
  g.strokeStyle = '#fff';
  g.strokeRect(88, 10, 34, 30);
  g.fillStyle = '#e8b0b0';
  g.fillRect(96, 26, 16, 8);
  for (let i = 0; i < toes; i++) g.fillRect(94 + i * (20 / toes), 18, 2, 8);
  g.font = '6px monospace';
  g.fillStyle = '#fff';
  g.fillText(`TOES: ${toes}`, 90, 34);
}

function drawScene(g: CanvasRenderingContext2D, scene: string, t: number, r: () => number) {
  switch (scene) {
    case 'logo': {
      bg(g, '#2f5d55', '#1d3a35');
      g.fillStyle = '#4f8a5b';
      g.beginPath();
      g.ellipse(58, 34, 8, 4, -0.6, 0, Math.PI * 2);
      g.ellipse(70, 31, 10, 5, 0.6, 0, Math.PI * 2);
      g.fill();
      g.fillRect(63, 34, 2, 12);
      g.font = 'bold 13px Georgia, serif';
      g.fillStyle = '#f2ead6';
      g.textAlign = 'center';
      g.fillText('SECOND NATURE', 64, 62);
      g.font = '6px Arial';
      g.fillText("CHILDREN'S CENTER", 64, 72);
      g.textAlign = 'left';
      break;
    }
    case 'ashford': {
      bg(g, '#5a6a62', '#2a3430');
      g.fillStyle = '#7a5a3a';
      g.fillRect(0, 70, 128, 26);
      person(g, 64, 42, 1.4, { hair: '#b9b6ae', hairStyle: 'bob', mouth: Math.sin(t * 12) > 0 ? 1 : 0 });
      g.fillStyle = '#c9a64a';
      g.fillRect(8, 8, 20, 26);
      break;
    }
    case 'bandage': {
      bg(g, '#e9e4d6', '#c9c4b6');
      // 붕대 감은 팔
      g.fillStyle = '#f6f2ea';
      g.fillRect(20, 40, 88, 22);
      g.strokeStyle = '#c9c0b0';
      for (let x = 22; x < 108; x += 6) {
        g.beginPath();
        g.moveTo(x, 40);
        g.lineTo(x + 4, 62);
        g.stroke();
      }
      g.fillStyle = '#e9c4a6';
      g.beginPath();
      g.ellipse(112, 51, 9, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.font = '7px Arial';
      g.fillStyle = '#555';
      g.fillText('DAY 1', 8, 12);
      break;
    }
    case 'healed': {
      bg(g, '#e9e4d6', '#c9c4b6');
      g.fillStyle = '#e9c4a6';
      g.fillRect(20, 40, 88, 22);
      g.beginPath();
      g.ellipse(112, 51, 9, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(24, 44, 80, 4);
      g.font = '7px Arial';
      g.fillStyle = '#555';
      g.fillText('DAY 28', 8, 12);
      g.fillStyle = '#2f5d55';
      g.fillText('NO SCARRING', 70, 80);
      break;
    }
    case 'hoppy_wave':
    case 'hhh_title': {
      bg(g, '#ffe8a8', '#f9c8d8');
      for (let k = 0; k < 12; k++) {
        g.fillStyle = ['#ef8fb0', '#8fc8ef', '#efd88f'][k % 3];
        g.beginPath();
        g.arc((k * 37) % 128, (k * 53) % 96, 3, 0, Math.PI * 2);
        g.fill();
      }
      const bob = Math.sin(t * 6) * 2;
      drawHoppy(g, scene === 'hhh_title' ? 34 : 64, 52 + bob, 16);
      if (scene === 'hhh_title') {
        g.font = 'bold 11px Arial Black, Arial';
        g.fillStyle = '#d0406a';
        g.fillText("HOPPY'S", 62, 34);
        g.fillStyle = '#3a7ac0';
        g.fillText('HEALTH HOUR', 56, 50);
      }
      break;
    }
    case 'lab': {
      bg(g, '#d9dcd6', '#9aa09c');
      g.fillStyle = '#a4abac';
      g.fillRect(10, 60, 108, 8);
      g.fillStyle = '#7a8a8a';
      g.fillRect(14, 68, 6, 28);
      g.fillRect(108, 68, 6, 28);
      // 유리 상자
      g.strokeStyle = '#eef';
      g.strokeRect(40, 36, 48, 24);
      mouse(g, 60, 52, 5, t);
      g.fillStyle = '#9aa09c';
      g.fillRect(88, 10, 34, 30);
      g.font = '6px monospace';
      g.fillStyle = '#222';
      g.fillText('DRI-85-014', 46, 32);
      break;
    }
    case 'mouse5':
      bg(g, '#d9dcd6', '#b9bcb6');
      mouse(g, 50, 60, 5, t);
      break;
    case 'mouse6':
      bg(g, '#d9dcd6', '#b9bcb6');
      mouse(g, 50, 60, 6, t);
      g.font = '6px monospace';
      g.fillStyle = '#222';
      g.fillText('+72H', 8, 10);
      break;
    case 'device': {
      bg(g, '#30383a', '#151a1c');
      // 재지시기 화면 확대
      g.fillStyle = '#9a9e9a';
      g.fillRect(24, 22, 80, 54);
      g.fillStyle = '#061008';
      g.fillRect(32, 28, 64, 36);
      g.fillStyle = '#5dff7d';
      g.font = '6px monospace';
      g.fillText('INSTRUCT:', 36, 36);
      const txt = 'IT ALWAYS GREW THIS WAY';
      g.fillText(txt.slice(0, Math.floor(t * 8)).slice(0, 12), 36, 46);
      g.fillText(txt.slice(12, Math.max(12, Math.floor(t * 8))), 36, 54);
      g.fillStyle = '#4fa86a';
      g.fillRect(56, 70, 16, 4);
      break;
    }
    case 'hale': {
      bg(g, '#3a4044', '#1a1e20');
      person(g, 64, 42, 1.4, { hair: '#4a4038', hairStyle: 'short', glasses: true, mouth: Math.sin(t * 10) > 0.3 ? 1 : 0 });
      g.fillStyle = '#e8e4d8';
      g.fillRect(70, 62, 12, 3);
      break;
    }
    case 'room_child': {
      bg(g, '#a9c3d6', '#7f9fb6');
      g.fillStyle = '#e9ecea';
      g.fillRect(70, 56, 58, 20);
      g.fillStyle = '#b9a07c';
      g.fillRect(0, 76, 128, 20);
      // 침대 위의 아이 (뒷모습, 멀리)
      person(g, 96, 46, 0.8, { coat: '#a9c7dc', hair: '#5a3a28', hairStyle: 'kid' });
      // 간호사의 어깨 (앞, 흐릿하게)
      g.fillStyle = 'rgba(233,236,234,0.9)';
      g.beginPath();
      g.ellipse(26, 96, 30, 30, 0, Math.PI, 0);
      g.fill();
      break;
    }
    case 'child': {
      bg(g, '#a9c3d6', '#8fa9bc');
      person(g, 64, 46, 1.6, { coat: '#a9c7dc', hair: '#5a3a28', hairStyle: 'kid', skin: '#e2b49a', mouth: Math.sin(t * 9) > 0.2 ? 1 : 0 });
      // 아이의 얼굴은 조금 창백하다 (병)
      g.fillStyle = 'rgba(200,200,220,0.1)';
      g.fillRect(40, 20, 48, 40);
      break;
    }
    case 'studio_kid': {
      bg(g, '#ffe8a8', '#f3d0e0');
      // 모양 공방 기계
      g.fillStyle = '#e6e6e0';
      g.fillRect(14, 30, 70, 50);
      g.fillStyle = '#ec9fb6';
      g.fillRect(14, 26, 70, 6);
      g.globalAlpha = 0.7;
      drawHoppy(g, 49, 60, 10, Math.floor(t * 2) % 2 === 1);
      g.globalAlpha = 1;
      person(g, 104, 54, 0.9, { coat: '#a9c7dc', hair: '#3a2a20', hairStyle: 'kid' });
      break;
    }
    case 'studio_pick': {
      bg(g, '#ffe8a8', '#f3d0e0');
      // 아이가 고른 모양: 키가 큰 인형
      g.fillStyle = '#e6e6e0';
      g.fillRect(30, 14, 68, 70);
      g.save();
      g.translate(64, 50);
      g.scale(1, 1.4);
      drawHoppy(g, 0, 0, 12);
      g.restore();
      g.font = '6px monospace';
      g.fillStyle = '#3a7ac0';
      g.fillText('HEIGHT +', 34, 20);
      g.fillText('SLEEP -', 34, 78);
      break;
    }
    case 'paper': {
      bg(g, '#f1efe6', '#d9d6cc');
      g.font = '6px monospace';
      g.fillStyle = '#222';
      const lines = ['SHAPE SELECTION RECORD', 'SUBJ: 12   AGE: 8', 'HEIGHT: +', 'SLEEP: -', 'CONSENT: CHILD', 'FWD: APPX C-7'];
      lines.slice(0, Math.floor(t * 2.2) + 1).forEach((l, i) => g.fillText(l, 12, 14 + i * 11));
      g.strokeStyle = '#c33';
      g.strokeRect(70, 64, 46, 14);
      g.fillStyle = '#c33';
      g.fillText('RECORDED', 74, 68);
      break;
    }
    case 'black':
    default: {
      g.fillStyle = '#050505';
      g.fillRect(0, 0, 128, 96);
      if (r() < 0.02) {
        g.fillStyle = '#222';
        g.fillRect(0, r() * 96, 128, 2);
      }
      break;
    }
    case 'quiz': {
      bg(g, '#ffe8a8', '#f9c8d8');
      drawHoppy(g, 30, 56, 14);
      g.fillStyle = '#fff';
      g.fillRect(56, 14, 66, 64);
      g.strokeStyle = '#ec9fb6';
      g.strokeRect(56, 14, 66, 64);
      g.font = 'bold 18px Arial Black, Arial';
      g.fillStyle = '#d0406a';
      g.fillText('?', 82, 54);
      break;
    }
    case 'quiz_right': {
      bg(g, '#c8f0c8', '#a8e0b8');
      drawHoppy(g, 64, 54, 18);
      g.font = 'bold 10px Arial Black, Arial';
      g.fillStyle = '#2a7a3a';
      g.fillText('RIGHT!', 44, 14);
      break;
    }
    case 'quiz_wrong': {
      bg(g, '#f0b0b0', '#c87070');
      g.save();
      g.translate(64, 54);
      g.rotate(Math.sin(t * 30) * 0.1);
      drawHoppy(g, 0, 0, 18, true);
      g.restore();
      g.font = 'bold 10px Arial Black, Arial';
      g.fillStyle = '#7a1a1a';
      g.fillText('WRONG!', 44, 14);
      break;
    }
    case 'quiz_impossible': {
      bg(g, '#f0b0b0', '#3a0a0a');
      g.save();
      g.translate(64, 54);
      g.scale(1 + Math.sin(t * 17) * 0.2, 1 - Math.sin(t * 13) * 0.2);
      drawHoppy(g, 0, 0, 18, true);
      g.restore();
      g.font = 'bold 10px Arial Black, Arial';
      g.fillStyle = '#fff';
      g.fillText('WRONG! WRONG!', 22, 14 + Math.sin(t * 20) * 3);
      break;
    }
  }
}
