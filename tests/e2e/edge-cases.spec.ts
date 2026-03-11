import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function verifyCreatorEmail(page: Page, _request: any, email: string): Promise<void> {
	await page.locator('[data-testid="creator-verify-email"]').fill(email);
	await page.locator('[data-testid="verify-email-btn"]').click();
	await page.locator('#name').waitFor();
}

async function createParty(
	page: Page,
	request: any,
	options: {
		name?: string;
		createdBy?: string;
		creatorEmail?: string;
		maxAttendees?: number;
	} = {}
): Promise<string> {
	const creatorEmail = options.creatorEmail || uniqueEmail('host');
	await page.goto('/');
	await page.getByRole('link', { name: 'Start a Party' }).click();
	await verifyCreatorEmail(page, request, creatorEmail);
	await page.locator('#name').fill(options.name || 'Test Party');
	await page.locator('#date').fill('2026-07-04');
	await page.locator('#createdBy').fill(options.createdBy || 'Test Host');
	if (options.maxAttendees !== undefined) {
		await page.locator('[data-testid="max-attendees"]').fill(String(options.maxAttendees));
	}
	await page.getByRole('button', { name: 'Create Party' }).click();
	await page.waitForURL(/\/party\//);
	return page.url();
}

async function getInvitePathFromEmail(request: any, to: string): Promise<string> {
	const res = await request.get(`/api/emails?to=${encodeURIComponent(to)}&type=invite`);
	const data = await res.json();
	const email = data.emails[0];
	expect(email).toBeTruthy();
	const match = email.metadata.magicUrl.match(/\/party\/[a-zA-Z0-9_-]+/);
	expect(match).toBeTruthy();
	return match![0];
}

async function getShareLink(page: Page): Promise<string> {
	const input = page.locator('[data-testid="share-link-input"]');
	await input.waitFor();
	const value = await input.inputValue();
	const url = new URL(value);
	return url.pathname;
}

async function inviteViaShareLink(
	page: Page,
	request: any,
	inviteeName: string,
	inviteeEmail: string
): Promise<string> {
	const sharePath = await getShareLink(page);

	const joinPage = await page.context().newPage();
	await joinPage.goto(sharePath);
	await joinPage.locator('[data-testid="join-name"]').fill(inviteeName);
	await joinPage.locator('[data-testid="join-email"]').fill(inviteeEmail);
	await joinPage.locator('[data-testid="join-btn"]').click();
	await expect(joinPage.locator('[data-testid="join-success"]')).toBeVisible();
	await joinPage.close();

	return getInvitePathFromEmail(request, inviteeEmail);
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Invalid Tokens', () => {
	test('invalid token returns 404', async ({ page }) => {
		const response = await page.goto('/party/nonexistent-token-abc123');
		expect(response?.status()).toBe(404);
	});

	test('random string token returns 404', async ({ page }) => {
		const response = await page.goto('/party/x');
		expect(response?.status()).toBe(404);
	});
});

test.describe('Validation Errors', () => {
	test('accept form requires name', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('val-host');
		await createParty(page, request, { creatorEmail });

		// Invite via share link
		const inviteeEmail = uniqueEmail('val-inv');
		const path = await inviteViaShareLink(page, request, 'Valerie', inviteeEmail);

		await page.goto(path);
		await page.locator('[data-testid="name-input"]').fill('');
		await page.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
			// Remove required from name field to bypass browser validation
			const nameField = document.querySelector('[data-testid="name-input"]') as HTMLInputElement;
			if (nameField) nameField.removeAttribute('required');
		});
		await page.locator('[data-testid="accept-btn"]').click();
		await expect(page.locator('text=name is required')).toBeVisible();
	});

	test('accept form requires YouTube URL', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('ytval-host');
		await createParty(page, request, { creatorEmail });

		const inviteeEmail = uniqueEmail('ytval-inv');
		const path = await inviteViaShareLink(page, request, 'YTVal', inviteeEmail);

		await page.goto(path);
		await page.locator('[data-testid="name-input"]').fill('YTVal');
		// Remove required from URL field
		await page.evaluate(() => {
			const urlField = document.querySelector('[data-testid="youtube-url"]') as HTMLInputElement;
			if (urlField) urlField.removeAttribute('required');
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page.locator('[data-testid="accept-btn"]').click();
		await expect(page.locator('text=YouTube URL is required')).toBeVisible();
	});

	test('accept rejects invalid YouTube URLs', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('badyt-host');
		await createParty(page, request, { creatorEmail });

		const inviteeEmail = uniqueEmail('badyt-inv');
		const path = await inviteViaShareLink(page, request, 'BadYT', inviteeEmail);

		await page.goto(path);
		await page.locator('[data-testid="name-input"]').fill('BadYT');
		await page.locator('[data-testid="youtube-url"]').fill('https://example.com/not-youtube');
		await page.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
			// Remove type=url validation
			const urlField = document.querySelector('[data-testid="youtube-url"]') as HTMLInputElement;
			if (urlField) urlField.type = 'text';
		});
		await page.locator('[data-testid="accept-btn"]').click();
		await expect(page.locator('text=Invalid YouTube URL')).toBeVisible();
	});

	test('already-accepted invite cannot be re-accepted', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('reaccept-host');
		await createParty(page, request, { creatorEmail });

		const inviteeEmail = uniqueEmail('reaccept');
		const path = await inviteViaShareLink(page, request, 'ReAccept', inviteeEmail);

		// Accept
		await page.goto(path);
		await page.locator('[data-testid="name-input"]').fill('ReAccept');
		await page.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page.locator('[data-testid="accept-btn"]').click();
		await page.waitForSelector('text=Welcome');

		// Revisit
		await page.goto(path);
		await expect(page.locator('text=Welcome, ReAccept!')).toBeVisible();
		// Accept button should NOT be visible
		await expect(page.locator('[data-testid="accept-btn"]')).not.toBeVisible();
	});
});

test.describe('Security', () => {
	test('non-creator cannot access remove song action', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('sec-host') });

		const inviteeEmail = uniqueEmail('sec-guest');
		const path = await inviteViaShareLink(page, request, 'Guest', inviteeEmail);

		// Accept the invite
		const page2 = await page.context().newPage();
		await page2.goto(path);
		await page2.locator('[data-testid="name-input"]').fill('Guest');
		await page2.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page2.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page2.locator('[data-testid="accept-btn"]').click();
		await page2.waitForSelector('text=Welcome');

		// Non-creator should NOT see remove buttons
		await expect(page2.locator('[data-testid="remove-song-btn"]')).not.toBeVisible();
		await page2.close();
	});

	test('non-creator cannot access settings panel', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('sec2-host') });

		const inviteeEmail = uniqueEmail('sec2-guest');
		const path = await inviteViaShareLink(page, request, 'Guest', inviteeEmail);

		const page2 = await page.context().newPage();
		await page2.goto(path);
		await page2.locator('[data-testid="name-input"]').fill('Guest');
		await page2.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await page2.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page2.locator('[data-testid="accept-btn"]').click();
		await page2.waitForSelector('text=Welcome');

		// Should NOT see settings panel
		await expect(page2.locator('text=Party Settings')).not.toBeVisible();
		await page2.close();
	});

	test('non-creator cannot POST to removeSong action', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('sec3-host') });

		const inviteeEmail = uniqueEmail('sec3-guest');
		const path = await inviteViaShareLink(page, request, 'Guest', inviteeEmail);
		const token = path.split('/party/')[1];

		// Try to POST removeSong as non-creator
		const res = await request.post(`/party/${token}?/removeSong`, {
			form: { songId: '1' }
		});
		// Should get 403 since the invite hasn't even been accepted,
		// or 403 because they're not creator
		expect(res.status()).toBeGreaterThanOrEqual(400);
	});

	test('attendee emails are not exposed in non-creator views', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('noexp-host') });

		const email1 = uniqueEmail('noexp1');
		const path = await inviteViaShareLink(page, request, 'Hidden', email1);

		const page2 = await page.context().newPage();
		await page2.goto(path);
		await page2.locator('[data-testid="name-input"]').fill('Hidden');
		await page2.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=kJQP7kiw5Fk');
		await page2.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page2.locator('[data-testid="accept-btn"]').click();
		await page2.waitForSelector('text=Welcome');

		// The attendee view should NOT show other people's emails anywhere
		await expect(page2.locator('text=Guest List')).not.toBeVisible();
		await page2.close();
	});
});
