import * as THREE from 'three';
import { ENEMIES, SECTOR_INFO } from '../sim/config';
import { tr } from '../i18n';
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { Arena } from './arena';
import { BossDecor } from './bossdecor';
import { CameraRig } from './camera';
import { Debris } from './debris';
import { EnemyView } from './enemies';
import { Fx } from './fx';
import { Particles } from './particles';
import { PlayerView } from './player';
import { Popups } from './popups';
import { QUALITY, Renderer, type Quality } from './renderer';

const BOSS = new Set(['hydraHead', 'core', 'zeroday']);

export class View {
  readonly r: Renderer;
  readonly arena = new Arena();
  readonly enemies = new EnemyView();
  readonly fx = new Fx();
  readonly bossDecor = new BossDecor();
  readonly debris = new Debris();
  readonly particles: Particles;
  readonly player: PlayerView;
  readonly popups: Popups;
  readonly cam: CameraRig;
  private sun: THREE.DirectionalLight;
  private flash = new THREE.Vector4(1, 1, 1, 0);
  private aberr = 0;
  private glitch = 0;
  beat = 0;
  private sector = -1;
  private obstaclesRef: unknown = null;
  private delayed: { t: number; fn: () => void }[] = [];
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpV = new THREE.Vector3();
  private tmpC = new THREE.Color();
  showDamage = true;

  constructor(root: HTMLElement, quality: Quality = QUALITY.high) {
    this.r = new Renderer(root, quality);
    this.particles = new Particles(quality.particles);
    this.player = new PlayerView('vector');
    this.popups = new Popups(root);
    this.cam = new CameraRig(this.r.camera);
    const s = this.r.scene;
    s.add(new THREE.HemisphereLight(0x5577ff, 0x080010, 0.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.position.set(10, 30, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 20;
    sc.bottom = -20;
    sc.far = 80;
    s.add(this.sun, this.sun.target);
    s.add(this.arena.group, this.enemies.group, this.bossDecor.group, this.fx.group, this.debris.mesh, this.particles.points, this.player.group);
    this.particles.setScale(window.innerHeight);
    window.addEventListener('resize', () => this.particles.setScale(window.innerHeight));
  }

  /** Mouse (NDC) to a point on the floor. */
  aimPoint(ndcX: number, ndcY: number): { x: number; z: number } {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.r.camera);
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, this.tmpV);
    return hit ? { x: hit.x, z: hit.z } : { x: 0, z: 0 };
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    this.tmpV.set(x, y, z).project(this.r.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight };
  }

  reset(w: World): void {
    this.popups.clear();
    this.player.setShip(w.ship);
    this.sector = -1;
    this.obstaclesRef = null;
    this.delayed = [];
  }

  private later(t: number, fn: () => void): void {
    this.delayed.push({ t, fn });
  }

  private color(type: keyof typeof ENEMIES): THREE.Color {
    return this.tmpC.set(ENEMIES[type].color);
  }

  handle(events: SimEvent[], w: World, time: number): void {
    const P = this.particles;
    for (const ev of events) {
      switch (ev.t) {
        case 'shoot':
          if (ev.team === 0) P.burst(ev.x, ev.z, { count: 2, color: this.player.color, speed: 4, life: 0.15, size: 0.5, y: 0.8, gravity: 0 });
          break;
        case 'hit': {
          const c = this.color(ev.type);
          P.burst(ev.x, ev.z, { count: ev.crit ? 8 : 3, color: ev.crit ? 0xffe14d : c, speed: 8, life: 0.3, size: 0.45, y: 0.8 });
          if (this.showDamage && ev.dmg >= 0.5) this.popups.add(ev.x, ev.z, String(Math.round(ev.dmg)), ev.crit ? 'crit' : 'dmg', ev.crit ? 0.8 : 0.55);
          if (ev.crit) this.arena.shock(ev.x, ev.z, time, 0.2);
          break;
        }
        case 'kill': {
          const big = BOSS.has(ev.type);
          const c = new THREE.Color(ENEMIES[ev.type].color);
          if (ev.elite) c.set(0xffd34d);
          const r = ev.r;
          this.debris.shatter(ev.x, ev.z, r, c, Math.round(5 + r * 12), 6 + r * 3);
          P.burst(ev.x, ev.z, { count: Math.round(14 + r * 26), color: c, speed: 9 + r * 4, life: 0.6, size: 0.7, y: 0.8, jitterColor: 0.06 });
          P.burst(ev.x, ev.z, { count: 6, color: 0xffffff, speed: 5, life: 0.25, size: 1.1, y: 0.8, gravity: 0 });
          this.arena.shock(ev.x, ev.z, time, 0.2 + r * 0.25);
          if (r > 0.6) this.fx.ring(ev.x, ev.z, 0.3, 1.5 + r * 2.5, c.clone().multiplyScalar(2), 0.4);
          this.cam.addTrauma(big ? 0.6 : 0.03 + r * 0.06);
          this.aberr = Math.max(this.aberr, 0.002 + r * 0.002);
          if (ev.elite) this.popups.add(ev.x, ev.z, tr('ЭЛИТА', 'ELITE'), 'elite', 1.0, 2.2);
          break;
        }
        case 'playerHit':
          if (ev.shield) {
            this.flash.set(0.3, 0.7, 1, 0.25);
            this.fx.ring(ev.x, ev.z, 0.5, 3, 0x66ccff, 0.4);
          } else {
            this.flash.set(1, 0.05, 0.1, 0.35);
            this.aberr = 0.02;
            this.cam.addTrauma(0.55);
            this.fx.ring(ev.x, ev.z, 0.5, 4, 0xff2040, 0.5);
            P.burst(ev.x, ev.z, { count: 30, color: 0xff3050, speed: 10, life: 0.5, size: 0.6, y: 0.8 });
          }
          break;
        case 'playerDeath':
          this.flash.set(1, 1, 1, 0.8);
          this.cam.addTrauma(1);
          this.aberr = 0.04;
          this.glitch = 1;
          this.debris.shatter(ev.x, ev.z, 1.2, this.player.color, 60, 12);
          P.burst(ev.x, ev.z, { count: 220, color: this.player.color, speed: 16, life: 1.2, size: 1, y: 0.8, jitterColor: 0.1 });
          this.arena.shock(ev.x, ev.z, time, 1.5);
          for (let i = 0; i < 4; i++) this.later(i * 0.15, () => this.fx.ring(ev.x, ev.z, 0.5, 8 + i * 4, this.player.color, 0.8));
          break;
        case 'dash':
          this.player.dashGhost();
          this.later(0.06, () => this.player.dashGhost());
          this.later(0.12, () => this.player.dashGhost());
          P.burst(ev.x, ev.z, { count: 16, color: this.player.color, speed: 6, life: 0.4, size: 0.6, y: 0.7, dirX: -ev.dx, dirZ: -ev.dz, cone: 1.2, gravity: 0 });
          this.arena.shock(ev.x, ev.z, time, 0.25);
          break;
        case 'emp':
          this.flash.set(0.5, 0.8, 1, 0.3);
          this.aberr = 0.03;
          this.cam.addTrauma(0.45);
          this.arena.shock(ev.x, ev.z, time, 1.8);
          this.fx.ring(ev.x, ev.z, 0.5, ev.r, 0x66ddff, 0.5, 0.9);
          this.fx.ring(ev.x, ev.z, 0.2, ev.r * 0.7, 0xffffff, 0.35, 0.3);
          P.burst(ev.x, ev.z, { count: 160, color: 0x66ddff, speed: 22, life: 0.6, size: 0.7, y: 0.8, gravity: 0, drag: 3 });
          break;
        case 'explode': {
          const col = ev.team === 1 ? 0xff3a2a : 0xffa030;
          this.fx.ring(ev.x, ev.z, 0.3, ev.r, col, 0.35);
          P.burst(ev.x, ev.z, { count: Math.round(10 + ev.r * 10), color: col, speed: 6 + ev.r * 3, life: 0.45, size: 0.8, y: 0.6, jitterColor: 0.05 });
          this.arena.shock(ev.x, ev.z, time, 0.3 + ev.r * 0.1);
          this.cam.addTrauma(ev.team === 1 ? 0.25 : 0.06);
          break;
        }
        case 'pickup':
          P.burst(ev.x, ev.z, { count: ev.kind === 'heal' ? 20 : 2, color: ev.kind === 'heal' ? 0x40ff80 : 0x22e6ff, speed: 3, life: 0.3, size: 0.5, y: 0.6, gravity: -2 });
          break;
        case 'heal':
          P.burst(ev.x, ev.z, { count: 30, color: 0x40ff80, speed: 4, life: 0.8, size: 0.6, y: 0.4, gravity: -6, spread: 0.2 });
          this.popups.add(ev.x, ev.z, '+1', 'heal', 1, 2);
          break;
        case 'chain':
          this.fx.bolt(ev.pts, 0x9fd8ff);
          break;
        case 'blocked':
          P.burst(ev.x, ev.z, { count: 5, color: 0x4dff9a, speed: 7, life: 0.25, size: 0.4, y: 0.8 });
          break;
        case 'bounce':
          P.burst(ev.x, ev.z, { count: 3, color: 0xffffff, speed: 5, life: 0.2, size: 0.4, y: 0.8 });
          break;
        case 'charge':
          this.cam.addTrauma(0.12);
          P.burst(ev.x, ev.z, { count: 14, color: 0xff7a1a, speed: 7, life: 0.4, size: 0.6, y: 0.4 });
          break;
        case 'snipe':
          P.burst(ev.x, ev.z, { count: 8, color: 0xffe14d, speed: 6, life: 0.25, size: 0.6, y: 0.8 });
          break;
        case 'waveClear':
          this.arena.shock(w.player.x, w.player.z, time, 2);
          this.fx.ring(w.player.x, w.player.z, 1, 30, this.arena.color2, 1.2);
          this.flash.set(1, 1, 1, ev.boss ? 0.5 : 0.15);
          break;
        case 'bossPhase':
          this.glitch = 1;
          this.flash.set(1, 0.2, 0.6, 0.3);
          this.cam.addTrauma(0.7);
          this.arena.shock(ev.x, ev.z, time, 2);
          this.fx.ring(ev.x, ev.z, 1, 20, 0xff3df2, 0.8);
          break;
        case 'bossDeath':
          this.glitch = 1.2;
          this.cam.addTrauma(1);
          for (let i = 0; i < 8; i++)
            this.later(i * 0.12, () => {
              const ox = ev.x + (Math.random() - 0.5) * 6;
              const oz = ev.z + (Math.random() - 0.5) * 6;
              this.debris.shatter(ox, oz, 2, ENEMIES[ev.type].color, 25, 14);
              this.particles.burst(ox, oz, { count: 80, color: i % 2 ? 0xffffff : ENEMIES[ev.type].color, speed: 18, life: 1, size: 1.1, y: 1 });
              this.arena.shock(ox, oz, this.lastTime, 1.5);
              this.fx.ring(ox, oz, 1, 10 + i * 2, ENEMIES[ev.type].color, 0.7);
              this.cam.addTrauma(0.4);
            });
          this.later(1.0, () => this.flash.set(1, 1, 1, 0.9));
          break;
        case 'spawn':
          if (BOSS.has(ev.type)) {
            this.glitch = 0.6;
            this.fx.ring(ev.x, ev.z, 6, 0.5, ENEMIES[ev.type].color, 0.7);
          }
          break;
        default:
          break;
      }
    }
  }

  private lastTime = 0;

  frame(w: World, time: number, dt: number): void {
    this.lastTime = time;
    if (w.sector !== this.sector) {
      this.sector = w.sector;
      this.arena.setSector(Math.min(w.sector, SECTOR_INFO.length - 1));
    }
    if (w.obstacles !== this.obstaclesRef) {
      this.obstaclesRef = w.obstacles;
      this.arena.setObstacles(w.obstacles);
    }
    for (const d of this.delayed) d.t -= dt;
    for (const d of this.delayed.filter((d) => d.t <= 0)) d.fn();
    this.delayed = this.delayed.filter((d) => d.t > 0);

    const p = w.player;
    // engine trail
    if (p.alive) {
      const back = Math.atan2(p.aimZ - p.z, p.aimX - p.x) + Math.PI;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 1 || Math.random() < 0.3)
        this.particles.emit(p.x + Math.cos(back) * 0.8, 0.8, p.z + Math.sin(back) * 0.8, Math.cos(back) * 2, 0, Math.sin(back) * 2, this.player.color, 0.5 + sp * 0.03, 0.35, 0, 1);
      for (const b of w.bullets)
        if (b.missile && Math.random() < 0.7) this.particles.emit(b.x, 0.8, b.z, 0, 0.5, 0, this.tmpC.setRGB(1, 0.6, 0.2), 0.6, 0.4, 0, 1);
    }
    this.player.sync(w, time, dt);
    this.enemies.sync(w.enemies, time);
    this.bossDecor.sync(w.enemies, time);
    this.fx.sync(w, time, dt);
    this.debris.update(dt);
    this.particles.update(dt);
    const danger = p.alive && p.hp <= 2 ? 1 : 0;
    this.arena.update(time, p.x, p.z, this.beat, danger);
    this.cam.update(p.x, p.z, p.aimX, p.aimZ, dt, time);
    this.sun.position.set(p.x + 10, 30, p.z + 12);
    this.sun.target.position.set(p.x, 0, p.z);

    this.flash.w = Math.max(0, this.flash.w - dt * 2.2);
    this.aberr = Math.max(0, this.aberr - dt * 0.08);
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
    const u = this.r.final.uniforms;
    u.uFlash.value.copy(this.flash);
    u.uAberr.value = this.aberr;
    u.uGlitch.value = this.glitch;
    this.popups.update(this.r.camera, dt);
    this.r.render(time);
  }
}
