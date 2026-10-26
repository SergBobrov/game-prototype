import { defineConfig } from 'vite';

export default defineConfig({
  base: '/game-prototype/',
  build: { target: 'es2020', sourcemap: false },
});
