import * as THREE from 'three';
import { ENEMIES } from '../sim/config';
import type { Enemy, EnemyType } from '../sim/types';

interface Kind {
  body: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
  /** Visual scale relative to collision radius. */
  scale: number;
  hover: number;
  spin: number;
  /** Rotate to face movement/aim. */
  face: boolean;
}

const MAX: Partial<Record<EnemyType, number>> = { swarmer: 320, splitter: 60, mine: 40, hydraSeg: 16 };

function bodyGeo(type: EnemyType): THREE.BufferGeometry {
  switch (type) {
    case 'swarmer':
      return new THREE.TetrahedronGeometry(1, 0);
    case 'charger': {
      const g = new THREE.ConeGeometry(0.8, 2, 4);
      g.rotateZ(-Math.PI / 2); // point along +X
      return g;
    }
    case 'sniper': {
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.7, 1.4, 0.7);
      return g;
    }
    case 'hive':
      return new THREE.DodecahedronGeometry(1, 0);
    case 'shielder':
      return new THREE.BoxGeometry(1.3, 1.1, 1.3);
    case 'splitter':
      return new THREE.IcosahedronGeometry(1, 0);
    case 'mine':
      return new THREE.OctahedronGeometry(1, 1);
    case 'hydraHead': {
      const g = new THREE.ConeGeometry(0.9, 2.4, 6);
      g.rotateZ(-Math.PI / 2);
      return g;
    }
    case 'hydraSeg':
      return new THREE.IcosahedronGeometry(1, 1);
    case 'core':
      return new THREE.IcosahedronGeometry(1, 1);
    case 'zeroday':
      return new THREE.BoxGeometry(1.4, 1.4, 1.4);
  }
}

function glowGeo(type: EnemyType): THREE.BufferGeometry {
  switch (type) {
    case 'swarmer':
      return new THREE.TetrahedronGeometry(1.12, 0);
    case 'charger': {
      const g = new THREE.TorusGeometry(0.9, 0.09, 4, 12);
      g.rotateY(Math.PI / 2);
      return g;
    }
    case 'sniper': {
      const g = new THREE.BoxGeometry(2.4, 0.12, 0.12);
      g.translate(1.2, 0.2, 0);
      return g;
    }
    case 'hive':
      return new THREE.IcosahedronGeometry(1.25, 0);
    case 'shielder': {
      // Shield arc facing +X (140°).
      const g = new THREE.TorusGeometry(1.5, 0.1, 4, 18, (140 * Math.PI) / 180);
      g.rotateZ((-70 * Math.PI) / 180);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'splitter':
      return new THREE.IcosahedronGeometry(1.1, 0);
    case 'mine': {
      const g = new THREE.TorusGeometry(1.25, 0.08, 4, 20);
      g.rotateX(Math.PI / 2);
      return g;
    }
    case 'hydraHead': {
      const g = new THREE.BoxGeometry(0.3, 0.3, 1.5);
      g.translate(0.5, 0.35, 0);
      return g;
    }
    case 'hydraSeg': {
      const g = new THREE.TorusGeometry(1.05, 0.1, 4, 16);
      g.rotateY(Math.PI / 2);
      return g;
    }
    case 'core':
      return new THREE.IcosahedronGeometry(1.35, 0);
    case 'zeroday':
      return new THREE.BoxGeometry(2.0, 2.0, 2.0);
  }
}

const WIRE: Partial<Record<EnemyType, boolean>> = { hive: true, core: true, zeroday: true, swarmer: true, splitter: true };

export class EnemyView {
  readonly group = new THREE.Group();
  private kinds = new Map<EnemyType, Kind>();
  private dummy = new THREE.Object3D();
  private c = new THREE.Color();
  private gold = new THREE.Color(0xffd34d);

  constructor() {
    const types = Object.keys(ENEMIES) as EnemyType[];
    for (const type of types) {
      const def = ENEMIES[type];
      const max = MAX[type] ?? 24;
      const tint = new THREE.Color(def.color).multiplyScalar(0.25);
      const body = new THREE.InstancedMesh(
        bodyGeo(type),
        new THREE.MeshStandardMaterial({ color: tint, metalness: 0.75, roughness: 0.3, flatShading: true, emissive: new THREE.Color(def.color).multiplyScalar(0.12) }),
        max,
      );
      body.castShadow = true;
      body.count = 0;
      body.frustumCulled = false;
      const glow = new THREE.InstancedMesh(glowGeo(type), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: !!WIRE[type] }), max);
      glow.count = 0;
      glow.frustumCulled = false;
      for (let i = 0; i < max; i++) glow.setColorAt(i, this.c.set(def.color));
      this.group.add(body, glow);
      this.kinds.set(type, {
        body,
        glow,
        scale: type === 'charger' || type === 'hydraHead' ? 0.95 : type === 'swarmer' || type === 'mine' || type === 'sniper' ? 1.45 : type === 'splitter' ? 1.2 : 1.1,
        hover: type === 'mine' ? 0.5 : type === 'hive' ? 1.4 : type === 'core' ? 2.6 : type === 'zeroday' ? 1.8 : 0.7,
        spin: type === 'swarmer' ? 4 : type === 'splitter' ? 1.5 : type === 'hive' ? 0.4 : type === 'core' ? 0.3 : type === 'zeroday' ? 1.2 : type === 'mine' ? 2 : 0,
        face: type === 'charger' || type === 'sniper' || type === 'shielder' || type === 'hydraHead' || type === 'hydraSeg',
      });
    }
  }

  sync(enemies: Enemy[], time: number): void {
    for (const k of this.kinds.values()) {
      k.body.count = 0;
      k.glow.count = 0;
    }
    const d = this.dummy;
    for (const e of enemies) {
      const k = this.kinds.get(e.type)!;
      const i = k.body.count;
      if (i >= k.body.instanceMatrix.count) continue;
      const def = ENEMIES[e.type];
      // Spawn-in grows from a point; teleporting zeroday shrinks out and back in.
      const spawn = e.spawnT > 0 ? Math.max(0, 1 - e.spawnT / 0.9) : 1;
      const pop = e.flash > 0 ? (e.type === 'hydraHead' || e.type === 'core' || e.type === 'zeroday' ? 1.04 : 1.18) : 1;
      let s = e.r * k.scale * spawn * pop;
      if (e.type === 'mine' && e.state === 1) s *= 1 + Math.sin(time * 40) * 0.15;
      if (e.type === 'charger' && e.state === 1) s *= 1 + Math.sin(time * 50) * 0.06;
      const bob = Math.sin(time * 3 + e.id) * 0.15;
      d.position.set(e.x, k.hover * (e.r / def.r) * 0.8 + bob + (1 - spawn) * 2, e.z);
      let yaw = 0;
      if (k.face) {
        if (e.type === 'charger' && e.state >= 1) yaw = -Math.atan2(e.dirZ, e.dirX);
        else if (e.type === 'sniper' || e.type === 'shielder' || e.type === 'hydraSeg' || e.type === 'hydraHead') yaw = -e.angle;
        else yaw = -Math.atan2(e.vz, e.vx);
      }
      d.rotation.set(k.spin ? time * k.spin * 0.6 + e.id : 0, yaw + (k.spin && !k.face ? time * k.spin + e.id : 0), 0);
      if (e.type === 'swarmer') d.rotation.set(time * 3 + e.id, time * 4 + e.id, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      k.body.setMatrixAt(i, d.matrix);
      if (e.type === 'shielder' || e.type === 'mine') {
        // Keep the shield arc and the mine ring level instead of spinning with the body.
        d.rotation.set(0, e.type === 'shielder' ? -e.angle : 0, 0);
        // A broken shield disappears; a weak one flickers.
        if (e.type === 'shielder' && (e.k[1] > 0 || (e.k[0] < e.k[2] * 0.3 && Math.sin(time * 40) > 0))) d.scale.setScalar(0.0001);
        d.updateMatrix();
      }
      k.glow.setMatrixAt(i, d.matrix);
      let intensity = 2.4;
      if (e.type === 'charger' && e.state === 1) intensity = 5;
      if (e.type === 'sniper' && e.state >= 1) intensity = 4;
      if (e.type === 'mine' && e.state === 1) intensity = Math.sin(time * 30) > 0 ? 6 : 1;
      if (e.type === 'hive') intensity = 2 + Math.sin(time * 4 + e.id) * 0.8;
      const bossPart = e.type === 'hydraHead' || e.type === 'hydraSeg' || e.type === 'core' || e.type === 'zeroday';
      if (e.flash > 0) {
        if (bossPart) this.c.set(def.color).multiplyScalar(intensity).lerp(new THREE.Color(3, 3, 3), 0.35);
        else this.c.setRGB(5, 5, 5);
      }
      else if (e.elite) this.c.copy(this.gold).multiplyScalar(intensity);
      else this.c.set(def.color).multiplyScalar(intensity);
      if (e.stun > 0) this.c.lerp(new THREE.Color(0.4, 0.8, 4), 0.6);
      k.glow.setColorAt(i, this.c);
      k.body.count++;
      k.glow.count++;
    }
    for (const k of this.kinds.values()) {
      k.body.instanceMatrix.needsUpdate = true;
      k.glow.instanceMatrix.needsUpdate = true;
      if (k.glow.instanceColor) k.glow.instanceColor.needsUpdate = true;
    }
  }
}
