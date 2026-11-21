import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Served from https://liam-ohalloran.github.io/halo/
// `vite build --mode desktop` (card 25) builds only the app page, with relative paths, into dist-desktop for the
// Halo desktop app to load from inside itself (works offline).
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop'
  return {
    base: desktop ? './' : '/halo/',
    // The desktop app's Rust build folder changes constantly and holds locked files. Vite must not watch it.
    server: { watch: { ignored: ['**/desktop/src-tauri/**'] } },
    build: {
      outDir: desktop ? 'dist-desktop' : 'dist',
      rollupOptions: { input: desktop ? { main: resolve(__dirname, 'index.html') } : {
        main: resolve(__dirname, 'index.html'),
        foundations: resolve(__dirname, 'foundations/index.html'),
        components: resolve(__dirname, 'components/index.html'),
        motion: resolve(__dirname, 'motion/index.html'),
        study: resolve(__dirname, 'study/index.html'),
        sixers: resolve(__dirname, 'sixers/index.html'),
        install: resolve(__dirname, 'install/index.html'),
        island: resolve(__dirname, 'island/index.html'),
      } },
      target: 'es2022', cssMinify: true, sourcemap: false,
    },
  }
})
