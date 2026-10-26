import { SHIPS } from '../sim/config';
import type { ShipId } from '../sim/types';
import { UPGRADE_BY_ID, type UpgradeDef } from '../sim/upgrades';
import type { World } from '../sim/world';
import type { Meta, Settings } from '../meta';

const RARITY: Record<string, string> = { common: 'Обычное', rare: 'Редкое', epic: 'Эпическое' };

function h(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLDivElement;
}

export interface TitleHandlers {
  play(ship: ShipId): void;
  settings(): void;
  help(): void;
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
        const locked = !meta.unlocked.includes(id);
        const col = '#' + s.color.toString(16).padStart(6, '0');
        return `<button class="ship ${id === selected ? 'sel' : ''} ${locked ? 'locked' : ''}" data-ship="${id}" style="--c:${col}" ${locked ? 'disabled' : ''}>
          <div class="ship-name">${s.name}</div>
          <div class="ship-desc">${locked ? '🔒 ' + s.unlock : s.desc}</div>
          <div class="ship-stats">${locked ? '' : `ПРЧ ${s.stats.maxHp} · СКР ${s.stats.speed} · ТЕМП ${s.stats.fireRate}`}</div>
        </button>`;
      })
      .join('');
    const node = h(`<div class="screen title">
      <div class="logo" data-text="ПЕРЕГРУЗКА">ПЕРЕГРУЗКА</div>
      <div class="tagline">Сеть атакована. Ты — последний процесс-защитник.</div>
      <div class="ships">${ships}</div>
      <button class="btn primary" data-act="play">▶ В БОЙ</button>
      <div class="menu-row">
        <button class="btn" data-act="help">Управление</button>
        <button class="btn" data-act="settings">Настройки</button>
      </div>
      <div class="records">Рекорд: <b>${meta.best.toLocaleString('ru-RU')}</b> · Забегов: ${meta.runs} · Побед: ${meta.wins} · Уничтожено: ${meta.kills.toLocaleString('ru-RU')} · Достижения: ${meta.achievements.length}/12</div>
      <div class="attract-note">На фоне играет ИИ-автопилот</div>
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
    this.mount(node, (e) => {
      if (e.code === 'Enter' || e.code === 'Space') hs.play(ship);
    });
  }

  help(back: () => void): void {
    const node = h(`<div class="screen panel">
      <h2>Управление</h2>
      <div class="controls">
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>движение (работает на любой раскладке)</span></div>
        <div><kbd>Мышь</kbd><span>прицел</span></div>
        <div><kbd>ЛКМ</kbd><span>огонь (удерживать) · <kbd>F</kbd> — автоогонь</span></div>
        <div><kbd>Пробел</kbd><kbd>ПКМ</kbd><span>рывок — неуязвимость на время рывка</span></div>
        <div><kbd>Q</kbd><span>ЭМИ-волна: заряжается от собранных данных</span></div>
        <div><kbd>Esc</kbd><span>пауза</span></div>
        <div><kbd>🎮</kbd><span>геймпад: стики, A — рывок, RB — ЭМИ</span></div>
      </div>
      <p class="hint">Красные полосы и лазеры на полу — предупреждения об атаке. Уходи рывком.</p>
      <button class="btn primary" data-act="back">Назад</button>
    </div>`);
    node.querySelector('[data-act=back]')!.addEventListener('click', back);
    this.mount(node, (e) => e.code === 'Escape' && back());
  }

  settings(s: Settings, onChange: (s: Settings) => void, back: () => void): void {
    const node = h(`<div class="screen panel">
      <h2>Настройки</h2>
      <label class="set">Музыка <input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></label>
      <label class="set">Звуки <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="set">Тряска экрана <input type="range" min="0" max="1.5" step="0.1" data-k="shake" value="${s.shake}"></label>
      <label class="set">Качество графики
        <select data-k="quality">
          <option value="high" ${s.quality === 'high' ? 'selected' : ''}>Высокое</option>
          <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Среднее</option>
          <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Низкое</option>
        </select></label>
      <label class="set chk"><input type="checkbox" data-k="autoFire" ${s.autoFire ? 'checked' : ''}> Автоогонь</label>
      <label class="set chk"><input type="checkbox" data-k="damageNumbers" ${s.damageNumbers ? 'checked' : ''}> Цифры урона</label>
      <label class="set chk"><input type="checkbox" data-k="showFps" ${s.showFps ? 'checked' : ''}> Счётчик FPS</label>
      <button class="btn primary" data-act="back">Готово</button>
    </div>`);
    node.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Settings;
        const v = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? inp.checked : inp instanceof HTMLInputElement ? parseFloat(inp.value) : inp.value;
        (s as unknown as Record<string, unknown>)[k] = v;
        onChange(s);
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
        return `<button class="card ${u.rarity}" data-id="${u.id}" style="--d:${i * 0.08}s">
          <div class="card-key">${i + 1}</div>
          <div class="card-icon">${u.icon}</div>
          <div class="card-name">${u.name}</div>
          <div class="card-desc">${u.desc}</div>
          <div class="card-lvl">${'◆'.repeat(lvl + 1)}${'◇'.repeat(Math.max(0, u.max - lvl - 1))}</div>
          <div class="card-tags">${u.tags.map((t) => `<span class="tag ${ownedTags.has(t) ? 'syn' : ''}">${t}</span>`).join('')}</div>
          <div class="card-rarity">${RARITY[u.rarity]}</div>
        </button>`;
      })
      .join('');
    const node = h(`<div class="screen upgrades">
      <div class="up-title">${w.isBoss ? 'ТРОФЕЙ БОССА' : 'СЕКТОР ЗАЧИЩЕН'}</div>
      <div class="up-sub">Выбери модуль · клавиши 1–3</div>
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
      <h2>ПАУЗА</h2>
      <button class="btn primary" data-act="resume">Продолжить</button>
      <button class="btn" data-act="settings">Настройки</button>
      <button class="btn danger" data-act="quit">Выйти в меню</button>
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
    const acc = r.shots ? Math.round((r.damageDealt / Math.max(1, r.shots * w.stats.damage)) * 100) : 0;
    const node = h(`<div class="screen end ${victory ? 'win' : 'lose'}">
      <div class="end-title" data-text="${victory ? 'СИСТЕМА СПАСЕНА' : 'ПРОЦЕСС ЗАВЕРШЁН'}">${victory ? 'СИСТЕМА СПАСЕНА' : 'ПРОЦЕСС ЗАВЕРШЁН'}</div>
      <div class="end-sub">${victory ? 'Нулевой день устранён. Сеть свободна.' : `Сектор ${w.sector + 1}, ${w.isBoss ? 'бой с боссом' : 'волна ' + (w.wave + 1)}`}</div>
      <div class="end-score">${r.score.toLocaleString('ru-RU')}${newBest ? '<span class="best">НОВЫЙ РЕКОРД</span>' : ''}</div>
      <div class="end-stats">
        <div><b>${r.kills}</b>уничтожено</div>
        <div><b>${mins}:${secs}</b>время</div>
        <div><b>${r.maxCombo}</b>макс. комбо</div>
        <div><b>${r.bossesKilled}</b>боссов</div>
        <div><b>${Math.round(r.damageDealt).toLocaleString('ru-RU')}</b>урона</div>
        <div><b>${acc}%</b>эффективность</div>
      </div>
      ${unlocks.map((u) => `<div class="unlock">🔓 ${u}</div>`).join('')}
      <div class="menu-row">
        <button class="btn primary" data-act="again">Ещё раз</button>
        <button class="btn" data-act="menu">В меню</button>
      </div>
    </div>`);
    node.querySelector('[data-act=again]')!.addEventListener('click', again);
    node.querySelector('[data-act=menu]')!.addEventListener('click', menu);
    this.mount(node, (e) => {
      if (e.code === 'Enter' || e.code === 'KeyR') again();
    });
  }
}
