import * as THREE from 'three';
import { AH, AW } from '../sim/config';

/** Follow camera with aim look-ahead and trauma-based shake. */
export class CameraRig {
  private pos = new THREE.Vector3(0, 30, 22);
  private look = new THREE.Vector3();
  trauma = 0;
  shakeScale = 1;
  zoom = 1;
  private tmp = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v * this.shakeScale);
  }

  update(px: number, pz: number, ax: number, az: number, dt: number, time: number, snap = false): void {
    const portrait = this.camera.aspect < 1;
    // Look a little towards the cursor, but stay inside the arena.
    let tx = px + (ax - px) * 0.18;
    let tz = pz + (az - pz) * 0.18;
    tx = Math.max(-AW * 0.55, Math.min(AW * 0.55, tx));
    tz = Math.max(-AH * 0.5, Math.min(AH * 0.6, tz));
    const height = (portrait ? 40 : 23) * this.zoom;
    const back = (portrait ? 20 : 14) * this.zoom;
    this.tmp.set(tx, height, tz + back);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.pos.lerp(this.tmp, k);
    this.look.lerp(this.tmp.set(tx, 0, tz), k);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(time * f + o) * Math.sin(time * f * 1.7 + o * 2);
    this.camera.position.set(this.pos.x + n(37, 1) * s * 1.2, this.pos.y + n(41, 2) * s * 0.8, this.pos.z + n(29, 3) * s * 1.2);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(n(23, 4) * s * 0.04);
  }
}
