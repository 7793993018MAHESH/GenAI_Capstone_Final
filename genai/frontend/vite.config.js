import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // NOTE: All API calls use http://localhost:8000 directly (no /api prefix)
    // so the proxy below is for future refactoring — not currently active.
    proxy: { '/api': { target: 'http://localhost:8000', rewrite: (path) => path.replace(/^\/api/, '') } }
  }
})
