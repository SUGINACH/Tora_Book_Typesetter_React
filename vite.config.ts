import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // relative base for GitHub Pages
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@parser': path.resolve(__dirname, './src/parser'),
      '@audit': path.resolve(__dirname, './src/audit'),
    },
  },

  // Worker configuration
  worker: {
    format: 'es',
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'state-vendor': ['zustand', 'immer'],
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    host: 'localhost',
    open: true,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  } as any,
});
