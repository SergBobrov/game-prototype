// Style sample: procedural low-poly neon look for the 3D discussion. Not game logic.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function startDemo(root: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.Fog(0x05070f, 14, 30);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(7, 10, 11);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  scene.add(new THREE.HemisphereLight(0x6688ff, 0x110011, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  scene.add(sun);

  const N = 8;
  const at = (x: number, y: number) => new THREE.Vector3(x - (N - 1) / 2, 0, y - (N - 1) / 2);

  // Board: beveled tiles with glowing seams, a few voids and walls.
  const voids = new Set(['0,6', '0,7', '1,7', '7,0']);
  const walls = new Set(['3,2', '5,4', '2,5']);
  const tileGeo = new THREE.BoxGeometry(0.94, 0.3, 0.94);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.55, metalness: 0.4 });
  const tileMatAlt = new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 0.55, metalness: 0.4 });
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x1f6fff });
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (voids.has(`${x},${y}`)) continue;
      const t = new THREE.Mesh(tileGeo, (x + y) % 2 ? tileMat : tileMatAlt);
      t.position.copy(at(x, y)).setY(-0.15);
      t.receiveShadow = true;
      scene.add(t);
      const seam = new THREE.LineSegments(new THREE.EdgesGeometry(tileGeo), seamMat);
      seam.position.copy(t.position);
      seam.scale.setScalar(1.001);
      scene.add(seam);
      if (walls.has(`${x},${y}`)) {
        const w = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.38, 0),
          new THREE.MeshStandardMaterial({ color: 0x3a4466, roughness: 0.8, flatShading: true }),
        );
        w.position.copy(at(x, y)).setY(0.3);
        w.castShadow = true;
        scene.add(w);
      }
    }

  // Data nodes (buildings): towers with emissive windows.
  const nodes: [number, number, number][] = [
    [1, 4, 1.2],
    [3, 6, 0.9],
    [4, 5, 1.5],
    [6, 6, 1.0],
    [6, 3, 1.3],
    [2, 7, 0.8],
  ];
  for (const [x, y, h] of nodes) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, h, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.4, metalness: 0.6 }),
    );
    body.position.y = h / 2;
    body.castShadow = true;
    g.add(body);
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, h * 0.7, 0.64),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00e5ff, emissiveIntensity: 0.9, wireframe: true }),
    );
    win.position.y = h / 2;
    g.add(win);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2 }),
    );
    cap.position.y = h + 0.15;
    g.add(cap);
    g.position.copy(at(x, y));
    scene.add(g);
  }

  // Defender mechs: body + legs + weapon, each with its own accent color.
  const mechs: { g: THREE.Group; phase: number }[] = [];
  const mechSpecs: [number, number, number][] = [
    [2, 3, 0x37ff8b],
    [4, 3, 0xffc23d],
    [5, 5, 0x5aa9ff],
  ];
  for (const [x, y, color] of mechSpecs) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xc8d2e6, roughness: 0.35, metalness: 0.8, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 });
    const torso = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), metal);
    torso.scale.set(1, 0.8, 1);
    torso.position.y = 0.62;
    torso.castShadow = true;
    g.add(torso);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), accent);
    eye.position.set(0, 0.66, 0.24);
    g.add(eye);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.45, 6), metal);
      leg.position.set(0.16 * s, 0.22, 0);
      leg.rotation.z = 0.25 * s;
      leg.castShadow = true;
      g.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), accent);
      arm.position.set(0.33 * s, 0.62, 0.08);
      g.add(arm);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    g.position.copy(at(x, y));
    scene.add(g);
    mechs.push({ g, phase: Math.random() * 6 });
  }

  // Viruses: spiky pulsing icosahedrons.
  const viruses: { m: THREE.Mesh; phase: number }[] = [];
  for (const [x, y] of [
    [3, 1],
    [6, 1],
    [1, 2],
  ] as [number, number][]) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ color: 0xff2266, emissive: 0xff0044, emissiveIntensity: 0.8, flatShading: true }),
    );
    const spikes = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xff3377, wireframe: true }),
    );
    m.add(spikes);
    m.position.copy(at(x, y)).setY(0.5);
    m.castShadow = true;
    scene.add(m);
    viruses.push({ m, phase: Math.random() * 6 });
  }

  // Telegraphed attack: virus at (6,1) aims down at node (6,3).
  const from = at(6, 1).setY(0.5);
  const to = at(6, 3).setY(0.5);
  const arrow = new THREE.ArrowHelper(to.clone().sub(from).normalize(), from, from.distanceTo(to) - 0.3, 0xff2255, 0.3, 0.2);
  scene.add(arrow);
  const danger = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xff2255, transparent: true, opacity: 0.35 }),
  );
  danger.rotation.x = -Math.PI / 2;
  danger.position.copy(at(6, 3)).setY(0.01);
  scene.add(danger);

  // Floating data particles.
  const pg = new THREE.BufferGeometry();
  const P = 300;
  const pos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x3fa9ff, size: 0.04 }));
  scene.add(particles);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 60 : 45;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    for (const { g, phase } of mechs) g.position.y = Math.sin(t * 2 + phase) * 0.04;
    for (const { m, phase } of viruses) {
      m.rotation.y = t * 0.8 + phase;
      m.rotation.x = t * 0.5;
      m.scale.setScalar(1 + Math.sin(t * 4 + phase) * 0.08);
    }
    (danger.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 5) * 0.15;
    particles.rotation.y = t * 0.03;
    controls.update();
    composer.render();
  });
}
