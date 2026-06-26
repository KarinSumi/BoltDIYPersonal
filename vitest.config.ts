import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'node:sqlite': path.resolve(__dirname, 'src/__mocks__/node-sqlite.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'daemon/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
  },
})
