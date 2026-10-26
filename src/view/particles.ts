import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(vColor * (1.0 + a * 2.0), a * vAlpha);
  }
`;

export interface BurstOpts {
  count: number;
  color: THREE.Color | number;
  speed: number;
  life: number;
  size: number;
  y?: number;
  spread?: number; // vertical spread factor
  gravity?: number;
  drag?: number;
  dirX?: number;
  dirZ?: number;
  cone?: number; // radians; with dir, emits in a cone
  jitterColor?: number;
}

/** CPU-simulated additive point sprites. One draw call for everything. */
export class Particles {
  readonly points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private baseSize: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private tmp = new THREE.Color();

  constructor(max: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  setScale(viewportHeight: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = viewportHeight * 0.9;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, gravity = 0, drag = 2): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alpha[i] = 1;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  burst(x: number, z: number, o: BurstOpts): void {
    const base = o.color instanceof THREE.Color ? o.color : this.tmp.setHex(o.color);
    const c = new THREE.Color();
    for (let k = 0; k < o.count; k++) {
      let a = Math.random() * Math.PI * 2;
      if (o.dirX !== undefined && o.dirZ !== undefined) a = Math.atan2(o.dirZ, o.dirX) + (Math.random() - 0.5) * (o.cone ?? 1);
      const sp = o.speed * (0.3 + Math.random() * 0.9);
      const vy = (Math.random() * 0.8 + 0.2) * o.speed * (o.spread ?? 0.6);
      c.copy(base);
      if (o.jitterColor) c.offsetHSL((Math.random() - 0.5) * o.jitterColor, 0, (Math.random() - 0.5) * 0.2);
      this.emit(
        x,
        o.y ?? 0.5,
        z,
        Math.cos(a) * sp,
        vy,
        Math.sin(a) * sp,
        c,
        o.size * (0.5 + Math.random() * 0.8),
        o.life * (0.5 + Math.random() * 0.7),
        o.gravity ?? 9,
        o.drag ?? 2.5,
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= k;
      this.vel[j + 2] *= k;
      this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05) {
        this.pos[j + 1] = 0.05;
        this.vel[j + 1] *= -0.4;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const g = this.geo.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aAlpha.needsUpdate = true;
  }
}
