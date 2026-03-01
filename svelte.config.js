import cloudflare from '@sveltejs/adapter-cloudflare';
import node from '@sveltejs/adapter-node';

const useNode = process.env.ADAPTER === 'node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: useNode ? node() : cloudflare()
	}
};

export default config;
