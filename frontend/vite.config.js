import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const proxy = {
    '/api': {
      target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080',
      changeOrigin: true,
    },
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
      proxy,
    },
  }
})
