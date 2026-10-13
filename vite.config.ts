import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// En GitHub Pages de proyecto la app vive en /<nombre-del-repo>/.
// El workflow define VITE_BASE_PATH; en local queda "/".
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
