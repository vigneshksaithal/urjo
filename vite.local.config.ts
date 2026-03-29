import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/client',
  plugins: [
    svelte(),
    tailwindcss(),
  ],
  server: {
    port: 4173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '../shared': resolve(process.cwd(), 'src/shared'),
      '../../shared': resolve(process.cwd(), 'src/shared'),
    }
  }
})
