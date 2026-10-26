import { SHIPS } from '../sim/config';
import type { ShipId } from '../sim/types';
import { UPGRADE_BY_ID, type UpgradeDef } from '../sim/upgrades';
import type { World } from '../sim/world';
import type { Meta, Settings } from '../meta';
import { getLang, num, shipText, tagText, tr, upgradeText, type Lang } from '../i18n';

const rarity = (r: string): string =>
  r === 'common' ? tr('Обычное', 'Common') : r === 'rare' ? tr('Редкое', 'Rare') : tr('Эпическое', 'Epic');

function h(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLDivElement;
}

export interface TitleHandlers {
  play(ship: ShipId): void;
  settings(): void;
  help(): void;
  lang(l: Lang): void;
}

export class Screens {
  private root: HTMLDivElement;
  private current: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screens';
    parent.appendChild(this.root);
  }

  close(): void {
    if (this.current) {
      const c = this.current;
      c.classList.add('out');
      setTimeout(() => c.remove(), 250);
    }
    this.current = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  get open(): boolean {
    return this.current !== null;
  }

  private mount(node: HTMLDivElement, onKey?: (e: KeyboardEvent) => void): void {
    this.close();
    this.current = node;
    this.root.appendChild(node);
    if (onKey) {
      this.keyHandler = onKey;
      window.addEventListener('keydown', onKey);
    }
  }

  title(meta: Meta, selected: ShipId, hs: TitleHandlers): void {
    const ships = (Object.keys(SHIPS) as ShipId[])
      .map((id) => {
        const s = SHIPS[id];
        const txt = shipText(id);
        const locked = !meta.unlocked.includes(id);
        const col = '#' + s.color.toString(16).padStart(6, '0');
        return `<button class="ship ${id === selected ? 'sel' : ''} ${locked ? 'locked' : ''}" data-ship="${id}" style="--c:${col}" ${locked ? 'disabled' : ''}>
          <div class="ship-name">${txt.name}</div>
          <div class="ship-desc">${locked ? '🔒 ' + txt.unlock : txt.desc}</div>
          <div class="ship-stats">${locked ? '' : `${tr('ПРЧ', 'HP')} ${s.stats.maxHp} · ${tr('СКР', 'SPD')} ${s.stats.speed} · ${tr('ТЕМП', 'ROF')} ${s.stats.fireRate}`}</div>
        </button>`;
      })
      .join('');
    const node = h(`<div class="screen title">
      <div class="lang-switch">${(['ru', 'en'] as Lang[]).map((l) => `<button class="${l === getLang() ? 'sel' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>
      <div class="logo" data-text="${tr('ПЕРЕГРУЗКА', 'OVERLOAD')}">${tr('ПЕРЕГРУЗКА', 'OVERLOAD')}</div>
      <div class="tagline">${tr('Сеть атакована. Ты — последний процесс-защитник.', 'The network is under attack. You are the last defender process.')}</div>
      <div class="ships">${ships}</div>
      <button class="btn primary" data-act="play">${tr('▶ В БОЙ', '▶ ENGAGE')}</button>
      <div class="menu-row">
        <button class="btn" data-act="help">${tr('Управление', 'Controls')}</button>
        <button class="btn" data-act="settings">${tr('Настройки', 'Settings')}</button>
      </div>
      <div class="records">${tr('Рекорд', 'Best')}: <b>${num(meta.best)}</b> · ${tr('Забегов', 'Runs')}: ${meta.runs} · ${tr('Побед', 'Wins')}: ${meta.wins} · ${tr('Уничтожено', 'Destroyed')}: ${num(meta.kills)} · ${tr('Достижения', 'Achievements')}: ${meta.achievements.length}/12</div>
      <div class="attract-note">${tr('На фоне играет ИИ-автопилот', 'AI autopilot playing in the background')}</div>
    </div>`);
    let ship = selected;
    node.querySelectorAll<HTMLButtonElement>('.ship').forEach((b) =>
      b.addEventListener('click', () => {
        ship = b.dataset.ship as ShipId;
        node.querySelectorAll('.ship').forEach((x) => x.classList.toggle('sel', x === b));
      }),
    );
    node.querySelector('[data-act=play]')!.addEventListener('click', () => hs.play(ship));
    node.querySelector('[data-act=help]')!.addEventListener('click', () => hs.help());
    node.querySelector('[data-act=settings]')!.addEventListener('click', () => hs.settings());
    node.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => hs.lang(b.dataset.lang as Lang)));
    this.mount(node, (e) => {
      if (e.code === 'Enter' || e.code === 'Space') hs.play(ship);
    });
  }

  help(back: () => void): void {
    const node = h(`<div class="screen panel">
      <h2>${tr('Управление', 'Controls')}</h2>
      <div class="controls">
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>${tr('движение (работает на любой раскладке)', 'move (works on any keyboard layout)')}</span></div>
        <div><kbd>${tr('Мышь', 'Mouse')}</kbd><span>${tr('прицел', 'aim')}</span></div>
        <div><kbd>${tr('ЛКМ', 'LMB')}</kbd><span>${tr('огонь (удерживать)', 'fire (hold)')} · <kbd>F</kbd> — ${tr('автоогонь', 'auto-fire')}</span></div>
        <div><kbd>${tr('Пробел', 'Space')}</kbd><kbd>${tr('ПКМ', 'RMB')}</kbd><span>${tr('рывок — неуязвимость на время рывка', 'dash — invulnerable while dashing')}</span></div>
        <div><kbd>Q</kbd><span>${tr('ЭМИ-волна: заряжается от собранных данных', 'EMP blast: charged by collected data')}</span></div>
        <div><kbd>Esc</kbd><span>${tr('пауза', 'pause')}</span></div>
        <div><kbd>🎮</kbd><span>${tr('геймпад: стики, A — рывок, RB — ЭМИ', 'gamepad: sticks, A — dash, RB — EMP')}</span></div>
      </div>
      <p class="hint">${tr('Красные полосы и лазеры на полу — предупреждения об атаке. Уходи рывком.', 'Red stripes and lasers on the floor warn of an attack. Dash out of the way.')}</p>
      <button class="btn primary" data-act="back">${tr('Назад', 'Back')}</button>
    </div>`);
    node.querySelector('[data-act=back]')!.addEventListener('click', back);
    this.mount(node, (e) => e.code === 'Escape' && back());
  }

  settings(s: Settings, onChange: (s: Settings) => void, back: () => void): void {
    const node = h(`<div class="screen panel">
      <h2>${tr('Настройки', 'Settings')}</h2>
      <label class="set">${tr('Язык', 'Language')}
        <select data-k="lang">
          <option value="ru" ${s.lang === 'ru' ? 'selected' : ''}>Русский</option>
          <option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option>
        </select></label>
      <label class="set">${tr('Музыка', 'Music')} <input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></label>
      <label class="set">${tr('Звуки', 'Sound effects')} <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="set">${tr('Тряска экрана', 'Screen shake')} <input type="range" min="0" max="1.5" step="0.1" data-k="shake" value="${s.shake}"></label>
      <label class="set">${tr('Качество графики', 'Graphics quality')}
        <select data-k="quality">
          <option value="high" ${s.quality === 'high' ? 'selected' : ''}>${tr('Высокое', 'High')}</option>
          <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>${tr('Среднее', 'Medium')}</option>
          <option value="low" ${s.quality === 'low' ? 'selected' : ''}>${tr('Низкое', 'Low')}</option>
        </select></label>
      <label class="set chk"><input type="checkbox" data-k="autoFire" ${s.autoFire ? 'checked' : ''}> ${tr('Автоогонь', 'Auto-fire')}</label>
      <label class="set chk"><input type="checkbox" data-k="damageNumbers" ${s.damageNumbers ? 'checked' : ''}> ${tr('Цифры урона', 'Damage numbers')}</label>
      <label class="set chk"><input type="checkbox" data-k="showFps" ${s.showFps ? 'checked' : ''}> ${tr('Счётчик FPS', 'FPS counter')}</label>
      <button class="btn primary" data-act="back">${tr('Готово', 'Done')}</button>
    </div>`);
    node.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Settings;
        const v = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? inp.checked : inp instanceof HTMLInputElement ? parseFloat(inp.value) : inp.value;
        (s as unknown as Record<string, unknown>)[k] = v;
        onChange(s);
        // Re-render in the new language, keeping the same handlers.
        if (k === 'lang') this.settings(s, onChange, back);
      }),
    );
    node.querySelector('[data-act=back]')!.addEventListener('click', back);
    this.mount(node, (e) => e.code === 'Escape' && back());
  }

  upgrades(w: World, offer: UpgradeDef[], pick: (id: string) => void): void {
    // Tags of upgrades already owned light up on new cards: that is a synergy.
    const ownedTags = new Set<string>();
    for (const id of Object.keys(w.owned)) for (const t of UPGRADE_BY_ID[id].tags) ownedTags.add(t);
    const cards = offer
      .map((u, i) => {
        const lvl = w.owned[u.id] ?? 0;
        const txt = upgradeText(u);
        return `<button class="card ${u.rarity}" data-id="${u.id}" style="--d:${i * 0.08}s">
          <div class="card-key">${i + 1}</div>
          <div class="card-icon">${u.icon}</div>
          <div class="card-name">${txt.name}</div>
          <div class="card-desc">${txt.desc}</div>
          <div class="card-lvl">${'◆'.repeat(lvl + 1)}${'◇'.repeat(Math.max(0, u.max - lvl - 1))}</div>
          <div class="card-tags">${u.tags.map((t) => `<span class="tag ${ownedTags.has(t) ? 'syn' : ''}">${tagText(t)}</span>`).join('')}</div>
          <div class="card-rarity">${rarity(u.rarity)}</div>
        </button>`;
      })
      .join('');
    const node = h(`<div class="screen upgrades">
      <div class="up-title">${w.isBoss ? tr('ТРОФЕЙ БОССА', 'BOSS TROPHY') : tr('ВОЛНА ЗАЧИЩЕНА', 'WAVE CLEARED')}</div>
      <div class="up-sub">${tr('Выбери модуль · клавиши 1–3', 'Choose a module · keys 1–3')}</div>
      <div class="cards">${cards}</div>
    </div>`);
    let done = false;
    const choose = (id: string) => {
      if (done) return;
      done = true;
      node.querySelector(`[data-id="${id}"]`)?.classList.add('chosen');
      setTimeout(() => pick(id), 280);
    };
    node.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => b.addEventListener('click', () => choose(b.dataset.id!)));
    this.mount(node, (e) => {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (n >= 0 && offer[n]) choose(offer[n].id);
    });
  }

  pause(resume: () => void, settings: () => void, quit: () => void): void {
    const node = h(`<div class="screen panel">
      <h2>${tr('ПАУЗА', 'PAUSED')}</h2>
      <button class="btn primary" data-act="resume">${tr('Продолжить', 'Resume')}</button>
      <button class="btn" data-act="settings">${tr('Настройки', 'Settings')}</button>
      <button class="btn danger" data-act="quit">${tr('Выйти в меню', 'Quit to menu')}</button>
    </div>`);
    node.querySelector('[data-act=resume]')!.addEventListener('click', resume);
    node.querySelector('[data-act=settings]')!.addEventListener('click', settings);
    node.querySelector('[data-act=quit]')!.addEventListener('click', quit);
    this.mount(node, (e) => e.code === 'Escape' && resume());
  }

  end(w: World, victory: boolean, newBest: boolean, unlocks: string[], again: () => void, menu: () => void): void {
    const r = w.run;
    const mins = Math.floor(r.time / 60);
    const secs = Math.floor(r.time % 60).toString().padStart(2, '0');
    const modules = Object.values(w.owned).reduce((a, b) => a + b, 0);
    const title = victory ? tr('СИСТЕМА СПАСЕНА', 'SYSTEM SAVED') : tr('ПРОЦЕСС ЗАВЕРШЁН', 'PROCESS TERMINATED');
    const where = w.isBoss ? tr('бой с боссом', 'boss fight') : `${tr('волна', 'wave')} ${w.wave + 1}`;
    const node = h(`<div class="screen end ${victory ? 'win' : 'lose'}">
      <div class="end-title" data-text="${title}">${title}</div>
      <div class="end-sub">${victory ? tr('Нулевой день устранён. Сеть свободна.', 'Zero Day eliminated. The network is free.') : `${tr('Сектор', 'Sector')} ${w.sector + 1}, ${where}`}</div>
      <div class="end-score">${num(r.score)}${newBest ? `<span class="best">${tr('НОВЫЙ РЕКОРД', 'NEW BEST')}</span>` : ''}</div>
      <div class="end-stats">
        <div><b>${r.kills}</b>${tr('уничтожено', 'destroyed')}</div>
        <div><b>${mins}:${secs}</b>${tr('время', 'time')}</div>
        <div><b>${r.maxCombo}</b>${tr('макс. комбо', 'max combo')}</div>
        <div><b>${r.bossesKilled}</b>${tr('боссов', 'bosses')}</div>
        <div><b>${num(Math.round(r.damageDealt))}</b>${tr('урона', 'damage')}</div>
        <div><b>${modules}</b>${tr('модулей', 'modules')}</div>
      </div>
      ${unlocks.map((u) => `<div class="unlock">🔓 ${u}</div>`).join('')}
      <div class="menu-row">
        <button class="btn primary" data-act="again">${tr('Ещё раз', 'Play again')}</button>
        <button class="btn" data-act="menu">${tr('В меню', 'Menu')}</button>
      </div>
    </div>`);
    node.querySelector('[data-act=again]')!.addEventListener('click', again);
    node.querySelector('[data-act=menu]')!.addEventListener('click', menu);
    this.mount(node, (e) => {
      if (e.code === 'Enter' || e.code === 'KeyR') again();
    });
  }
}
