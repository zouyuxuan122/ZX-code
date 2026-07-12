import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/__tests__/setup.ts'],
    include: [
      'src/renderer/src/__tests__/**/*.test.{ts,tsx}',
      'src/main/__tests__/**/*.test.{ts,tsx}',
      'src/main/services/__tests__/**/*.test.{ts,tsx}',
      'src/main/tools/__tests__/**/*.test.{ts,tsx}',
      'src/main/tools/builtin/__tests__/**/*.test.{ts,tsx}',
      'src/main/ipc/__tests__/**/*.test.{ts,tsx}',
      'src/main/agent/__tests__/**/*.test.{ts,tsx}',
      'src/main/database/__tests__/**/*.test.{ts,tsx}',
    ],
    css: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
})
