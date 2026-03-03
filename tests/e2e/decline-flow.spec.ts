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

async function verifyCreatorEmail(page: Page, request: any, email: string): Promise<void> {
	await page.locator('[data-testid="creator-verify-email"]').fill(email);
	await page.locator('[data-testid="verify-email-btn"]').click();
	await page.locator('[data-testid="email-sent-message"]').waitFor();

	const res = await request.get(`/api/emails?to=${encodeURIComponent(email)}&type=email_verification`);
	const data = await res.json();
	const verifyUrl = data.emails[data.emails.length - 1].metadata.verifyUrl;
	const url = new URL(verifyUrl);
	await page.goto(`/create?token=${url.searchParams.get('token')}`);
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
		const el = document.querySelector('input[name="durationSeconds"]') as HTMLInputElement;
		if (el) el.value = '210';
	});
	await page.locator('[data-testid="accept-btn"]').click();
	await page.waitForSelector('text=Welcome');
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Decline Invite', () => {
	test('pending invitee can decline', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dec-host') });
		const inviteeEmail = uniqueEmail('dec-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Alice', inviteeEmail);

		await page.goto(path);
		await verifyEmail(page, inviteeEmail);
		await page.locator('[data-testid="decline-btn"]').click();
		await expect(page.locator('text=Invitation Declined')).toBeVisible();
		await expect(page.locator('[data-testid="accept-btn"]')).not.toBeVisible();
	});

	test('declined invitee can undecline', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('undec-host') });
		const inviteeEmail = uniqueEmail('undec-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Bob', inviteeEmail);

		await page.goto(path);
		await verifyEmail(page, inviteeEmail);
		await page.locator('[data-testid="decline-btn"]').click();
		await expect(page.locator('text=Invitation Declined')).toBeVisible();

		await page.locator('[data-testid="undecline-btn"]').click();
		await expect(page.locator("text=You're Invited!")).toBeVisible();
	});

	test('decline → undecline → accept full round-trip', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('rt-host') });
		const inviteeEmail = uniqueEmail('rt-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Charlie', inviteeEmail);

		await page.goto(path);
		await verifyEmail(page, inviteeEmail);

		// Decline
		await page.locator('[data-testid="decline-btn"]').click();
		await expect(page.locator('text=Invitation Declined')).toBeVisible();

		// Undecline
		await page.locator('[data-testid="undecline-btn"]').click();
		await expect(page.locator("text=You're Invited!")).toBeVisible();

		// Accept
		await page.locator('[data-testid="name-input"]').fill('Charlie');
		await page.locator('[data-testid="youtube-url"]').fill(nextUrl());
		await page.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page.locator('[data-testid="accept-btn"]').click();
		await page.waitForSelector('text=Welcome');
		await expect(page.locator('text=Welcome, Charlie!')).toBeVisible();
	});

	test('creator does not see decline button', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('nodec-host') });
		await expect(page.locator('[data-testid="decline-btn"]')).not.toBeVisible();
	});
});

test.describe("Can't Make It", () => {
	test('accepted attendee can mark can\'t make it', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cmi-host') });
		const inviteeEmail = uniqueEmail('cmi-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Alice', inviteeEmail);
		await acceptInvite(page, path, inviteeEmail, 'Alice');

		await page.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(page.locator('[data-testid="unavailable-banner"]')).toBeVisible();
		await expect(page.locator('[data-testid="invite-form"]')).not.toBeVisible();
	});

	test('unavailable attendee can reconfirm', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('recon-host') });
		const inviteeEmail = uniqueEmail('recon-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Bob', inviteeEmail);
		await acceptInvite(page, path, inviteeEmail, 'Bob');

		await page.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(page.locator('[data-testid="unavailable-banner"]')).toBeVisible();

		await page.locator('[data-testid="reconfirm-btn"]').click();
		await expect(page.locator('text=Welcome, Bob!')).toBeVisible();
		await expect(page.locator('[data-testid="invite-form"]')).toBeVisible();
	});

	test('songs preserved after can\'t-make-it', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('songs-host') });
		const inviteeEmail = uniqueEmail('songs-invitee');
		const path = await sendInviteAndGetPath(page, request, 'Charlie', inviteeEmail);
		await acceptInvite(page, path, inviteeEmail, 'Charlie');

		// Count songs before
		const songsBefore = await page.locator('.song-card').count();

		await page.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(page.locator('[data-testid="unavailable-banner"]')).toBeVisible();

		// Reload and check songs still there
		await page.reload();
		const songsAfter = await page.locator('.song-card').count();
		expect(songsAfter).toBe(songsBefore);
	});

	test('creator does not see can\'t-make-it button', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('nocmi-host') });
		await expect(page.locator('[data-testid="cant-make-it-btn"]')).not.toBeVisible();
	});
});

test.describe('Capacity with Decline', () => {
	test('decline frees slot for new invite', async ({ page, request }) => {
		const creatorUrl = await createParty(page, request, {
			creatorEmail: uniqueEmail('cap-host'),
			maxAttendees: 2
		});

		// Invite A (creator + A = 2 = full)
		const emailA = uniqueEmail('capA');
		const pathA = await sendInviteAndGetPath(page, request, 'A', emailA);

		// Confirm party is full
		await page.reload();
		await expect(page.locator('text=Party is at capacity')).toBeVisible();

		// A declines
		const page2 = await page.context().newPage();
		await page2.goto(pathA);
		await verifyEmail(page2, emailA);
		await page2.locator('[data-testid="decline-btn"]').click();
		await expect(page2.locator('text=Invitation Declined')).toBeVisible();
		await page2.close();

		// Creator reloads — slot is freed
		await page.reload();
		await expect(page.locator('[data-testid="invite-form"]')).toBeVisible();

		// Creator can send another invite
		const emailB = uniqueEmail('capB');
		await sendInviteAndGetPath(page, request, 'B', emailB);
	});

	test('undecline blocked when party became full', async ({ page, request }) => {
		const creatorUrl = await createParty(page, request, {
			creatorEmail: uniqueEmail('full-host'),
			maxAttendees: 2
		});

		// Invite A
		const emailA = uniqueEmail('fullA');
		const pathA = await sendInviteAndGetPath(page, request, 'A', emailA);

		// A declines
		const pageA = await page.context().newPage();
		await pageA.goto(pathA);
		await verifyEmail(pageA, emailA);
		await pageA.locator('[data-testid="decline-btn"]').click();
		await expect(pageA.locator('text=Invitation Declined')).toBeVisible();

		// Creator invites B (fills the freed slot)
		await page.reload();
		const emailB = uniqueEmail('fullB');
		await sendInviteAndGetPath(page, request, 'B', emailB);

		// A tries to undecline — should fail
		await pageA.locator('[data-testid="undecline-btn"]').click();
		await expect(pageA.locator('text=no room to rejoin')).toBeVisible();
		await pageA.close();
	});

	test('reconfirm blocked when party became full', async ({ page, request }) => {
		const creatorUrl = await createParty(page, request, {
			creatorEmail: uniqueEmail('rfull-host'),
			maxAttendees: 2
		});

		// Invite + accept A
		const emailA = uniqueEmail('rfullA');
		const pathA = await sendInviteAndGetPath(page, request, 'A', emailA);
		const pageA = await page.context().newPage();
		await acceptInvite(pageA, pathA, emailA, 'A');

		// A marks can't-make-it
		await pageA.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(pageA.locator('[data-testid="unavailable-banner"]')).toBeVisible();

		// Creator invites + accepts B (fills the freed slot)
		await page.reload();
		const emailB = uniqueEmail('rfullB');
		const pathB = await sendInviteAndGetPath(page, request, 'B', emailB);
		const pageB = await page.context().newPage();
		await acceptInvite(pageB, pathB, emailB, 'B');
		await pageB.close();

		// A tries to reconfirm — should fail
		await pageA.locator('[data-testid="reconfirm-btn"]').click();
		await expect(pageA.locator('text=no room to rejoin')).toBeVisible();
		await pageA.close();
	});
});

test.describe('Creator Status Visibility', () => {
	test('invite list shows declined status', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('vis-host') });
		const inviteeEmail = uniqueEmail('vis-dec');
		const path = await sendInviteAndGetPath(page, request, 'Decliner', inviteeEmail);

		// Invitee declines
		const page2 = await page.context().newPage();
		await page2.goto(path);
		await verifyEmail(page2, inviteeEmail);
		await page2.locator('[data-testid="decline-btn"]').click();
		await expect(page2.locator('text=Invitation Declined')).toBeVisible();
		await page2.close();

		// Creator reloads and sees "Declined" in invite list
		await page.reload();
		await expect(page.locator('text=Declined').first()).toBeVisible();
	});

	test('invite list shows unavailable status', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('vis2-host') });
		const inviteeEmail = uniqueEmail('vis-unav');
		const path = await sendInviteAndGetPath(page, request, 'Unavail', inviteeEmail);

		// Invitee accepts then marks can't-make-it
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, inviteeEmail, 'Unavail');
		await page2.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(page2.locator('[data-testid="unavailable-banner"]')).toBeVisible();
		await page2.close();

		// Creator reloads and sees "Can't make it" in invite list
		await page.reload();
		await expect(page.locator("text=Can't make it").first()).toBeVisible();
	});
});
