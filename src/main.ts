import './style.css';
import { Game } from './game';

const root = document.getElementById('app')!;
const game = new Game(root);
// Debug/automation handle (used by Playwright tests).
(window as unknown as { __game: Game }).__game = game;

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => undefined));
}
