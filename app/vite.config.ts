import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Android build outputs (copies of dist/) must not trigger dev reloads
    watch: { ignored: ['**/android/**'] },
    proxy: {
      // IA /download/* has no CORS headers; on Android the app uses CapacitorHttp instead (src/spike/http.ts)
      '/ia-download': {
        target: 'https://archive.org',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/ia-download/, '/download'),
        headers: { 'User-Agent': 'PulpReader/0.1 (personal-use reader spike; dev proxy)' },
      },
    },
  },
})
