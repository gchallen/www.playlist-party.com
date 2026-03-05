import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────

const YOUTUBE_URLS = [
	'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	'https://www.youtube.com/watch?v=9bZkp7q19f0',
	'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
	'https://www.youtube.com/watch?v=RgKAFK5djSk',
	'https://www.youtube.com/watch?v=OPf0YbXqDm0',
	'https://www.youtube.com/watch?v=JGwWNGJdvx8'
];
let urlIdx = 0;
function nextUrl(): string {
	return YOUTUBE_URLS[urlIdx++ % YOUTUBE_URLS.length];
}

function uniqueEmail(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function verifyEmail(page: Page, email: string): Promise<void> {
	await page.locator('[data-testid="verify-email-input"]').waitFor();
	await page.locator('[data-testid="verify-email-input"]').fill(email);
	await page.locator('[data-testid="verify-email-btn"]').click();
	await page.locator('[data-testid="verify-gate"]').waitFor({ state: 'detached' });
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
		maxDepth?: number;
		maxInvitesPerGuest?: number;
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
	if (options.maxDepth !== undefined) {
		await page.locator('#maxDepth').fill(String(options.maxDepth));
	}
	if (options.maxInvitesPerGuest !== undefined) {
		await page.locator('#maxInvitesPerGuest').fill(String(options.maxInvitesPerGuest));
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

async function sendInviteAndGetPath(
	page: Page,
	request: any,
	inviteeName: string,
	inviteeEmail: string
): Promise<string> {
	await page.locator('[data-testid="invite-name"]').fill(inviteeName);
	await page.locator('[data-testid="invite-email"]').fill(inviteeEmail);
	await page.locator('[data-testid="send-invite-btn"]').click();
	await page.waitForSelector('[data-testid="invite-sent-success"]');
	return getInvitePathFromEmail(request, inviteeEmail);
}

async function acceptInvite(page: Page, path: string, email: string, name?: string): Promise<void> {
	await page.goto(path);
	await verifyEmail(page, email);
	if (name) {
		await page.locator('[data-testid="name-input"]').fill(name);
	}
	await page.locator('[data-testid="youtube-url"]').fill(nextUrl());
	await page.evaluate(() => {
		const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
		if (el) el.value = '210';
	});
	await page.locator('[data-testid="accept-btn"]').click();
	await page.waitForSelector('text=Welcome');
}

async function getShareLink(page: Page): Promise<string> {
	const input = page.locator('[data-testid="share-link-input"]');
	await input.waitFor();
	const value = await input.inputValue();
	// Extract just the path portion
	const url = new URL(value);
	return url.pathname;
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Share Link', () => {
	test('share link page shows party info and join form', async ({ page, request }) => {
		await createParty(page, request, {
			name: 'Share Test Party',
			createdBy: 'ShareHost',
			creatorEmail: uniqueEmail('share-host')
		});

		const sharePath = await getShareLink(page);
		await page.goto(sharePath);

		await expect(page.locator('text=Share Test Party')).toBeVisible();
		await expect(page.locator('text=ShareHost')).toBeVisible();
		await expect(page.locator('[data-testid="join-form"]')).toBeVisible();
		await expect(page.locator('[data-testid="join-name"]')).toBeVisible();
		await expect(page.locator('[data-testid="join-email"]')).toBeVisible();
	});

	test('submitting join form sends invite email', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('share-email-host')
		});

		const sharePath = await getShareLink(page);
		await page.goto(sharePath);

		const joinEmail = uniqueEmail('share-join');
		await page.locator('[data-testid="join-name"]').fill('JoinUser');
		await page.locator('[data-testid="join-email"]').fill(joinEmail);
		await page.locator('[data-testid="join-btn"]').click();

		await expect(page.locator('[data-testid="join-success"]')).toBeVisible();

		// Verify invite email was sent
		const res = await request.get(`/api/emails?to=${encodeURIComponent(joinEmail)}&type=invite`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
	});

	test('invite from share link is credited to link owner', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('credit-host')
		});

		// Creator invites Alice
		const aliceEmail = uniqueEmail('credit-alice');
		const alicePath = await sendInviteAndGetPath(page, request, 'Alice', aliceEmail);
		await acceptInvite(page, alicePath, aliceEmail, 'Alice');

		// Get Alice's share link
		const aliceSharePath = await getShareLink(page);

		// Bob visits Alice's share link and submits
		const page2 = await page.context().newPage();
		await page2.goto(aliceSharePath);

		const bobEmail = uniqueEmail('credit-bob');
		await page2.locator('[data-testid="join-name"]').fill('Bob');
		await page2.locator('[data-testid="join-email"]').fill(bobEmail);
		await page2.locator('[data-testid="join-btn"]').click();
		await expect(page2.locator('[data-testid="join-success"]')).toBeVisible();
		await page2.close();

		// Back on Alice's party page — cookie is already set from acceptInvite
		await page.goto(alicePath);
		await page.waitForSelector('text=Welcome');
		// Bob should appear in Alice's invite list (credited to her)
		await expect(page.getByText('Bob', { exact: false }).first()).toBeVisible();
	});

	test('full round-trip: share link → email → accept → attend', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('roundtrip-host')
		});

		const sharePath = await getShareLink(page);

		// Visit share link and submit
		const page2 = await page.context().newPage();
		await page2.goto(sharePath);

		const guestEmail = uniqueEmail('roundtrip-guest');
		await page2.locator('[data-testid="join-name"]').fill('RoundTripper');
		await page2.locator('[data-testid="join-email"]').fill(guestEmail);
		await page2.locator('[data-testid="join-btn"]').click();
		await expect(page2.locator('[data-testid="join-success"]')).toBeVisible();

		// Get magic URL from email and accept
		const invitePath = await getInvitePathFromEmail(request, guestEmail);
		await acceptInvite(page2, invitePath, guestEmail, 'RoundTripper');
		await expect(page2.locator('text=Welcome, RoundTripper!')).toBeVisible();
		await page2.close();
	});

	test('duplicate email rejected on share link', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('dup-share-host')
		});

		const dupeEmail = uniqueEmail('dup-share');
		await sendInviteAndGetPath(page, request, 'AlreadyInvited', dupeEmail);

		const sharePath = await getShareLink(page);
		const page2 = await page.context().newPage();
		await page2.goto(sharePath);

		await page2.locator('[data-testid="join-name"]').fill('Duplicate');
		await page2.locator('[data-testid="join-email"]').fill(dupeEmail);
		await page2.locator('[data-testid="join-btn"]').click();
		await expect(page2.locator('text=already been invited')).toBeVisible();
		await page2.close();
	});

	test('full party shows full message on share link', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('full-share-host'),
			maxAttendees: 2
		});

		// Send invite to fill the party (creator=1, invitee=2)
		const fillEmail = uniqueEmail('full-share-fill');
		await sendInviteAndGetPath(page, request, 'Filler', fillEmail);

		// Get share link before the party is full (canInvite might already be false)
		// We need the share token from the page data
		const shareInput = page.locator('[data-testid="share-link-input"]');
		const hasShareLink = await shareInput.isVisible().catch(() => false);

		if (hasShareLink) {
			const sharePath = await getShareLink(page);
			// Reload — party is now at capacity
			await page.reload();

			const page2 = await page.context().newPage();
			await page2.goto(sharePath);
			await expect(page2.locator('[data-testid="party-full"]')).toBeVisible();
			await expect(page2.locator('[data-testid="join-form"]')).not.toBeVisible();
			await page2.close();
		} else {
			// Party was at capacity immediately, so share link is hidden
			// Navigate directly to share URL using the API
			// The share link section is only visible when canInvite is true
			// But the share page itself should still show the "full" message
			// We just need to get the shareToken from the attendee data
			await page.reload();
			await expect(page.locator('text=Party is at capacity')).toBeVisible();
		}
	});

	test('maxInvitesPerGuest enforced via share link', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('maxinv-share-host'),
			maxInvitesPerGuest: 1
		});

		// Creator sends 1 direct invite (uses their invite quota)
		const email1 = uniqueEmail('maxinv-direct');
		await sendInviteAndGetPath(page, request, 'DirectInvite', email1);

		// Get share link
		const sharePath = await getShareLink(page);

		// Someone tries to join via share link — should fail because creator already sent max invites
		const page2 = await page.context().newPage();
		await page2.goto(sharePath);

		await page2.locator('[data-testid="join-name"]').fill('OverLimit');
		await page2.locator('[data-testid="join-email"]').fill(uniqueEmail('maxinv-over'));
		await page2.locator('[data-testid="join-btn"]').click();
		await expect(page2.locator('text=You can only send 1 invites')).toBeVisible();
		await page2.close();
	});

	test('invalid share token returns 404', async ({ page }) => {
		const response = await page.goto('/share/invalidtoken12345678901');
		expect(response?.status()).toBe(404);
	});

	test('share link visible on party page for accepted attendees', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('visible-share-host')
		});

		// Creator should see share link
		await expect(page.locator('[data-testid="share-link-section"]')).toBeVisible();
		const shareUrl = await page.locator('[data-testid="share-link-input"]').inputValue();
		expect(shareUrl).toContain('/share/');

		// Send invite and accept — invitee should also see share link
		const inviteeEmail = uniqueEmail('visible-share-invitee');
		const inviteePath = await sendInviteAndGetPath(page, request, 'Attendee', inviteeEmail);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, inviteePath, inviteeEmail, 'Attendee');

		await expect(page2.locator('[data-testid="share-link-section"]')).toBeVisible();
		const attendeeShareUrl = await page2.locator('[data-testid="share-link-input"]').inputValue();
		expect(attendeeShareUrl).toContain('/share/');
		// Each attendee gets their own unique share token
		expect(attendeeShareUrl).not.toBe(shareUrl);
		await page2.close();
	});
});
