import * as THREE from 'three';
import { SHIPS } from '../sim/config';
import type { ShipId } from '../sim/types';
import type { World } from '../sim/world';

export function buildShip(id: ShipId): THREE.Group {
  const color = new THREE.Color(SHIPS[id].color);
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xd8e2f5, metalness: 0.85, roughness: 0.25, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.8, roughness: 0.4, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3) });

  const shape = id === 'bastion' ? { len: 1.5, wing: 1.3, w: 0.7 } : id === 'impulse' ? { len: 1.9, wing: 1.0, w: 0.4 } : { len: 1.7, wing: 1.15, w: 0.5 };

  const body = new THREE.Mesh(new THREE.ConeGeometry(shape.w, shape.len, 5), hull);
  body.rotation.z = -Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const canopy = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glow);
  canopy.position.set(0.15, 0.2, 0);
  canopy.scale.set(1.6, 0.6, 0.8);
  g.add(canopy);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, shape.wing), dark);
    wing.position.set(-0.35, 0, s * shape.wing * 0.45);
    wing.rotation.y = s * 0.45;
    wing.castShadow = true;
    g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), glow);
    tip.position.set(-0.45, 0.02, s * shape.wing * 0.88);
    tip.rotation.y = s * 0.45;
    g.add(tip);
    if (id === 'bastion') {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6), hull);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.1, -0.05, s * 0.55);
      g.add(pod);
    }
  }
  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(5) }));
  engine.position.set(-shape.len * 0.5, 0, 0);
  engine.name = 'engine';
  g.add(engine);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 0.95, 40),
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.name = 'ring';
  g.add(ring);
  return g;
}

export class PlayerView {
  readonly group = new THREE.Group();
  ship: THREE.Group;
  private shipId: ShipId;
  private drones: THREE.Mesh[] = [];
  private ghosts: { m: THREE.Group; life: number }[] = [];
  private shieldBubble: THREE.Mesh;
  readonly light: THREE.PointLight;
  private bank = 0;
  readonly color = new THREE.Color();

  constructor(id: ShipId) {
    this.shipId = id;
    this.ship = buildShip(id);
    this.color.set(SHIPS[id].color);
    this.group.add(this.ship);
    const droneMat = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(3) });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), droneMat);
      d.visible = false;
      this.group.add(d);
      this.drones.push(d);
    }
    this.shieldBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 1),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, wireframe: true, transparent: true, opacity: 0.5 }),
    );
    this.group.add(this.shieldBubble);
    this.light = new THREE.PointLight(this.color, 30, 14, 1.6);
    this.light.position.y = 2;
    this.group.add(this.light);
  }

  setShip(id: ShipId): void {
    if (id === this.shipId) return;
    this.group.remove(this.ship);
    this.shipId = id;
    this.ship = buildShip(id);
    this.color.set(SHIPS[id].color);
    this.light.color.copy(this.color);
    this.group.add(this.ship);
  }

  dashGhost(): void {
    const m = this.ship.clone(true);
    m.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
        o.castShadow = false;
      }
    });
    m.position.copy(this.ship.position);
    m.rotation.copy(this.ship.rotation);
    this.group.add(m);
    this.ghosts.push({ m, life: 0.35 });
  }

  sync(w: World, time: number, dt: number): void {
    const p = w.player;
    this.ship.visible = p.alive && (p.invuln <= 0 || Math.sin(time * 40) > -0.3);
    const yaw = -Math.atan2(p.aimZ - p.z, p.aimX - p.x);
    // Bank into lateral movement.
    const side = -Math.sin(yaw) * p.vx - Math.cos(yaw) * p.vz;
    this.bank += (Math.max(-0.6, Math.min(0.6, -side * 0.05)) - this.bank) * Math.min(1, dt * 8);
    this.ship.position.set(p.x, 0.8 + Math.sin(time * 3) * 0.08, p.z);
    this.ship.rotation.set(this.bank, yaw, 0, 'YXZ');
    const ring = this.ship.getObjectByName('ring');
    if (ring) {
      ring.rotation.set(-Math.PI / 2, 0, 0);
      ring.position.y = -0.75;
    }
    const engine = this.ship.getObjectByName('engine');
    if (engine) engine.scale.setScalar(1 + Math.sin(time * 30) * 0.2 + Math.hypot(p.vx, p.vz) * 0.03);
    this.light.position.set(p.x, 2.2, p.z);

    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      d.visible = i < w.stats.drones && p.alive;
      if (!d.visible) continue;
      const pos = w.dronePos(i);
      d.position.set(pos.x, 1.1 + Math.sin(time * 4 + i) * 0.15, pos.z);
      d.rotation.set(time * 3, time * 2, 0);
    }
    this.shieldBubble.visible = p.shield > 0 && p.alive;
    this.shieldBubble.position.set(p.x, 0.8, p.z);
    this.shieldBubble.rotation.y = time;

    for (const g of this.ghosts) {
      g.life -= dt;
      const a = Math.max(0, g.life / 0.35) * 0.5;
      g.m.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).opacity = a;
      });
    }
    for (const g of this.ghosts.filter((g) => g.life <= 0)) this.group.remove(g.m);
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
  }
}
