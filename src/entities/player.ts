import * as THREE from 'three';
import type { Input } from '../core/input';
import type { Level, Room } from '../world/level';
import { mat } from '../world/materials';
import { armSkinCanvas } from '../world/textures';
import { clamp, damp } from '../core/util';
import type { FloorMat } from '../audio/sfx';

/**
 * 1인칭 구급대원.
 * 손전등은 어깨에 달린 구급용 라이트(늘 켤 수 있다), 오른손에는 재지시기, 왼손은 비워 둔다 (우나의 손).
 */
export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  crouch = false;
  crouchK = 0;
  stamina = 1;
  private staminaLock = 0;
  sprinting = false;
  mode: 'walk' | 'locked' | 'hidden' = 'walk';
  holding = false;
  speedMul = 1;
  private stepAcc = 0;
  private bobPhase = 0;
  bobAmt = 0;
  sens = 1;
  /** 카메라 강제 (컷신): 위치와 바라볼 점 */
  camOverride: { pos: THREE.Vector3; look: THREE.Vector3; k: number; fov?: number } | null = null;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  shake = 0;
  onStep: ((mat: FloorMat, loud: number, sprint: boolean, crouch: boolean) => void) | null = null;
  hideAt: THREE.Vector3 | null = null;
  hideYaw = 0;
  /** 이번 프레임 이동 거리 */
  moved = 0;
  /** 걷기 소리 재질을 결정하는 함수 */
  floorAt: ((x: number, z: number) => FloorMat) | null = null;
  room: Room | null = null;
  lookLimit: { yaw: number; range: number; down?: number } | null = null;

  get eyeHeight() {
    const stand = 1.62;
    const low = 0.78;
    return stand + (low - stand) * this.crouchK;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** 시선 방향 (피치 포함) */
  get look() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  teleport(p: THREE.Vector3, yaw?: number) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = 0;
  }

  update(dt: number, input: Input, level: Level) {
    // 시점
    if (this.mode !== 'locked' || this.lookLimit) {
      this.yaw -= input.mouseDX * 0.0022 * this.sens;
      this.pitch -= input.mouseDY * 0.0022 * this.sens;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.lookLimit) {
        const d = Math.atan2(Math.sin(this.yaw - this.lookLimit.yaw), Math.cos(this.yaw - this.lookLimit.yaw));
        const c = clamp(d, -this.lookLimit.range, this.lookLimit.range);
        this.yaw = this.lookLimit.yaw + c;
        this.pitch = clamp(this.pitch, this.lookLimit.down ?? -0.6, 0.5);
      }
    }
    this.room = level.roomAt(this.pos.x, this.pos.z);
    const lowRoom = !!this.room?.low;

    let wish = new THREE.Vector3();
    if (this.mode === 'walk') {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) wish.add(this.forward);
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) wish.sub(this.forward);
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) wish.add(this.right);
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) wish.sub(this.right);
      if (input.wasPressed('KeyC')) this.crouch = !this.crouch;
      const ctrl = input.isDown('ControlLeft') || input.isDown('ControlRight');
      if (wish.lengthSq() > 0) wish.normalize();
      const wantSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && wish.lengthSq() > 0 && !this.holding && this.staminaLock <= 0;
      const crouched = this.crouch || ctrl || lowRoom;
      this.sprinting = wantSprint && !crouched && this.stamina > 0.02;
      const speed = (crouched ? 1.15 : this.sprinting ? 3.9 : this.holding ? 1.9 : 2.25) * this.speedMul;
      wish.multiplyScalar(speed);
      this.crouchK = damp(this.crouchK, crouched ? 1 : 0, 10, dt);
    } else {
      this.sprinting = false;
      wish.set(0, 0, 0);
    }
    // 숨 (달리기 체력)
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt / 5.5);
      if (this.stamina <= 0) this.staminaLock = 2.2;
    } else {
      this.staminaLock -= dt;
      this.stamina = Math.min(1, this.stamina + dt / (this.vel.lengthSq() > 0.1 ? 9 : 5));
    }
    // 가속
    const accel = wish.lengthSq() > 0 ? 12 : 9;
    this.vel.x = damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z, accel, dt);
    const before = this.pos.clone();
    if (this.mode === 'walk') {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      level.collide(this.pos, 0.28, this.crouchK > 0.5 || lowRoom, this.pos.y);
      const r = level.roomAt(this.pos.x, this.pos.z);
      if (r) this.pos.y = damp(this.pos.y, r.y, 20, dt);
    }
    this.moved = before.distanceTo(this.pos);
    const hspeed = this.moved / Math.max(dt, 1e-4);

    // 발소리
    if (this.mode === 'walk' && hspeed > 0.3) {
      const stride = this.sprinting ? 0.85 : this.crouchK > 0.5 ? 0.55 : 0.72;
      this.stepAcc += this.moved;
      this.bobPhase += (this.moved / stride) * Math.PI;
      if (this.stepAcc >= stride) {
        this.stepAcc -= stride;
        const m = this.floorAt ? this.floorAt(this.pos.x, this.pos.z) : (this.room?.step ?? 'lino');
        const loud = this.sprinting ? 1.25 : this.crouchK > 0.5 ? 0.35 : 0.8;
        this.onStep?.(m, loud, this.sprinting, this.crouchK > 0.5);
      }
      this.bobAmt = damp(this.bobAmt, this.sprinting ? 1 : 0.55, 6, dt);
    } else {
      this.bobAmt = damp(this.bobAmt, 0, 6, dt);
      this.stepAcc = Math.min(this.stepAcc, 0.4);
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  applyCamera(cam: THREE.PerspectiveCamera, dt: number, t: number) {
    let targetPos: THREE.Vector3;
    let targetQuat: THREE.Quaternion;
    if (this.camOverride) {
      targetPos = this.camOverride.pos.clone();
      const m = new THREE.Matrix4().lookAt(targetPos, this.camOverride.look, new THREE.Vector3(0, 1, 0));
      targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
      const k = 1 - Math.exp(-dt * this.camOverride.k);
      this.camPos.lerp(targetPos, k);
      this.camQuat.slerp(targetQuat, k);
    } else {
      const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmt;
      const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmt;
      const r = this.right;
      if (this.mode === 'hidden' && this.hideAt) targetPos = this.hideAt.clone();
      else targetPos = new THREE.Vector3(this.pos.x + r.x * bobX, this.pos.y + this.eyeHeight + bobY, this.pos.z + r.z * bobX);
      const sh = this.shake;
      const e = new THREE.Euler(this.pitch + (Math.random() - 0.5) * sh * 0.04, this.yaw + (Math.random() - 0.5) * sh * 0.04, this.roll + Math.cos(this.bobPhase) * 0.008 * this.bobAmt, 'YXZ');
      targetQuat = new THREE.Quaternion().setFromEuler(e);
      this.camPos.copy(targetPos);
      this.camQuat.copy(targetQuat);
    }
    cam.position.copy(this.camPos);
    cam.quaternion.copy(this.camQuat);
    const fov = this.camOverride?.fov ?? (this.sprinting ? 76 : 70);
    cam.fov = damp(cam.fov, fov, 4, dt);
    cam.updateProjectionMatrix();
    void t;
  }

  /** 컷신이 끝나면 카메라 방향을 이어받는다 */
  syncFromCamera(cam: THREE.Camera) {
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.camPos.copy(cam.position);
    this.camQuat.copy(cam.quaternion);
  }

  snapCamera(cam: THREE.Camera) {
    this.camPos.copy(cam.position);
    this.camQuat.copy(cam.quaternion);
  }
}

// ───────────────────────────── 1인칭 손 ─────────────────────────────

export type ToolKind = 'none' | 'device' | 'stetho';
export type ArmPose = 'idle' | 'hold' | 'inspect' | 'reach' | 'hidden';

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  private left = new THREE.Group();
  private right = new THREE.Group();
  private device = new THREE.Group();
  private stetho = new THREE.Group();
  private amb: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private handLight: THREE.PointLight;
  private skin = armSkinCanvas();
  readonly screen: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; g: CanvasRenderingContext2D };
  pose: ArmPose = 'idle';
  tool: ToolKind = 'none';
  private poseK = { lx: -0.32, ly: -0.42, lz: -0.42, rx: 0, ry: 0, rz: 0 };
  private raise = 0;
  private toolRaise = 0;
  scanAim = 0;
  /** 'cab': 구급차 안 (계기판의 주황 불빛이 아래에서) */
  env: 'normal' | 'cab' = 'normal';
  private t = 0;

  constructor() {
    this.scene.add(this.root);
    this.amb = new THREE.HemisphereLight(0xc8d0d8, 0x2a2420, 0.5);
    this.scene.add(this.amb);
    this.key = new THREE.DirectionalLight(0xfff0e0, 0.8);
    this.key.position.set(0.3, 1, 0.6);
    this.scene.add(this.key);
    this.handLight = new THREE.PointLight(0xfff0d8, 0, 1.2, 2);
    this.handLight.position.set(0.12, -0.05, -0.15);
    this.root.add(this.handLight);
    const M = (k: string) => mat(k, false).mat;

    // 왼팔: 걷어 올린 남색 소매, 이식된 피부의 팔뚝, 손
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.14, 10), M('navy'));
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = 0.2;
    this.left.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 6, 12), M('navy'));
    cuff.position.z = 0.13;
    this.left.add(cuff);
    this.skin.tex.center.set(0.5, 0.5);
    this.skin.tex.rotation = Math.PI / 2;
    // 팔뚝: 손목에서 가늘고 팔꿈치 쪽으로 굵어진다, 살짝 납작하다
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const rad = 0.03 + u * 0.011 + Math.sin(u * Math.PI) * 0.005 + (u > 0.55 ? Math.sin(((u - 0.55) / 0.45) * Math.PI) * 0.004 : 0);
      prof.push(new THREE.Vector2(rad, -0.16 + u * 0.33));
    }
    const foreGeo = new THREE.LatheGeometry(prof, 16);
    foreGeo.scale(1, 1, 0.82);
    foreGeo.rotateX(Math.PI / 2);
    const fore = new THREE.Mesh(foreGeo, new THREE.MeshStandardMaterial({ map: this.skin.tex, roughness: 0.62 }));
    fore.position.z = 0.0;
    this.left.add(fore);
    const handL = this.makeHand(-1);
    handL.position.z = -0.2;
    this.left.add(handL);
    this.root.add(this.left);

    // 오른손 + 재지시기
    const handR = this.makeHand(1);
    handR.rotation.x = -0.2;
    this.right.add(handR);
    const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), M('navy'));
    sleeveR.rotation.x = Math.PI / 2;
    sleeveR.position.z = 0.2;
    this.right.add(sleeveR);
    // 기기 본체 (회색 플라스틱, 80년대 의료 기기)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.17), M('plastic_grey'));
    body.position.set(0, 0.035, -0.07);
    this.device.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), M('plastic_dark'));
    grip.position.set(0, -0.01, 0.0);
    grip.rotation.x = 0.3;
    this.device.add(grip);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.06, 8), M('chrome'));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.035, -0.18);
    this.device.add(nose);
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.04), new THREE.MeshStandardMaterial({ color: 0x4fa86a, roughness: 0.5 }));
    card.position.set(0.0, 0.06, 0.03);
    this.device.add(card);
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 64;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.screen = { canvas: c, tex, g };
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.042), new THREE.MeshBasicMaterial({ map: tex }));
    scr.rotation.x = -Math.PI / 2 + 0.55;
    scr.position.set(0, 0.06, -0.02);
    this.device.add(scr);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), M('green_led'));
    led.position.set(0.028, 0.06, -0.12);
    this.device.add(led);
    this.device.position.set(0, 0.0, -0.05);
    this.right.add(this.device);
    // 청진기 (가슴 판)
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), M('chrome'));
    disk.rotation.x = Math.PI / 2;
    disk.position.set(0, 0.02, -0.1);
    this.stetho.add(disk);
    const tube = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 16, Math.PI), M('rubber'));
    tube.position.set(0.05, 0.02, -0.02);
    tube.rotation.y = Math.PI / 2;
    this.stetho.add(tube);
    this.right.add(this.stetho);
    this.root.add(this.right);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).frustumCulled = false;
        (o as THREE.Mesh).renderOrder = 10;
      }
    });
    this.drawScreen(['SN-RI 3', 'READY'], 0);
  }

  private makeHand(side: number) {
    const g = new THREE.Group();
    const useGlove = side > 0;
    const m = useGlove ? new THREE.MeshStandardMaterial({ color: 0x3b4a7a, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xe0b49a, roughness: 0.6 });
    // 손바닥: 손목 쪽이 좁은 사다리꼴
    const palmGeo = new THREE.BoxGeometry(0.075, 0.024, 0.085, 2, 1, 2);
    const pp = palmGeo.getAttribute('position');
    for (let i = 0; i < pp.count; i++) {
      const z = pp.getZ(i);
      pp.setX(i, pp.getX(i) * (z > 0 ? 0.82 : 1));
      if (pp.getY(i) > 0) pp.setY(i, pp.getY(i) + (Math.abs(pp.getX(i)) < 0.02 ? 0.004 : 0));
    }
    palmGeo.computeVertexNormals();
    const palm = new THREE.Mesh(palmGeo, m);
    g.add(palm);
    // 손가락: 마디 두 개, 살짝 굽었다
    const lens = [0.042, 0.048, 0.045, 0.036];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group();
      base.position.set(-0.028 + i * 0.019, -0.002, -0.043);
      base.rotation.x = useGlove ? 0.9 : 0.18 + i * 0.05;
      base.rotation.y = (i - 1.5) * -0.05;
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, lens[i] * 0.55), m);
      p1.position.z = -lens[i] * 0.27;
      base.add(p1);
      const j = new THREE.Group();
      j.position.z = -lens[i] * 0.55;
      j.rotation.x = useGlove ? 0.6 : 0.25;
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, lens[i] * 0.5), m);
      p2.position.z = -lens[i] * 0.24;
      j.add(p2);
      base.add(j);
      g.add(base);
    }
    const thumb = new THREE.Group();
    thumb.position.set(side * -0.04, -0.004, -0.005);
    thumb.rotation.set(0.2, side * 0.75, side * -0.3);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.018, 0.032), m);
    t1.position.z = -0.016;
    thumb.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.026), m);
    t2.position.set(0, 0, -0.042);
    t2.rotation.x = 0.2;
    thumb.add(t2);
    g.add(thumb);
    return g;
  }

  /** 기기 화면 (초록 단색 LCD) */
  drawScreen(lines: string[], progress: number) {
    const { g, tex } = this.screen;
    g.fillStyle = '#061008';
    g.fillRect(0, 0, 96, 64);
    g.fillStyle = '#5dff7d';
    g.font = 'bold 9px monospace';
    g.textBaseline = 'top';
    lines.slice(0, 4).forEach((l, i) => g.fillText(l.slice(0, 15), 4, 4 + i * 11));
    if (progress > 0 && progress < 1) {
      g.strokeStyle = '#5dff7d';
      g.strokeRect(4, 52, 88, 7);
      g.fillRect(5, 53, 86 * progress, 5);
    }
    // 화면 줄무늬
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 64; y += 2) g.fillRect(0, y, 96, 1);
    tex.needsUpdate = true;
  }

  setSkin(encroach: number) {
    this.skin.set(encroach);
  }

  update(dt: number, cam: THREE.Camera, p: Player, ambient: number, flashOn: boolean) {
    this.t += dt;
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    if (this.env === 'cab') {
      // 계기판은 무릎 위 팔보다 앞쪽 위에 있다
      this.amb.color.setHex(0xa8a8b4);
      this.amb.intensity = 0.42;
      this.key.color.setHex(0xffa060);
      this.key.position.copy(cam.position).add(new THREE.Vector3(-0.3, 0.4, -1).applyQuaternion(cam.quaternion));
      this.key.target.position.copy(cam.position);
      this.key.target.updateMatrixWorld();
      this.key.intensity = 2.4;
    } else {
      this.amb.color.setHex(0xc8d0d8);
      this.amb.intensity = 0.25 + ambient * 0.6;
      this.key.color.setHex(0xfff0e0);
      this.key.position.copy(cam.position).add(new THREE.Vector3(0.3, 1, 0.6));
      this.key.target.position.copy(cam.position);
      this.key.target.updateMatrixWorld();
      this.key.intensity = 0.15 + ambient * 0.5;
    }
    this.handLight.intensity = flashOn ? 0.6 : 0;
    const bob = Math.sin(this.t * 1.6) * 0.004;
    const sway = p.bobAmt;
    // 왼팔 자세
    const pose = this.pose;
    const target =
      pose === 'inspect'
        ? { lx: -0.1, ly: -0.15, lz: -0.3, rx: 0.51, ry: -0.56, rz: -0.44 }
        : pose === 'hold'
          ? { lx: -0.36, ly: -0.36, lz: -0.3, rx: 0.5, ry: 0.5, rz: 0.3 }
          : pose === 'reach'
            ? { lx: -0.12, ly: -0.2, lz: -0.42, rx: 0.1, ry: 0.1, rz: 0 }
            : pose === 'hidden'
              ? { lx: -0.32, ly: -0.8, lz: -0.4, rx: 0.4, ry: 0.2, rz: 0.1 }
              : { lx: -0.32, ly: -0.8, lz: -0.4, rx: 0.4, ry: 0.2, rz: 0.1 };
    for (const k of Object.keys(target) as (keyof typeof target)[]) this.poseK[k] = damp(this.poseK[k], target[k], 9, dt);
    this.left.position.set(this.poseK.lx + Math.cos(p['bobAmt'] * 0 + this.t * 5) * 0.004 * sway, this.poseK.ly + bob, this.poseK.lz);
    this.left.rotation.set(this.poseK.rx, this.poseK.ry, this.poseK.rz);
    // 오른손 (도구)
    const showTool = this.tool !== 'none';
    this.toolRaise = damp(this.toolRaise, showTool ? 1 : 0, 8, dt);
    this.raise = damp(this.raise, this.scanAim, 10, dt);
    this.device.visible = this.tool === 'device';
    this.stetho.visible = this.tool === 'stetho';
    this.right.position.set(0.24 - this.raise * 0.1, -0.5 + this.toolRaise * 0.22 + this.raise * 0.08 + bob, -0.4 - this.raise * 0.08);
    this.right.rotation.set(0.15 + this.raise * 0.1, -0.12 + this.raise * 0.1, 0);
    this.right.visible = this.toolRaise > 0.02;
  }
}
