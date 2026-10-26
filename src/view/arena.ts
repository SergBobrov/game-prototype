import * as THREE from 'three';
import { AH, AW } from '../sim/config';
import type { Obstacle } from '../sim/types';

const MAX_WAVES = 10;

const floorVert = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPos = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const floorFrag = /* glsl */ `
  uniform float uTime, uBeat, uDanger;
  uniform vec3 uColor, uColor2;
  uniform vec2 uPlayer, uSize;
  uniform vec4 uWaves[${MAX_WAVES}];
  varying vec2 vPos;

  float gridLine(vec2 p, float spacing, float width) {
    vec2 g = abs(fract(p / spacing + 0.5) - 0.5) * spacing;
    vec2 fw = fwidth(p) * 1.2;
    vec2 l = 1.0 - smoothstep(vec2(width), vec2(width) + fw, g);
    return max(l.x, l.y);
  }

  void main() {
    vec2 p = vPos;
    float rip = 0.0;
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      vec4 w = uWaves[i];
      float age = uTime - w.z;
      if (w.w <= 0.0 || age < 0.0 || age > 2.0) continue;
      vec2 d = vPos - w.xy;
      float dist = length(d);
      float radius = age * 22.0 * (0.6 + w.w * 0.4);
      float ring = exp(-pow((dist - radius) * 1.3, 2.0)) * w.w * exp(-age * 2.2);
      p += normalize(d + 1e-4) * ring * 0.9;
      rip += ring;
    }
    vec2 inside = step(abs(vPos), uSize);
    float inArena = inside.x * inside.y;
    float edge = min(uSize.x - abs(vPos.x), uSize.y - abs(vPos.y));

    float minor = gridLine(p, 1.0, 0.025);
    float major = gridLine(p, 4.0, 0.05);
    float pl = exp(-dot(vPos - uPlayer, vPos - uPlayer) / 40.0);

    vec3 base = vec3(0.012, 0.016, 0.035);
    vec3 col = base;
    float pulse = 0.75 + 0.25 * uBeat;
    col += uColor * minor * (0.035 + 0.09 * pl) * inArena;
    col += uColor * major * (0.11 + 0.22 * pl) * pulse * inArena;
    col += uColor2 * rip * 0.55;
    col += uColor * pl * 0.015;
    // glowing border band just inside the walls
    col += uColor2 * smoothstep(0.6, 0.0, edge) * inArena * (0.18 + 0.08 * sin(uTime * 3.0));
    // outside: faint, fading grid
    float outside = 1.0 - inArena;
    float fade = exp(-max(0.0, -edge) * 0.08);
    col += uColor * major * 0.05 * outside * fade;
    col = mix(col, col + vec3(0.25, 0.0, 0.03) * (0.5 + 0.5 * sin(uTime * 6.0)), uDanger * inArena * 0.35);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const wallFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    float lines = step(0.92, fract(vUv.x * 40.0 - uTime * 0.6)) * 0.4;
    float scan = smoothstep(0.02, 0.0, abs(fract(h - uTime * 0.35) - 0.5) - 0.48);
    float a = (1.0 - h) * 0.22 + lines * (1.0 - h) * 0.5 + scan * 0.25;
    gl_FragColor = vec4(uColor * (0.55 + scan * 1.2), a * (1.0 - h * 0.8));
  }
`;

const wallVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export class Arena {
  readonly group = new THREE.Group();
  private floorMat: THREE.ShaderMaterial;
  private wallMat: THREE.ShaderMaterial;
  private waves: THREE.Vector4[] = [];
  private waveIdx = 0;
  private obstacleGroup = new THREE.Group();
  readonly color = new THREE.Color();
  readonly color2 = new THREE.Color();

  constructor() {
    for (let i = 0; i < MAX_WAVES; i++) this.waves.push(new THREE.Vector4(0, 0, -99, 0));
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uDanger: { value: 0 },
        uColor: { value: this.color },
        uColor2: { value: this.color2 },
        uPlayer: { value: new THREE.Vector2() },
        uSize: { value: new THREE.Vector2(AW, AH) },
        uWaves: { value: this.waves },
      },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // A shadow-catcher plane on top of the shader floor, so units cast soft shadows on the grid.
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(AW * 2, AH * 2), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.receiveShadow = true;
    this.group.add(shadow);

    this.wallMat = new THREE.ShaderMaterial({
      vertexShader: wallVert,
      fragmentShader: wallFrag,
      uniforms: { uTime: { value: 0 }, uColor: { value: this.color2 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const H = 1.3;
    const walls: [number, number, number, number][] = [
      [0, -AH, AW * 2, 0],
      [0, AH, AW * 2, 0],
      [-AW, 0, AH * 2, Math.PI / 2],
      [AW, 0, AH * 2, Math.PI / 2],
    ];
    for (const [x, z, len, rot] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), this.wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = rot;
      this.group.add(m);
    }
    this.group.add(this.obstacleGroup);
    this.setSector(0);
  }

  setSector(i: number): void {
    const palettes: [number, number][] = [
      [0x1a8cff, 0x22e6ff],
      [0xff7a1a, 0xffc04d],
      [0xb04dff, 0xff3df2],
    ];
    const [a, b] = palettes[i % palettes.length];
    this.color.setHex(a);
    this.color2.setHex(b);
  }

  setObstacles(obs: Obstacle[]): void {
    this.obstacleGroup.clear();
    for (const o of obs) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(o.r * 0.92, o.r, o.h, 6, 1),
        new THREE.MeshStandardMaterial({ color: 0x0c1224, metalness: 0.7, roughness: 0.35, flatShading: true }),
      );
      body.position.y = o.h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const bandMat = new THREE.MeshBasicMaterial({ color: this.color2.clone().multiplyScalar(0.9) });
      for (let k = 1; k <= 3; k++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.97, 0.05, 4, 6), bandMat);
        band.rotation.x = Math.PI / 2;
        band.rotation.z = Math.PI / 6;
        band.position.y = (o.h * k) / 4;
        g.add(band);
      }
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(o.r * 0.28, 0), new THREE.MeshBasicMaterial({ color: this.color2.clone().multiplyScalar(1.6) }));
      cap.position.y = o.h + 0.7;
      cap.userData.spin = true;
      g.add(cap);
      g.position.set(o.x, 0, o.z);
      this.obstacleGroup.add(g);
    }
  }

  /** Floor shockwave. strength ~0.3 for hits, 1 for big explosions. */
  shock(x: number, z: number, time: number, strength: number): void {
    const w = this.waves[this.waveIdx++ % MAX_WAVES];
    w.set(x, z, time, strength);
  }

  update(time: number, px: number, pz: number, beat: number, danger: number): void {
    const u = this.floorMat.uniforms;
    u.uTime.value = time;
    u.uBeat.value = beat;
    u.uDanger.value = danger;
    u.uPlayer.value.set(px, pz);
    this.wallMat.uniforms.uTime.value = time;
    for (const g of this.obstacleGroup.children)
      for (const c of g.children)
        if (c.userData.spin) {
          c.rotation.y = time * 1.5;
          c.position.y = (g.children[0] as THREE.Mesh).position.y * 2 + 0.7 + Math.sin(time * 2 + g.position.x) * 0.15;
        }
  }
}
