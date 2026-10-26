import * as THREE from 'three';

/** Voxel shatter: killed enemies burst into glowing cubes that tumble and bounce on the floor. */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private max: number;
  private n = 0;
  private cursor = 0;
  private p: Float32Array;
  private v: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private d = new THREE.Object3D();
  private c = new THREE.Color();

  constructor(max = 900) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
    this.mesh.count = max;
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.d.matrix);
  }

  shatter(x: number, z: number, r: number, color: THREE.ColorRepresentation, count: number, force = 9): void {
    const base = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.n = Math.min(this.max, this.n + 1);
      const a = Math.random() * Math.PI * 2;
      const sp = force * (0.3 + Math.random());
      this.p[i * 3] = x + Math.cos(a) * r * 0.5;
      this.p[i * 3 + 1] = 0.6 + Math.random() * r;
      this.p[i * 3 + 2] = z + Math.sin(a) * r * 0.5;
      this.v[i * 3] = Math.cos(a) * sp;
      this.v[i * 3 + 1] = 4 + Math.random() * force;
      this.v[i * 3 + 2] = Math.sin(a) * sp;
      for (let j = 0; j < 3; j++) {
        this.rot[i * 3 + j] = Math.random() * 6;
        this.spin[i * 3 + j] = (Math.random() - 0.5) * 20;
      }
      this.life[i] = 1.2 + Math.random() * 1.2;
      this.size[i] = (0.1 + Math.random() * 0.22) * Math.max(0.7, r);
      this.c.copy(base).multiplyScalar(1.5 + Math.random() * 2.5);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const d = this.d;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] -= 26 * dt;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < this.size[i] / 2) {
        this.p[j + 1] = this.size[i] / 2;
        this.v[j + 1] *= -0.35;
        this.v[j] *= 0.7;
        this.v[j + 2] *= 0.7;
        this.spin[j] *= 0.6;
        this.spin[j + 2] *= 0.6;
      }
      for (let k = 0; k < 3; k++) this.rot[j + k] += this.spin[j + k] * dt;
      d.position.set(this.p[j], this.p[j + 1], this.p[j + 2]);
      d.rotation.set(this.rot[j], this.rot[j + 1], this.rot[j + 2]);
      d.scale.setScalar(this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 2) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
