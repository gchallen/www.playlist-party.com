import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const useNode = process.env.ADAPTER === 'node';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	resolve: useNode
		? {}
		: {
				alias: {
					'better-sqlite3': `${import.meta.dirname}/src/lib/server/db/shim.ts`,
					'drizzle-orm/better-sqlite3': `${import.meta.dirname}/src/lib/server/db/shim.ts`
				}
			},
	test: {
		include: ['tests/unit/**/*.test.ts']
	}
});
