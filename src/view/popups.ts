import * as THREE from 'three';

interface Pop {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
  vy: number;
}

/** Floating damage numbers and callouts, projected from world space. Pooled DOM nodes. */
export class Popups {
  private root: HTMLDivElement;
  private pool: HTMLDivElement[] = [];
  private live: Pop[] = [];
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'popups';
    parent.appendChild(this.root);
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div');
      el.className = 'pop';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.pool.push(el);
    }
  }

  add(x: number, z: number, text: string, cls: string, life = 0.7, y = 1.5): void {
    const el = this.pool.pop() ?? this.live.shift()?.el;
    if (!el) return;
    el.textContent = text;
    el.className = 'pop ' + cls;
    el.style.display = 'block';
    this.live.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, life, max: life, vy: 2.5 });
  }

  update(camera: THREE.Camera, dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const p of this.live) {
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= 0.92;
      this.v.set(p.x, p.y, p.z).project(camera);
      const t = p.life / p.max;
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${0.8 + Math.min(1, (1 - t) * 6) * 0.4})`;
      p.el.style.opacity = String(Math.min(1, t * 2.5));
    }
    for (const p of this.live) if (p.life <= 0) {
      p.el.style.display = 'none';
      this.pool.push(p.el);
    }
    this.live = this.live.filter((p) => p.life > 0);
  }

  clear(): void {
    for (const p of this.live) {
      p.el.style.display = 'none';
      this.pool.push(p.el);
    }
    this.live = [];
  }
}
