import { SECTOR_INFO, WAVES_PER_SECTOR } from '../sim/config';
import { enemyName, num, sectorText, tr } from '../i18n';
import type { World } from '../sim/world';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class Hud {
  readonly root: HTMLDivElement;
  private hp: HTMLDivElement;
  private shield: HTMLDivElement;
  private dash: HTMLDivElement;
  private empFill: HTMLDivElement;
  private empLabel: HTMLDivElement;
  private score: HTMLDivElement;
  private combo: HTMLDivElement;
  private comboBar: HTMLDivElement;
  private wave: HTMLDivElement;
  private bossWrap: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossTrail: HTMLDivElement;
  private banner: HTMLDivElement;
  private fps: HTMLDivElement;
  private toasts: HTMLDivElement;
  private lastKey = '';
  private bannerT = 0;
  private shownScore = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  showFps = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const left = el('div', 'hud-left', this.root);
    this.hp = el('div', 'hp', left);
    this.shield = el('div', 'shield', left);
    const row = el('div', 'hud-row', left);
    this.dash = el('div', 'dash', row);
    const emp = el('div', 'emp', row);
    this.empLabel = el('div', 'emp-label', emp);
    const bar = el('div', 'emp-bar', emp);
    this.empFill = el('div', 'emp-fill', bar);

    const right = el('div', 'hud-right', this.root);
    this.score = el('div', 'score', right, '0');
    this.combo = el('div', 'combo', right);
    const cb = el('div', 'combo-bar', right);
    this.comboBar = el('div', 'combo-fill', cb);

    this.wave = el('div', 'wave', this.root);
    this.bossWrap = el('div', 'boss', this.root);
    this.bossName = el('div', 'boss-name', this.bossWrap);
    const bb = el('div', 'boss-bar', this.bossWrap);
    this.bossTrail = el('div', 'boss-trail', bb);
    this.bossFill = el('div', 'boss-fill', bb);
    this.banner = el('div', 'banner', this.root);
    this.fps = el('div', 'fps', this.root);
    this.toasts = el('div', 'toasts', parent);
  }

  toast(title: string, sub: string): void {
    const t = el('div', 'toast', this.toasts, `<div class="t-icon">🏆</div><div><div class="t-title">${title}</div><div class="t-sub">${sub}</div></div>`);
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  showBanner(title: string, sub: string, cls = ''): void {
    this.banner.className = 'banner show ' + cls;
    this.banner.innerHTML = `<div class="b-title">${title}</div><div class="b-sub">${sub}</div>`;
    this.bannerT = 2.6;
  }

  waveBanner(w: World): void {
    const info = sectorText(w.sector);
    if (w.isBoss) {
      const name = enemyName(SECTOR_INFO[w.sector].boss);
      this.showBanner(`⚠ ${name} ⚠`, tr('Обнаружена угроза высшего уровня', 'Top-level threat detected'), 'boss');
    } else if (w.wave === 0) {
      this.showBanner(`${tr('СЕКТОР', 'SECTOR')} ${w.sector + 1}: ${info.name}`, info.sub, 'sector');
    } else {
      this.showBanner(`${tr('ВОЛНА', 'WAVE')} ${w.wave + 1}`, `${tr('из', 'of')} ${WAVES_PER_SECTOR}`, '');
    }
  }

  update(w: World, dt: number): void {
    const p = w.player;
    const s = w.stats;
    const key = `${p.hp}/${s.maxHp}/${p.shield}/${s.shieldMax}/${p.dashCharges}/${s.dashCharges}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.hp.innerHTML = Array.from({ length: s.maxHp }, (_, i) => `<i class="${i < p.hp ? 'on' : ''}"></i>`).join('');
      this.hp.classList.toggle('low', p.hp <= 2);
      this.shield.innerHTML = Array.from({ length: s.shieldMax }, (_, i) => `<i class="${i < p.shield ? 'on' : ''}"></i>`).join('');
      this.dash.innerHTML = Array.from({ length: s.dashCharges }, (_, i) => `<i class="${i < p.dashCharges ? 'on' : ''}"></i>`).join('');
    }
    this.empLabel.textContent = tr('ЭМИ [Q]', 'EMP [Q]');
    this.empFill.style.width = `${Math.round(p.empCharge * 100)}%`;
    this.empLabel.classList.toggle('ready', p.empCharge >= 1);
    this.shownScore += (w.run.score - this.shownScore) * Math.min(1, dt * 10);
    this.score.textContent = num(Math.round(this.shownScore));
    const m = w.multiplier;
    this.combo.textContent = w.combo > 1 ? `×${m}  ·  ${w.combo} ${tr('комбо', 'combo')}` : '';
    this.combo.className = 'combo m' + Math.min(m, 8);
    this.comboBar.style.width = `${Math.max(0, w.comboT / 2.5) * 100}%`;
    // After the final boss the sector counter advances past the last one; keep the label on sector 3.
    const sec = Math.min(w.sector, SECTOR_INFO.length - 1) + 1;
    const secLabel = `${tr('СЕКТОР', 'SECTOR')} ${sec}`;
    this.wave.textContent = w.isBoss || w.sector >= SECTOR_INFO.length ? `${secLabel} · ${tr('БОСС', 'BOSS')}` : `${secLabel} · ${tr('ВОЛНА', 'WAVE')} ${w.wave + 1}/${WAVES_PER_SECTOR}`;

    const boss = w.enemies.find((e) => e.type === 'hydraHead' || e.type === 'core' || e.type === 'zeroday');
    if (boss) {
      this.bossWrap.style.display = 'block';
      this.bossName.textContent = enemyName(boss.type) + (boss.gen > 0 ? `  ·  ${tr('ФАЗА', 'PHASE')} ${boss.gen + 1}` : '');
      const f = Math.max(0, boss.hp / boss.maxHp);
      this.bossFill.style.width = `${f * 100}%`;
      const trail = parseFloat(this.bossTrail.style.width || '100') / 100;
      this.bossTrail.style.width = `${Math.max(f, trail - dt * 0.25) * 100}%`;
    } else this.bossWrap.style.display = 'none';

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }
    if (this.showFps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS · ${w.enemies.length} ${tr('врагов', 'enemies')} · ${w.bullets.length} ${tr('пуль', 'bullets')}`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    } else this.fps.textContent = '';
  }
}
