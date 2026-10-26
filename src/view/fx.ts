import * as THREE from 'three';
import { ENEMIES } from '../sim/config';
import type { World } from '../sim/world';

function additive(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, max: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

interface Ring {
  m: THREE.Mesh;
  life: number;
  max: number;
  r0: number;
  r1: number;
}

interface Bolt {
  line: THREE.Line;
  life: number;
}

export class Fx {
  readonly group = new THREE.Group();
  private d = new THREE.Object3D();
  private c = new THREE.Color();

  private pBullets = instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500);
  private eBullets = instanced(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1200);
  private eCores = instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1200);
  private data = instanced(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22e6ff).multiplyScalar(2.5) }), 1500);
  private heals = instanced(new THREE.BoxGeometry(0.5, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff80).multiplyScalar(3) }), 40);
  private lanes = instanced(new THREE.PlaneGeometry(1, 1), additive(0xffffff), 60);
  private lasers = instanced(new THREE.BoxGeometry(1, 1, 1), additive(0xffffff), 40);
  private circles = instanced(new THREE.RingGeometry(0.92, 1, 48), additive(0xffffff), 60);
  private portals = instanced(new THREE.RingGeometry(0.75, 1, 32), additive(0xffffff), 200);
  private pillars = instanced(new THREE.CylinderGeometry(0.06, 0.25, 6, 6, 1, true), additive(0xffffff), 200);
  private beamCore = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.95).multiplyScalar(5) }), 12);
  private beamGlow = instanced(new THREE.BoxGeometry(1, 1, 1), additive(0xffffff), 12);
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];

  constructor() {
    // Create instance color buffers up front so programs compile with instancing colors.
    for (const m of [this.pBullets, this.eBullets, this.eCores, this.lanes, this.lasers, this.circles, this.portals, this.pillars, this.beamGlow])
      m.setColorAt(0, this.c.setRGB(1, 1, 1));
    this.group.add(this.pBullets, this.eBullets, this.eCores, this.data, this.heals, this.lanes, this.lasers, this.circles, this.portals, this.pillars, this.beamGlow, this.beamCore);
  }

  ring(x: number, z: number, r0: number, r1: number, color: THREE.ColorRepresentation, life = 0.45, y = 0.08): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), additive(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.group.add(m);
    this.rings.push({ m, life, max: life, r0, r1 });
  }

  bolt(pts: number[], color: THREE.ColorRepresentation): void {
    const verts: number[] = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x0 = pts[i], z0 = pts[i + 1], x1 = pts[i + 2], z1 = pts[i + 3];
      const seg = 6;
      for (let k = 0; k <= seg; k++) {
        const t = k / seg;
        const j = k === 0 || k === seg ? 0 : (Math.random() - 0.5) * 0.9;
        verts.push(x0 + (x1 - x0) * t + j, 0.8 + Math.random() * 0.4, z0 + (z1 - z0) * t + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true }));
    this.group.add(line);
    this.bolts.push({ line, life: 0.18 });
  }

  sync(w: World, time: number, dt: number): void {
    const d = this.d;
    // ---- bullets
    let pi = 0;
    let ei = 0;
    for (const b of w.bullets) {
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const yaw = -Math.atan2(b.vz, b.vx);
      if (b.team === 0) {
        if (pi >= 1500) continue;
        d.position.set(b.x, 0.8, b.z);
        d.rotation.set(0, yaw, 0);
        const len = b.missile ? 2.2 : Math.min(3.2, 1 + sp * 0.05);
        d.scale.set(b.r * len * 1.6, b.r * (b.missile ? 1.3 : 0.8), b.r * (b.missile ? 1.3 : 0.8));
        d.updateMatrix();
        this.pBullets.setMatrixAt(pi, d.matrix);
        if (b.missile) this.c.setRGB(4, 2.6, 0.6);
        else if (b.crit) this.c.setRGB(4, 3.4, 1);
        else this.c.copy(w.stats.explosive ? new THREE.Color(3.2, 1.6, 0.6) : new THREE.Color(0.6, 2.6, 4));
        this.pBullets.setColorAt(pi, this.c);
        pi++;
      } else {
        if (ei >= 1200) continue;
        const pulse = 1 + Math.sin(time * 20 + b.x) * 0.12;
        d.position.set(b.x, 0.8, b.z);
        d.rotation.set(0, yaw, 0);
        d.scale.set(b.r * 1.5 * pulse, b.r * 1.2 * pulse, b.r * 1.2 * pulse);
        d.updateMatrix();
        this.eBullets.setMatrixAt(ei, d.matrix);
        this.eBullets.setColorAt(ei, this.c.setRGB(3.5, 0.5, 0.25));
        d.scale.multiplyScalar(0.55);
        d.updateMatrix();
        this.eCores.setMatrixAt(ei, d.matrix);
        this.eCores.setColorAt(ei, this.c.setRGB(4, 3.4, 3));
        ei++;
      }
    }
    this.pBullets.count = pi;
    this.eBullets.count = ei;
    this.eCores.count = ei;
    for (const m of [this.pBullets, this.eBullets, this.eCores]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // ---- pickups
    let di = 0;
    let hi = 0;
    for (const k of w.pickups) {
      const blink = k.life < 2 && Math.sin(time * 25) < 0 ? 0.001 : 1;
      if (k.kind === 'data') {
        if (di >= 1500) continue;
        d.position.set(k.x, 0.4 + Math.sin(time * 5 + k.x * 3) * 0.12, k.z);
        d.rotation.set(time * 3, time * 4 + k.z, 0);
        d.scale.setScalar(blink * (0.8 + Math.min(2, k.value) * 0.35));
        d.updateMatrix();
        this.data.setMatrixAt(di++, d.matrix);
      } else {
        if (hi >= 40) continue;
        for (const rot of [0, Math.PI / 2]) {
          d.position.set(k.x, 0.6 + Math.sin(time * 4) * 0.15, k.z);
          d.rotation.set(0, time * 2 + rot, 0);
          d.scale.setScalar(blink * 1.3);
          d.updateMatrix();
          if (hi < 40) this.heals.setMatrixAt(hi++, d.matrix);
        }
      }
    }
    this.data.count = di;
    this.heals.count = hi;
    this.data.instanceMatrix.needsUpdate = true;
    this.heals.instanceMatrix.needsUpdate = true;

    // ---- telegraphs
    let li = 0;
    let si = 0;
    let ci = 0;
    let poi = 0;
    const flick = 0.55 + Math.sin(time * 30) * 0.25;
    const lane = (x: number, z: number, dx: number, dz: number, len: number, width: number, k: number) => {
      if (li >= 60) return;
      d.position.set(x + (dx * len) / 2, 0.06, z + (dz * len) / 2);
      d.rotation.set(-Math.PI / 2, 0, Math.atan2(-dz, dx));
      d.scale.set(len, width, 1);
      d.updateMatrix();
      this.lanes.setMatrixAt(li, d.matrix);
      this.lanes.setColorAt(li, this.c.setRGB(1.6 * k, 0.15 * k, 0.25 * k));
      li++;
    };
    for (const e of w.enemies) {
      if (e.spawnT > 0) {
        if (poi < 200) {
          const prog = 1 - Math.min(1, e.spawnT / 0.9);
          const col = new THREE.Color(ENEMIES[e.type].color);
          d.position.set(e.x, 0.07, e.z);
          d.rotation.set(-Math.PI / 2, 0, time * 3);
          d.scale.setScalar(e.r * (2.6 - prog * 1.4));
          d.updateMatrix();
          this.portals.setMatrixAt(poi, d.matrix);
          this.portals.setColorAt(poi, this.c.copy(col).multiplyScalar(1.5 + prog * 2));
          d.position.set(e.x, 3, e.z);
          d.rotation.set(0, 0, 0);
          d.scale.set(e.r * 1.4, 1 - prog * 0.5, e.r * 1.4);
          d.updateMatrix();
          this.pillars.setMatrixAt(poi, d.matrix);
          this.pillars.setColorAt(poi, this.c.copy(col).multiplyScalar(0.6 * (1 - prog)));
          poi++;
        }
        continue;
      }
      if (e.type === 'charger' && e.state === 1) lane(e.x, e.z, e.dirX, e.dirZ, 20, e.r * 2, flick * Math.min(1, e.t * 2.5));
      if (e.type === 'hydraHead' && e.state === 1) lane(e.x, e.z, e.dirX, e.dirZ, 20, 2.4, flick);
      if (e.type === 'zeroday' && e.state === 2 && e.k[2] < 0.01) lane(e.x, e.z, e.dirX, e.dirZ, 14, 3, flick);
      if (e.type === 'sniper' && e.state >= 1 && si < 40) {
        const locked = e.state === 2;
        const len = 40;
        const ca = Math.cos(e.angle);
        const sa = Math.sin(e.angle);
        d.position.set(e.x + (ca * len) / 2, 0.8, e.z + (sa * len) / 2);
        d.rotation.set(0, -e.angle, 0);
        const wdt = locked ? 0.14 : 0.05;
        d.scale.set(len, wdt, wdt);
        d.updateMatrix();
        this.lasers.setMatrixAt(si, d.matrix);
        const k = locked ? (Math.sin(time * 60) > 0 ? 5 : 2) : 1.4;
        this.lasers.setColorAt(si, this.c.setRGB(k, 0.15 * k, 0.1 * k));
        si++;
      }
      if (e.type === 'mine' && e.state === 1 && ci < 60) {
        d.position.set(e.x, 0.07, e.z);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.scale.setScalar(3.3 * Math.min(1, e.t / 0.95));
        d.updateMatrix();
        this.circles.setMatrixAt(ci, d.matrix);
        this.circles.setColorAt(ci, this.c.setRGB(2.5 * flick, 0.2, 0.2));
        ci++;
        d.scale.setScalar(3.3);
        d.updateMatrix();
        this.circles.setMatrixAt(ci, d.matrix);
        this.circles.setColorAt(ci, this.c.setRGB(0.7, 0.05, 0.05));
        ci++;
      }
    }
    // Boss lasers
    let bi = 0;
    for (const b of w.beams) {
      if (bi >= 12) break;
      const ca = Math.cos(b.angle);
      const sa = Math.sin(b.angle);
      d.position.set(b.x + (ca * b.len) / 2, 0.9, b.z + (sa * b.len) / 2);
      d.rotation.set(0, -b.angle, 0);
      if (b.warm > 0) {
        const wd = 0.08 + (1 - b.warm / 1.3) * 0.15;
        d.scale.set(b.len, wd, wd);
        d.updateMatrix();
        this.beamGlow.setMatrixAt(bi, d.matrix);
        this.beamGlow.setColorAt(bi, this.c.setRGB(2 * flick, 0.2, 0.6));
        d.scale.set(0.0001, 0.0001, 0.0001);
        d.updateMatrix();
        this.beamCore.setMatrixAt(bi, d.matrix);
      } else {
        const pulse = 1 + Math.sin(time * 40) * 0.1;
        d.scale.set(b.len, b.width * 1.6 * pulse, b.width * 1.6 * pulse);
        d.updateMatrix();
        this.beamGlow.setMatrixAt(bi, d.matrix);
        this.beamGlow.setColorAt(bi, this.c.setRGB(2.5, 0.3, 1.1));
        d.scale.set(b.len, b.width * 0.45, b.width * 0.45);
        d.updateMatrix();
        this.beamCore.setMatrixAt(bi, d.matrix);
      }
      bi++;
    }
    this.beamCore.count = bi;
    this.beamGlow.count = bi;
    this.lanes.count = li;
    this.lasers.count = si;
    this.circles.count = ci;
    this.portals.count = poi;
    this.pillars.count = poi;
    for (const m of [this.lanes, this.lasers, this.circles, this.portals, this.pillars, this.beamCore, this.beamGlow]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // ---- one-shot rings and bolts
    for (const r of this.rings) {
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.max;
      const ease = 1 - Math.pow(1 - t, 3);
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * ease);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
    for (const r of this.rings.filter((r) => r.life <= 0)) {
      this.group.remove(r.m);
      r.m.geometry.dispose();
      (r.m.material as THREE.Material).dispose();
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const b of this.bolts) {
      b.life -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.18);
    }
    for (const b of this.bolts.filter((b) => b.life <= 0)) {
      this.group.remove(b.line);
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }
}
