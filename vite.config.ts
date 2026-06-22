import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  },
  resolve: {
    alias: {
      '@': join(__dirname, 'ThinkCanvas-main/src/renderer/src'),
    },
  },
})
