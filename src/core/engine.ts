import * as THREE from 'three';
import { PostPass } from './post';

/**
 * 렌더러, 카메라, 저해상도 렌더 타깃, 후처리.
 * 장면은 renderScale 배율의 해상도로 그린 뒤 최근접 필터로 확대한다 (R.E.P.O.류의 픽셀 질감).
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly post = new PostPass();
  scene: THREE.Scene = new THREE.Scene();
  private rt: THREE.WebGLRenderTarget;
  /** 화면 대비 렌더 해상도 배율 (설정에서 바꿀 수 있다) */
  renderScale = 0.42;
  private time = 0;
  /** 장면 위에 덧그리는 1인칭 손 (깊이를 지운 뒤) */
  overlay: THREE.Scene | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 160);
    this.rt = this.makeTarget(640, 360);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private makeTarget(w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    return rt;
  }

  get targetSize() {
    return { w: this.rt.width, h: this.rt.height };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const rw = Math.max(320, Math.round(w * this.renderScale));
    const rh = Math.max(180, Math.round(h * this.renderScale));
    this.rt.setSize(rw, rh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setRenderScale(s: number) {
    this.renderScale = s;
    this.resize();
  }

  render(dt: number) {
    this.time += dt;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    if (this.overlay) {
      const fog = this.overlay.fog;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlay, this.camera);
      this.renderer.autoClear = true;
      void fog;
    }
    this.post.render(this.renderer, this.rt.texture, this.rt.width, this.rt.height, this.time);
  }
}
