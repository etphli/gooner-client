import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    base: './',
    root: '.',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer')
      }
    },
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: isDev,
      chunkSizeWarningLimit: 2048
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'src/main/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
              sourcemap: isDev,
              minify: !isDev,
              lib: {
                entry: 'src/main/main.ts',
                formats: ['es'],
                fileName: () => 'main.js'
              },
              rollupOptions: {
                // Bundle electron-updater so the asar works without shipping node_modules.
                // Keep optional discord-rpc external (lazy-required, not installed).
                external: ['electron', 'discord-rpc']
              }
            }
          }
        },
        preload: {
          input: 'src/main/preload.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
              sourcemap: isDev,
              minify: !isDev,
              // NOTE: vite-plugin-electron/simple forces cjs + `[name].mjs`
              // output when package.json type=module. Output is preload.mjs.
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        },
        renderer: {}
      }),
      renderer()
    ]
  };
});
