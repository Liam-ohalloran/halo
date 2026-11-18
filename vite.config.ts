import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Served from https://liam-ohalloran.github.io/halo/
export default defineConfig({
  base: '/halo/',
  build: {
    rollupOptions: { input: {
      main: resolve(__dirname, 'index.html'),
      foundations: resolve(__dirname, 'foundations/index.html'),
      components: resolve(__dirname, 'components/index.html'),
      motion: resolve(__dirname, 'motion/index.html'),
      study: resolve(__dirname, 'study/index.html'),
      sixers: resolve(__dirname, 'sixers/index.html'),
    } },
    target: 'es2022', cssMinify: true, sourcemap: false,
  },
})
