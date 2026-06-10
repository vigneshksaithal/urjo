import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { devvit } from '@devvit/start/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    devvit()
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html'),
      },
    },
  },
})
