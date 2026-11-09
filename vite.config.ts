import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = `http://localhost:${env.PORT ?? 4000}`

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: {
      port: 5173,
      // Bind all interfaces so phones on the same network/hotspot can reach it.
      host: true,
      // Same-origin in dev: the browser calls /api/*, Vite forwards it to Express.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
