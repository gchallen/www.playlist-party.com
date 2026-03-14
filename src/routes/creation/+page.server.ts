import creationLog from '$lib/data/creation-log.json';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { creationLog };
};
