import type { Input } from './sim/types';

/**
 * Keyboard uses event.code (physical keys), so WASD works on any layout — including Russian ЙЦУКЕН.
 */
export class Controls {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  private rmbPressed = false;
  autoFire = false;
  /** True when the last aim input came from a gamepad stick. */
  usingPad = false;
  private padAim = { x: 0, z: -1 };
  private padPrev: boolean[] = [];

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    el.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.usingPad = false;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rmbPressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Edge-triggered key check, consumed on read. */
  take(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  clearEdges(): void {
    this.pressed.clear();
    this.rmbPressed = false;
  }

  private padButton(pad: Gamepad, i: number): boolean {
    const down = !!pad.buttons[i]?.pressed;
    const was = this.padPrev[i] ?? false;
    this.padPrev[i] = down;
    return down && !was;
  }

  /** Build the sim input. aim(ndcX, ndcY) converts the cursor to a floor point. */
  sample(aim: (x: number, y: number) => { x: number; z: number }, px: number, pz: number): Input {
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    let fire = this.mouseDown || this.autoFire;
    let dash = this.take('Space') || this.take('ShiftLeft') || this.take('ShiftRight') || this.rmbPressed;
    let emp = this.take('KeyQ') || this.take('KeyE');
    this.rmbPressed = false;
    let a = aim(this.mouseX, this.mouseY);

    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0);
      const ry = dz(pad.axes[3] ?? 0);
      if (lx || ly) {
        mx = lx;
        mz = ly;
      }
      if (Math.hypot(rx, ry) > 0.3) {
        this.usingPad = true;
        this.padAim = { x: rx, z: ry };
      }
      if (this.usingPad) {
        a = { x: px + this.padAim.x * 10, z: pz + this.padAim.z * 10 };
        fire = fire || Math.hypot(rx, ry) > 0.5 || (pad.buttons[7]?.value ?? 0) > 0.3;
      }
      if (this.padButton(pad, 0) || this.padButton(pad, 4)) dash = true;
      if (this.padButton(pad, 5) || this.padButton(pad, 1)) emp = true;
    }
    return { moveX: mx, moveZ: mz, aimX: a.x, aimZ: a.z, fire, dash, emp };
  }
}
