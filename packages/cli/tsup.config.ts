import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  noExternal: ['@image-mainichi/node', '@image-mainichi/core'],
  banner: { js: '#!/usr/bin/env node' },
})
