import { defineConfig } from 'vite';

// base: './' — 빌드 결과를 어느 경로에 올려도 동작하도록 상대 경로를 쓴다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
});
