import * as THREE from 'three';

/**
 * 후처리 한 장짜리 셰이더.
 * 저해상도 렌더 타깃을 최근접 확대해 픽셀 질감을 만들고, 색수차·비네트·필름 그레인·
 * 색조 보정·바이어 디더링(16비트 시절 색 띠)·페이드를 한 번에 처리한다.
 */
export class PostPass {
  readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new THREE.Vector2(640, 360) },
        uTime: { value: 0 },
        uGrain: { value: 0.06 },
        uVignette: { value: 0.55 },
        uCA: { value: 0.012 },
        uFade: { value: 0 },
        uWhite: { value: 0 },
        uPulse: { value: 0 },
        uDesat: { value: 0.12 },
        uExposure: { value: 1.0 },
        uLevels: { value: 40.0 },
        uWarp: { value: 0 },
        uRed: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uRes;
        uniform float uTime, uGrain, uVignette, uCA, uFade, uWhite, uPulse, uDesat, uExposure, uLevels, uWarp, uRed;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        float bayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          float x = q.x, y = q.y;
          float v = 0.0;
          if (y < 0.5) v = x < 0.5 ? 0.0 : x < 1.5 ? 8.0 : x < 2.5 ? 2.0 : 10.0;
          else if (y < 1.5) v = x < 0.5 ? 12.0 : x < 1.5 ? 4.0 : x < 2.5 ? 14.0 : 6.0;
          else if (y < 2.5) v = x < 0.5 ? 3.0 : x < 1.5 ? 11.0 : x < 2.5 ? 1.0 : 9.0;
          else v = x < 0.5 ? 15.0 : x < 1.5 ? 7.0 : x < 2.5 ? 13.0 : 5.0;
          return v / 16.0 - 0.5;
        }

        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        vec3 toSRGB(vec3 c) {
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        void main() {
          vec2 uv = vUv;
          // 아주 약한 일렁임 (공간이 바뀌는 순간, 잔여체 근처)
          if (uWarp > 0.0) {
            uv.x += sin(uv.y * 23.0 + uTime * 3.1) * 0.004 * uWarp;
            uv.y += cos(uv.x * 19.0 + uTime * 2.3) * 0.004 * uWarp;
          }
          vec2 d = uv - 0.5;
          float r2 = dot(d, d);
          vec2 off = d * uCA * (0.4 + r2 * 2.0);
          vec3 col;
          col.r = texture2D(tDiffuse, uv + off).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - off).b;

          col *= uExposure;
          col = aces(col);
          col = toSRGB(col);

          // 색조: 그림자를 청록으로 들어 올리고, 채도를 살짝 뺀다
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(l), uDesat);
          col += vec3(0.012, 0.020, 0.024) * (1.0 - l);
          col = mix(col, col * vec3(1.25, 0.55, 0.5), uRed);

          // 비네트와 박동 (박동마다 어두워졌다 돌아온다)
          col *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(d) * 1.45);
          col *= 1.0 - uPulse;

          // 렌더 타깃 픽셀 단위의 그레인과 디더링
          vec2 px = floor(uv * uRes);
          float g = hash(px + fract(uTime * 13.37) * 97.0) - 0.5;
          col += g * uGrain;
          col = floor(col * uLevels + bayer4(px) + 0.5) / uLevels;

          col = mix(col, vec3(0.0), uFade);
          col = mix(col, vec3(1.0), uWhite);
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get u() {
    return this.material.uniforms;
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.Texture, w: number, h: number, time: number) {
    this.u.tDiffuse.value = input;
    (this.u.uRes.value as THREE.Vector2).set(w, h);
    this.u.uTime.value = time;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
