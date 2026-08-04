import type { SvelteConfig } from '@sveltejs/vite-plugin-svelte'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config: SvelteConfig = {
	// Keep standalone tooling (such as svelte-check) from loading Devvit's
	// build-only Vite plugin while preserving Vite's resolved config in builds.
	preprocess: vitePreprocess({ style: { configFile: false } })
}

export default config
