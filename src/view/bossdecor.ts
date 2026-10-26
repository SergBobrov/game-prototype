import * as THREE from 'three';
import type { Enemy } from '../sim/types';

/** Extra one-off meshes that make bosses read as bosses: gyroscope rings, a hot heart, orbiting glitch cubes. */
export class BossDecor {
  readonly group = new THREE.Group();
  private core = new THREE.Group();
  private coreRings: THREE.Mesh[] = [];
  private coreHeart: THREE.Mesh;
  private zero = new THREE.Group();
  private zeroCubes: THREE.Mesh[] = [];
  private zeroEye: THREE.Mesh;
  private crest: THREE.Mesh;

  constructor() {
    this.coreHeart = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb020).multiplyScalar(4) }));
    this.core.add(this.coreHeart);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.2 + i * 0.55, 0.07, 6, 72),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? 0xff3df2 : 0xffc04d).multiplyScalar(2.2) }),
      );
      this.coreRings.push(ring);
      this.core.add(ring);
    }
    this.zeroEye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(5) }));
    this.zero.add(this.zeroEye);
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 === 0 ? 0xff3df2 : i % 3 === 1 ? 0x22e6ff : 0xffffff).multiplyScalar(2.5) }));
      this.zeroCubes.push(c);
      this.zero.add(c);
    }
    this.crest = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a6d).multiplyScalar(3) }));
    this.group.add(this.core, this.zero, this.crest);
  }

  sync(enemies: Enemy[], time: number): void {
    const core = enemies.find((e) => e.type === 'core');
    const zero = enemies.find((e) => e.type === 'zeroday');
    const head = enemies.find((e) => e.type === 'hydraHead');

    this.core.visible = !!core && core.spawnT <= 0;
    if (core) {
      this.core.position.set(core.x, 2.6, core.z);
      const speed = 1 + core.gen * 0.8;
      this.coreRings.forEach((r, i) => {
        r.rotation.set(time * (0.7 + i * 0.3) * speed, time * (0.5 - i * 0.4) * speed, i);
      });
      const pulse = 1 + Math.sin(time * (6 + core.gen * 4)) * 0.12;
      this.coreHeart.scale.setScalar(pulse * (core.flash > 0 ? 1.15 : 1));
    }

    this.zero.visible = !!zero && zero.spawnT <= 0;
    if (zero) {
      this.zero.position.set(zero.x, 1.8, zero.z);
      this.zeroCubes.forEach((c, i) => {
        const a = time * (1.5 + (i % 3) * 0.7) + (i / this.zeroCubes.length) * Math.PI * 2;
        const r = 2.6 + Math.sin(time * 3 + i) * 0.4 + zero.gen * 0.4;
        const glitch = Math.random() < 0.04 ? (Math.random() - 0.5) * 1.5 : 0;
        c.position.set(Math.cos(a) * r + glitch, Math.sin(time * 2 + i) * 0.8, Math.sin(a) * r);
        c.rotation.set(time * 2 + i, time * 3, 0);
      });
      this.zeroEye.scale.setScalar(1 + Math.sin(time * 12) * 0.15);
    }

    this.crest.visible = !!head && head.spawnT <= 0;
    if (head) {
      this.crest.position.set(head.x, 2.0 + Math.sin(time * 6) * 0.1, head.z);
      this.crest.rotation.set(0, time * 2, 0);
    }
  }
}
