import * as THREE from 'three';
import { Engine } from '../core/engine';
import { buildChapter1 } from '../world/chapter1';
import { Lighting } from '../world/lights';
import { makeHoppy, makeRound, makeUna, setUnaFace } from '../entities/models';
import { unaFaceTex } from '../world/textures';

/**
 * 개발용 보기: ?viewer&x=&y=&z=&yaw=&pitch=&area=&flash=1
 * 헤드리스 크로미움 스크린샷으로 그래픽을 확인한다.
 */
export function runViewer(canvas: HTMLCanvasElement) {
  const q = new URLSearchParams(location.search);
  const engine = new Engine(canvas);
  if (q.get('scale')) engine.setRenderScale(Number(q.get('scale')));
  const world = buildChapter1();
  const scene = engine.scene;
  scene.add(world.level.root);
  const cam = engine.camera;
  scene.add(cam);
  const x = Number(q.get('x') ?? 0);
  const y = Number(q.get('y') ?? 1.6);
  const z = Number(q.get('z') ?? -2);
  const yaw = Number(q.get('yaw') ?? 0);
  const pitch = Number(q.get('pitch') ?? 0);
  cam.position.set(x, y, z);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(pitch, yaw, 0);
  const room = world.level.roomAt(x, z);
  const area = q.get('area') ?? room?.area ?? 'ground';
  for (const [k, g] of world.level.areas) g.visible = k === area;
  scene.fog = new THREE.FogExp2(room?.fogColor ?? 0x1a2228, room?.fogDensity ?? 0.04);
  scene.background = new THREE.Color(room?.fogColor ?? 0x1a2228);
  const light = new Lighting(scene, cam, world.level, null);
  light.initHalos();
  light.setFlash(q.get('flash') !== '0');
  // 캐릭터 미리 보기
  if (q.get('facetest')) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: unaFaceTex('smile') }));
    p.position.set(x + 0.5, y, z - 1);
    scene.add(p);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.18, Math.PI * 0.62), new THREE.MeshBasicMaterial({ map: unaFaceTex('smile') }));
    s2.position.set(x - 0.5, y, z - 1.2);
    scene.add(s2);
  }
  if (q.get('close')) {
    const kind = q.get('close');
    const rig = kind === 'una' ? makeUna() : kind === 'round' ? makeRound('J. KESSLER, PH.D.') : makeHoppy();
    if (kind === 'una' && q.get('face')) setUnaFace(rig, q.get('face') as 'smile');
    if (q.get('basicface') && rig.face) rig.face.material = new THREE.MeshBasicMaterial({ map: (rig.face.material as THREE.MeshStandardMaterial).map });
    if (q.get('red') && rig.face) rig.face.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    if (q.get('red')) console.log('face world', rig.face?.getWorldPosition(new THREE.Vector3()).toArray().join(','), rig.face?.parent?.name, rig.face?.visible);
    rig.root.position.set(x, room?.y ?? 0, z - Number(q.get('dist') ?? 1.2));
    rig.root.rotation.y = Number(q.get('rot') ?? 0);
    scene.add(rig.root);
  }
  if (q.get('chars')) {
    const una = makeUna();
    setUnaFace(una, 'smile');
    una.root.position.set(x - 0.8, room?.y ?? 0, z - 2.2);
    una.root.rotation.y = 0.3;
    scene.add(una.root);
    const r = makeRound('J. KESSLER, PH.D.');
    r.root.position.set(x + 0.4, room?.y ?? 0, z - 3.2);
    r.root.rotation.y = -0.2;
    scene.add(r.root);
    const h = makeHoppy();
    h.root.position.set(x + 2.0, room?.y ?? 0, z - 4.5);
    h.root.rotation.y = -0.5;
    scene.add(h.root);
  }
  let t = 0;
  const tick = () => {
    t += 1 / 60;
    light.update(1 / 60, area);
    engine.post.u.uPulse.value = 0;
    engine.render(1 / 60);
    requestAnimationFrame(tick);
  };
  tick();
  (window as unknown as { __ready: boolean }).__ready = true;
}
