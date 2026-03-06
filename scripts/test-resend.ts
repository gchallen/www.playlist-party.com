#!/usr/bin/env bun
/**
 * Standalone Resend integration test.
 * Sends a configurable number of real emails using the same fetch logic as email-queue.ts.
 *
 * Usage:
 *   bun scripts/test-resend.ts [count]
 *
 * Environment (via .env or shell):
 *   RESEND_API_KEY     — required
 *   RESEND_FROM_EMAIL  — defaults to noreply@playlist-party.com
 *   TEST_RECIPIENT     — defaults to geoffrey.challen@gmail.com
 */

const count = parseInt(process.argv[2] || '3', 10);
const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@playlist-party.com';
const recipient = process.env.TEST_RECIPIENT || 'geoffrey.challen@gmail.com';

if (!apiKey) {
	console.error('RESEND_API_KEY is required. Set it in .env or your environment.');
	process.exit(1);
}

console.log(`Sending ${count} test emails to ${recipient} from ${fromEmail}\n`);

const RETRY_DELAYS_MS = [1000, 3000, 9000];
const MAX_RETRIES = 3;
const INTER_EMAIL_DELAY_MS = 550; // Resend allows 2 req/s

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOne(index: number): Promise<{ ok: boolean; error?: string; retries: number }> {
	const body = {
		from: fromEmail,
		to: recipient,
		subject: `Resend test ${index + 1}/${count} — ${new Date().toISOString()}`,
		html: `<p>Test email <strong>${index + 1} of ${count}</strong></p><p>Sent at ${new Date().toISOString()}</p>`
	};

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const start = Date.now();
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const elapsed = Date.now() - start;
		const text = await res.text();

		if (res.ok) {
			const data = JSON.parse(text);
			console.log(`  [${index + 1}] sent (${elapsed}ms, attempt ${attempt + 1}) id=${data.id}`);
			return { ok: true, retries: attempt };
		}

		const isRetryable = res.status === 429 || res.status >= 500;
		console.log(
			`  [${index + 1}] ${res.status} (${elapsed}ms, attempt ${attempt + 1})${isRetryable ? ' — retrying' : ' — fatal'}: ${text}`
		);

		if (!isRetryable || attempt === MAX_RETRIES - 1) {
			return { ok: false, error: `${res.status}: ${text}`, retries: attempt };
		}

		const delay = RETRY_DELAYS_MS[attempt] ?? 9000;
		console.log(`  [${index + 1}] waiting ${delay}ms before retry...`);
		await sleep(delay);
	}

	return { ok: false, error: 'exhausted retries', retries: MAX_RETRIES };
}

const results: Awaited<ReturnType<typeof sendOne>>[] = [];
const overallStart = Date.now();

for (let i = 0; i < count; i++) {
	results.push(await sendOne(i));
	if (i < count - 1) {
		await sleep(INTER_EMAIL_DELAY_MS);
	}
}

const elapsed = Date.now() - overallStart;
const succeeded = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const totalRetries = results.reduce((sum, r) => sum + r.retries, 0);

console.log(`\nDone in ${elapsed}ms: ${succeeded} sent, ${failed} failed, ${totalRetries} total retries`);

if (failed > 0) {
	console.log('\nFailures:');
	results.forEach((r, i) => {
		if (!r.ok) console.log(`  [${i + 1}] ${r.error}`);
	});
	process.exit(1);
}
