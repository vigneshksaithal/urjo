import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { mockApiPlugin } from './src/dev/mock-api'

export default defineConfig({
  root: 'src/client',
  plugins: [
    svelte(),
    tailwindcss(),
    mockApiPlugin(),
  ],
  server: {
    port: 4173,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '../shared': resolve(process.cwd(), 'src/shared'),
      '../../shared': resolve(process.cwd(), 'src/shared'),
    }
  }
})
