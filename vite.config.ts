import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@dimforge')) return 'rapier';
          if (id.includes('three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
