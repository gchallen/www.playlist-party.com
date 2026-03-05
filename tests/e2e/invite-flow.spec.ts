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

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Invite and Accept', () => {
	test('creator can send invite and invitee receives email', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('inv-host') });
		const inviteeEmail = uniqueEmail('invitee');
		const path = await sendInviteAndGetPath(page, request, 'Alice', inviteeEmail);
		expect(path).toMatch(/\/party\/[a-zA-Z0-9_-]+/);
	});

	test('invite link is displayed after sending', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('link-host') });
		const inviteeEmail = uniqueEmail('link-invitee');
		await page.locator('[data-testid="invite-name"]').fill('LinkTest');
		await page.locator('[data-testid="invite-email"]').fill(inviteeEmail);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.waitForSelector('[data-testid="invite-sent-success"]');

		// The invite link should be visible
		const inviteLink = page.locator('[data-testid="invite-link"]');
		await expect(inviteLink).toBeVisible();
		const href = await inviteLink.getAttribute('href');
		expect(href).toContain('/party/');
		// Should open in new tab
		const target = await inviteLink.getAttribute('target');
		expect(target).toBe('_blank');
	});

	test('invitee sees accept form with pre-filled name', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('prefill-host') });
		const inviteeEmail = uniqueEmail('prefill');
		const path = await sendInviteAndGetPath(page, request, 'Bob', inviteeEmail);

		await page.goto(path);
		await verifyEmail(page, inviteeEmail);
		await expect(page.locator('text=You\'re Invited!')).toBeVisible();
		await expect(page.locator('[data-testid="name-input"]')).toHaveValue('Bob');
	});

	test('accepting invite shows attendee dashboard', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('accept-host') });
		const inviteeEmail = uniqueEmail('accept');
		const path = await sendInviteAndGetPath(page, request, 'Charlie', inviteeEmail);
		await acceptInvite(page, path, inviteeEmail, 'Charlie');

		await expect(page.locator('text=Welcome, Charlie!')).toBeVisible();
		await expect(page.locator('[data-testid="song-slots"]')).toBeVisible();
	});

	test('already-accepted invite shows dashboard, not form', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dbl-host') });
		const inviteeEmail = uniqueEmail('dbl');
		const path = await sendInviteAndGetPath(page, request, 'Dave', inviteeEmail);
		await acceptInvite(page, path, inviteeEmail, 'Dave');

		// Revisit — session cookie has verified flag, so gate is skipped
		await page.goto(path);
		await expect(page.locator('text=Welcome, Dave!')).toBeVisible();
	});

	test('duplicate email invite is rejected', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dup-host') });
		const email = uniqueEmail('dup');
		await sendInviteAndGetPath(page, request, 'Eve', email);

		// Try same email again
		await page.locator('[data-testid="invite-name"]').fill('Eve2');
		await page.locator('[data-testid="invite-email"]').fill(email);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await expect(page.locator('text=already been invited')).toBeVisible();
	});

	test('different invitees get unique tokens', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('uniq-host') });
		const email1 = uniqueEmail('u1');
		const email2 = uniqueEmail('u2');
		const path1 = await sendInviteAndGetPath(page, request, 'F1', email1);
		const path2 = await sendInviteAndGetPath(page, request, 'F2', email2);
		expect(path1).not.toBe(path2);
	});

	test('invite list shows accepted/pending status', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('status-host') });
		const email1 = uniqueEmail('s1');
		const email2 = uniqueEmail('s2');
		const path1 = await sendInviteAndGetPath(page, request, 'Accepted', email1);
		await sendInviteAndGetPath(page, request, 'Pending', email2);

		// Accept first invite
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, email1, 'Accepted');
		await page2.close();

		// Reload creator page
		await page.reload();
		await expect(page.locator('text=Accepted').first()).toBeVisible();
		await expect(page.locator('text=Pending').first()).toBeVisible();
	});
});

test.describe('Remove Pending Invite', () => {
	test('can remove a pending invite', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('rm-host') });
		const inviteeEmail = uniqueEmail('rm-invitee');
		await sendInviteAndGetPath(page, request, 'RemoveMe', inviteeEmail);

		// Verify invite row exists
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'RemoveMe' })).toBeVisible();

		// Click remove button
		await page.locator('[data-testid="invite-row"]').filter({ hasText: 'RemoveMe' }).locator('[data-testid="remove-invite-btn"]').click();

		// Verify success message and invite disappears
		await expect(page.locator('[data-testid="invite-removed-success"]')).toBeVisible();
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'RemoveMe' })).not.toBeVisible();
	});

	test('cannot remove an accepted invite (no remove button shown)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('rm-acc-host') });
		const inviteeEmail = uniqueEmail('rm-acc');
		const path = await sendInviteAndGetPath(page, request, 'Keeper', inviteeEmail);

		// Accept the invite
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, inviteeEmail, 'Keeper');
		await page2.close();

		// Reload creator page
		await page.reload();
		const row = page.locator('[data-testid="invite-row"]').filter({ hasText: 'Keeper' });
		await expect(row).toBeVisible();
		await expect(row.locator('[data-testid="remove-invite-btn"]')).not.toBeVisible();
	});

	test('removed invite frees quota', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('rm-quota-host'),
			maxInvitesPerGuest: 1
		});

		// Send invite (uses the 1 allowed slot)
		const email1 = uniqueEmail('rm-q1');
		await sendInviteAndGetPath(page, request, 'First', email1);

		// Remove it
		await page.locator('[data-testid="invite-row"]').filter({ hasText: 'First' }).locator('[data-testid="remove-invite-btn"]').click();
		await expect(page.locator('[data-testid="invite-removed-success"]')).toBeVisible();

		// Send a new invite — should succeed since slot was freed
		const email2 = uniqueEmail('rm-q2');
		await sendInviteAndGetPath(page, request, 'Second', email2);
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'Second' })).toBeVisible();
	});
});

test.describe('Invite Chains', () => {
	test('multi-depth chains work (host → A → B)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('chain-host') });

		const emailA = uniqueEmail('chainA');
		const pathA = await sendInviteAndGetPath(page, request, 'Alice', emailA);
		await acceptInvite(page, pathA, emailA, 'Alice');

		// Alice sends invite to Bob
		const emailB = uniqueEmail('chainB');
		const pathB = await sendInviteAndGetPath(page, request, 'Bob', emailB);
		await acceptInvite(page, pathB, emailB, 'Bob');

		await expect(page.locator('text=Welcome, Bob!')).toBeVisible();
	});

	test('max depth enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('depth-host'),
			maxDepth: 1
		});

		const emailA = uniqueEmail('depthA');
		const pathA = await sendInviteAndGetPath(page, request, 'Alice', emailA);
		await acceptInvite(page, pathA, emailA, 'Alice');

		// Alice (depth 1) tries to invite — should fail since maxDepth is 1
		await page.locator('[data-testid="invite-name"]').fill('Bob');
		await page.locator('[data-testid="invite-email"]').fill(uniqueEmail('depthB'));
		await page.locator('[data-testid="send-invite-btn"]').click();
		await expect(page.locator('text=Maximum invite depth reached')).toBeVisible();
	});

	test('maxInvitesPerGuest enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('limit-host'),
			maxInvitesPerGuest: 1
		});

		// Host sends 1 invite (at limit)
		const email1 = uniqueEmail('lim1');
		await sendInviteAndGetPath(page, request, 'First', email1);

		// Host tries 2nd — should fail
		await page.locator('[data-testid="invite-name"]').fill('Second');
		await page.locator('[data-testid="invite-email"]').fill(uniqueEmail('lim2'));
		await page.locator('[data-testid="send-invite-btn"]').click();
		await expect(page.locator('text=You can only send 1 invites')).toBeVisible();
	});

	test('max attendees enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('max-host'),
			maxAttendees: 2
		});

		// Host (1) + invite (2) = at capacity
		const email1 = uniqueEmail('maxA');
		await sendInviteAndGetPath(page, request, 'A', email1);

		// Reload — invite form should be hidden, capacity message shown
		await page.reload();
		await expect(page.locator('text=Party is at capacity')).toBeVisible();
		await expect(page.locator('[data-testid="invite-form"]')).not.toBeVisible();
	});
});
