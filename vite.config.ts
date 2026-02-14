import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { devvit } from '@devvit/start/vite'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    devvit()
  ]
})
