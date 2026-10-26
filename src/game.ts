import { AchievementTracker } from './achievements';
import { AudioEngine } from './audio/audio';
import { Autopilot } from './bot/autopilot';
import { Controls } from './input';
import { achievementText, setLang, shipText, tr } from './i18n';
import { loadMeta, saveMeta, type Meta } from './meta';
import { TICK } from './sim/config';
import type { ShipId, SimEvent } from './sim/types';
import { World } from './sim/world';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { QUALITY } from './view/renderer';
import { View } from './view/view';

type Mode = 'title' | 'play' | 'paused' | 'upgrade' | 'end' | 'menu';

export class Game {
  readonly view: View;
  readonly hud: Hud;
  readonly screens: Screens;
  readonly controls: Controls;
  readonly audio = new AudioEngine();
  readonly meta: Meta;
  readonly bot = new Autopilot(0.9);
  private achievements = new AchievementTracker();
  world: World;
  mode: Mode = 'title';
  ship: ShipId = 'vector';
  /** When true the autopilot flies (title screen, ?autoplay=1). */
  autopilot = true;
  private acc = 0;
  private last = performance.now();
  private time = 0;
  private endTimer = 0;
  private params = new URLSearchParams(location.search);
  invincible = false;

  constructor(root: HTMLElement) {
    this.meta = loadMeta();
    this.view = new View(root, QUALITY[this.meta.settings.quality]);
    this.hud = new Hud(root);
    this.screens = new Screens(root);
    this.controls = new Controls(this.view.r.renderer.domElement);
    this.applySettings();
    this.world = new World(Date.now() >>> 0, 'vector');

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause();
    });
    // UI sounds for every button.
    root.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest?.('button')) this.audio.ui('hover');
    });
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest?.('button')) this.audio.ui('click');
    });

    if (this.params.has('autoplay')) {
      this.startRun((this.params.get('ship') as ShipId) || 'vector', true);
    } else if (this.params.has('play')) {
      this.startRun((this.params.get('ship') as ShipId) || 'vector');
    } else {
      this.toTitle();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private applySettings(): void {
    const s = this.meta.settings;
    setLang(s.lang);
    this.audio.setVolumes(s.music, s.sfx);
    this.view.cam.shakeScale = s.shake;
    this.view.showDamage = s.damageNumbers;
    this.view.r.setQuality(QUALITY[s.quality]);
    this.controls.autoFire = s.autoFire;
    this.hud.showFps = s.showFps || this.params.has('fps');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Escape' && this.mode === 'play' && !this.autopilot) this.pause();
    if (e.code === 'KeyF' && this.mode === 'play') {
      this.meta.settings.autoFire = !this.meta.settings.autoFire;
      this.controls.autoFire = this.meta.settings.autoFire;
      saveMeta(this.meta);
      this.hud.showBanner(this.controls.autoFire ? tr('АВТООГОНЬ: ВКЛ', 'AUTO-FIRE: ON') : tr('АВТООГОНЬ: ВЫКЛ', 'AUTO-FIRE: OFF'), '', 'small');
    }
  }

  // ---------------------------------------------------------------- flow

  toTitle(): void {
    this.mode = 'title';
    this.autopilot = true;
    this.newAttractWorld();
    this.hud.show(false);
    this.audio.setMenu(true);
    this.showTitleScreen();
  }

  /** Title menu only, without restarting the attract demo behind it. */
  private showTitleScreen(): void {
    this.screens.title(this.meta, this.ship, {
      play: (ship) => {
        this.audio.ui('pick');
        this.startRun(ship);
      },
      settings: () => this.screens.settings(this.meta.settings, () => this.onSettings(), () => this.toTitle()),
      help: () => this.screens.help(() => this.toTitle()),
      lang: (l) => {
        this.meta.settings.lang = l;
        this.onSettings();
        this.showTitleScreen();
      },
    });
  }

  private newAttractWorld(): void {
    const ships = this.meta.unlocked;
    const ship = ships[Math.floor(Math.random() * ships.length)];
    // Start the demo a little way into the run so it looks busy.
    this.world = new World(Math.floor(Math.random() * 1e9), ship, { sector: Math.floor(Math.random() * 3), wave: 1 + Math.floor(Math.random() * 3) });
    for (const id of ['fan', 'rate', 'drone', 'dmg', 'chain', 'hp']) this.world.grant(id);
    this.view.reset(this.world);
  }

  private onSettings(): void {
    this.applySettings();
    saveMeta(this.meta);
  }

  startRun(ship: ShipId, autopilot = false): void {
    this.ship = ship;
    this.autopilot = autopilot;
    this.screens.close();
    const sector = parseInt(this.params.get('sector') ?? '0', 10) || 0;
    const wave = parseInt(this.params.get('wave') ?? '0', 10) || 0;
    this.world = new World((Date.now() ^ (Math.random() * 1e9)) >>> 0, ship, { sector, wave });
    this.view.reset(this.world);
    this.hud.show(true);
    this.audio.setMenu(false);
    this.mode = 'play';
    this.endTimer = 0;
    this.acc = 0;
    this.achievements.reset();
    this.controls.clearEdges();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.screens.pause(
      () => this.resume(),
      () => this.screens.settings(this.meta.settings, () => this.onSettings(), () => {
        this.mode = 'play';
        this.pause();
      }),
      () => this.toTitle(),
    );
  }

  resume(): void {
    this.screens.close();
    this.mode = 'play';
    this.last = performance.now();
    this.controls.clearEdges();
  }

  private showUpgrades(): void {
    this.mode = 'upgrade';
    this.audio.ui('card');
    this.screens.upgrades(this.world, this.world.offer, (id) => {
      this.audio.ui('pick');
      this.world.chooseUpgrade(id);
      this.screens.close();
      this.controls.clearEdges();
      if (this.world.phase === 'victory') this.finish(true);
      else this.mode = 'play';
    });
  }

  private finish(victory: boolean): void {
    this.mode = 'end';
    const m = this.meta;
    const r = this.world.run;
    const unlocks: string[] = [];
    if (!this.autopilot) {
      m.runs++;
      m.kills += r.kills;
      if (victory) m.wins++;
      m.bestSector = Math.max(m.bestSector, this.world.sector + (victory ? 1 : 0));
      const unlock = (id: ShipId) => {
        if (!m.unlocked.includes(id)) {
          m.unlocked.push(id);
          unlocks.push(`${tr('Новый корабль', 'New ship')}: ${shipText(id).name}`);
        }
      };
      if (r.bossesKilled >= 1) unlock('impulse');
      if (r.bossesKilled >= 2) unlock('bastion');
    }
    const newBest = !this.autopilot && r.score > m.best;
    if (newBest) m.best = r.score;
    saveMeta(m);
    this.screens.end(this.world, victory, newBest, unlocks, () => this.startRun(this.ship, this.autopilot), () => this.toTitle());
  }

  // ---------------------------------------------------------------- loop

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;
    let visDt = realDt;
    const running = this.mode === 'play' || this.mode === 'title';

    if (running) {
      if (w.hitStop > 0) {
        w.hitStop -= realDt;
        visDt = realDt * 0.05;
      } else {
        let scale = 1;
        if (w.slowMo > 0) {
          w.slowMo -= realDt;
          // Hold the slow scale, then ease back to real time over the last half second.
          const ease = w.slowMo < 0.5 ? 1 - Math.max(0, w.slowMo) / 0.5 : 0;
          scale = w.slowScale + (1 - w.slowScale) * ease;
        }
        if (w.stats.focus && w.player.alive && w.player.hp <= 2 && w.phase === 'wave') scale = Math.min(scale, 0.65);
        visDt = realDt * scale;
        this.audio.setTimeScale(scale);
        this.acc += realDt * scale;
        let steps = 0;
        while (this.acc >= TICK && steps < 8) {
          const input = this.autopilot
            ? this.bot.decide(w)
            : this.controls.sample((x, y) => this.view.aimPoint(x, y), w.player.x, w.player.z);
          if (this.invincible) w.player.invuln = 1;
          w.step(TICK, input);
          this.acc -= TICK;
          steps++;
        }
        if (steps >= 8) this.acc = 0;
      }
      this.handleEvents(w.events);
      w.events.length = 0;
      this.checkPhase(realDt);
    } else {
      visDt = 0;
      this.audio.setTimeScale(1);
    }

    this.time += visDt;
    const intensity = w.phase === 'wave' ? Math.min(1, 0.25 + w.enemies.length / 45 + (w.isBoss ? 0.5 : 0)) : 0.15;
    this.audio.setIntensity(this.mode === 'title' ? 0.3 : intensity);
    this.audio.setBoss(w.isBoss && w.phase === 'wave');
    this.audio.setSector(w.sector % 3);
    this.audio.update(realDt);
    this.view.beat = this.audio.beat;
    this.view.frame(w, this.time, visDt);
    if (this.mode !== 'title') this.hud.update(w, realDt);
  }

  private handleEvents(events: SimEvent[]): void {
    if (!events.length) return;
    this.view.handle(events, this.world, this.time);
    this.audio.handle(events);
    if (this.mode === 'title') return;
    for (const ev of events) if (ev.t === 'waveStart') this.hud.waveBanner(this.world);
    if (!this.autopilot) {
      const got = this.achievements.check(this.meta, this.world, events);
      for (const a of got) {
        const txt = achievementText(a);
        this.hud.toast(txt.name, txt.desc);
      }
      if (got.length) saveMeta(this.meta);
    }
  }

  private checkPhase(dt: number): void {
    const w = this.world;
    if (this.mode === 'title') {
      if (w.phase === 'upgrade') w.chooseUpgrade(this.bot.pickUpgrade(w));
      if (w.phase === 'dead' || w.phase === 'victory') {
        this.endTimer += dt;
        if (this.endTimer > 3) {
          this.endTimer = 0;
          this.newAttractWorld();
        }
      }
      return;
    }
    if (this.mode !== 'play') return;
    if (w.phase === 'upgrade') {
      if (this.autopilot) {
        w.chooseUpgrade(this.bot.pickUpgrade(w));
        if ((w.phase as string) === "victory") this.finish(true);
      } else this.showUpgrades();
    } else if (w.phase === 'dead') {
      this.endTimer += dt;
      if (this.endTimer > 2.4) this.finish(false);
    } else if (w.phase === 'victory') this.finish(true);
  }
}
