// Empty shim for better-sqlite3 in Cloudflare builds.
// This module is never called at runtime — D1 is used instead.
export default function () {
	throw new Error('better-sqlite3 is not available in Cloudflare Workers');
}
