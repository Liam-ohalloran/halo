import { defineConfig } from 'vite'

// Served from https://liam-ohalloran.github.io/halo/
export default defineConfig({
  base: '/halo/',
  build: { target: 'es2022', cssMinify: true, sourcemap: false },
})
