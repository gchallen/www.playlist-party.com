// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				DB?: D1Database;
				RESEND_API_KEY?: string;
				RESEND_FROM_EMAIL?: string;
			};
		}
	}
}

export {};
