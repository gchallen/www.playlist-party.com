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

async function acceptInvite(page: Page, path: string, name?: string): Promise<void> {
	await page.goto(path);
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
	test('share link invite sends email and produces valid path', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('inv-host') });
		const inviteeEmail = uniqueEmail('invitee');
		const path = await inviteViaShareLink(page, request, 'Alice', inviteeEmail);
		expect(path).toMatch(/\/party\/[a-zA-Z0-9_-]+/);
	});

	test('invitee sees accept form with pre-filled name', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('prefill-host') });
		const inviteeEmail = uniqueEmail('prefill');
		const path = await inviteViaShareLink(page, request, 'Bob', inviteeEmail);

		await page.goto(path);
		await expect(page.locator("text=You're Invited!")).toBeVisible();
		await expect(page.locator('[data-testid="name-input"]')).toHaveValue('Bob');
	});

	test('accepting invite shows attendee dashboard', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('accept-host') });
		const inviteeEmail = uniqueEmail('accept');
		const path = await inviteViaShareLink(page, request, 'Charlie', inviteeEmail);
		await acceptInvite(page, path, 'Charlie');

		await expect(page.locator('text=Welcome, Charlie!')).toBeVisible();
		await expect(page.locator('[data-testid="song-slots"]')).toBeVisible();
	});

	test('already-accepted invite shows dashboard, not form', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dbl-host') });
		const inviteeEmail = uniqueEmail('dbl');
		const path = await inviteViaShareLink(page, request, 'Dave', inviteeEmail);
		await acceptInvite(page, path, 'Dave');

		// Revisit
		await page.goto(path);
		await expect(page.locator('text=Welcome, Dave!')).toBeVisible();
	});

	test('different invitees get unique tokens', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('uniq-host') });
		const email1 = uniqueEmail('u1');
		const email2 = uniqueEmail('u2');
		const path1 = await inviteViaShareLink(page, request, 'F1', email1);
		const path2 = await inviteViaShareLink(page, request, 'F2', email2);
		expect(path1).not.toBe(path2);
	});

	test('invite list shows accepted/pending status', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('status-host') });
		const email1 = uniqueEmail('s1');
		const email2 = uniqueEmail('s2');
		const path1 = await inviteViaShareLink(page, request, 'Accepted', email1);
		await inviteViaShareLink(page, request, 'Pending', email2);

		// Accept first invite
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, 'Accepted');
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
		await inviteViaShareLink(page, request, 'RemoveMe', inviteeEmail);

		// Reload creator page to see the invite
		await page.reload();

		// Verify invite row exists
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'RemoveMe' })).toBeVisible();

		// Click remove button
		await page
			.locator('[data-testid="invite-row"]')
			.filter({ hasText: 'RemoveMe' })
			.locator('[data-testid="remove-invite-btn"]')
			.click();

		// Verify success message and invite disappears
		await expect(page.locator('[data-testid="invite-removed-success"]')).toBeVisible();
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'RemoveMe' })).not.toBeVisible();
	});

	test('cannot remove an accepted invite (no remove button shown)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('rm-acc-host') });
		const inviteeEmail = uniqueEmail('rm-acc');
		const path = await inviteViaShareLink(page, request, 'Keeper', inviteeEmail);

		// Accept the invite
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'Keeper');
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

		// Invite via share link (uses the 1 allowed slot)
		const email1 = uniqueEmail('rm-q1');
		await inviteViaShareLink(page, request, 'First', email1);

		// Reload creator page to see invite
		await page.reload();

		// Remove it
		await page
			.locator('[data-testid="invite-row"]')
			.filter({ hasText: 'First' })
			.locator('[data-testid="remove-invite-btn"]')
			.click();
		await expect(page.locator('[data-testid="invite-removed-success"]')).toBeVisible();

		// Send a new invite — should succeed since slot was freed
		const email2 = uniqueEmail('rm-q2');
		await inviteViaShareLink(page, request, 'Second', email2);

		// Reload and verify
		await page.reload();
		await expect(page.locator('[data-testid="invite-row"]').filter({ hasText: 'Second' })).toBeVisible();
	});
});

test.describe('Decline on Behalf', () => {
	test('creator can decline a pending invite on behalf of guest', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dob-pend-host') });
		const inviteeEmail = uniqueEmail('dob-pend');
		await inviteViaShareLink(page, request, 'PendingGuest', inviteeEmail);

		// Reload creator page to see invite
		await page.reload();

		const row = page.locator('[data-testid="invite-row"]').filter({ hasText: 'PendingGuest' });
		await expect(row.locator('[data-testid="decline-on-behalf-btn"]')).toBeVisible();
		await row.locator('[data-testid="decline-on-behalf-btn"]').click();

		await expect(page.locator('[data-testid="declined-on-behalf-success"]')).toContainText('PendingGuest');
		// Status should now show Declined
		await expect(row.locator('text=Declined')).toBeVisible();
		// Decline button should no longer be visible
		await expect(row.locator('[data-testid="decline-on-behalf-btn"]')).not.toBeVisible();
	});

	test('creator can decline an accepted guest on behalf', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dob-acc-host') });
		const inviteeEmail = uniqueEmail('dob-acc');
		const path = await inviteViaShareLink(page, request, 'AcceptedGuest', inviteeEmail);

		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'AcceptedGuest');
		await page2.close();

		await page.reload();
		const row = page.locator('[data-testid="invite-row"]').filter({ hasText: 'AcceptedGuest' });
		await expect(row.locator('[data-testid="decline-on-behalf-btn"]')).toBeVisible();
		await row.locator('[data-testid="decline-on-behalf-btn"]').click();

		await expect(page.locator('[data-testid="declined-on-behalf-success"]')).toContainText('AcceptedGuest');
		// Status should now show "Can't make it"
		await expect(row.locator("text=Can't make it")).toBeVisible();
	});

	test('decline button not shown for already-declined guest', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dob-noshow-host') });
		const inviteeEmail = uniqueEmail('dob-noshow');
		await inviteViaShareLink(page, request, 'WillDecline', inviteeEmail);

		// Reload creator page to see invite
		await page.reload();

		// Decline on behalf first
		const row = page.locator('[data-testid="invite-row"]').filter({ hasText: 'WillDecline' });
		await row.locator('[data-testid="decline-on-behalf-btn"]').click();
		await expect(page.locator('[data-testid="declined-on-behalf-success"]')).toBeVisible();

		// Button should be gone
		await expect(row.locator('[data-testid="decline-on-behalf-btn"]')).not.toBeVisible();
	});
});

test.describe('Invite Chains', () => {
	test('multi-depth chains work (host → A → B)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('chain-host') });

		// Creator invites Alice via share link
		const emailA = uniqueEmail('chainA');
		const pathA = await inviteViaShareLink(page, request, 'Alice', emailA);

		// Alice accepts
		await acceptInvite(page, pathA, 'Alice');

		// Now on Alice's party page — get Alice's share link and invite Bob
		const emailB = uniqueEmail('chainB');
		const pathB = await inviteViaShareLink(page, request, 'Bob', emailB);
		await acceptInvite(page, pathB, 'Bob');

		await expect(page.locator('text=Welcome, Bob!')).toBeVisible();
	});

	test('max depth enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('depth-host'),
			maxDepth: 1
		});

		// Creator invites Alice via share link
		const emailA = uniqueEmail('depthA');
		const pathA = await inviteViaShareLink(page, request, 'Alice', emailA);

		// Alice accepts
		await acceptInvite(page, pathA, 'Alice');

		// Alice (depth 1) tries to invite Bob via her share link — should fail since maxDepth is 1
		const aliceSharePath = await getShareLink(page);
		const joinPage = await page.context().newPage();
		await joinPage.goto(aliceSharePath);
		await joinPage.locator('[data-testid="join-name"]').fill('Bob');
		await joinPage.locator('[data-testid="join-email"]').fill(uniqueEmail('depthB'));
		await joinPage.locator('[data-testid="join-btn"]').click();
		await expect(joinPage.locator('text=Maximum invite depth reached')).toBeVisible();
		await joinPage.close();
	});

	test('maxInvitesPerGuest enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('limit-host'),
			maxInvitesPerGuest: 1
		});

		// Host invites 1 via share link (at limit)
		const email1 = uniqueEmail('lim1');
		await inviteViaShareLink(page, request, 'First', email1);

		// Host tries 2nd via share link — should fail
		const sharePath = await getShareLink(page);
		const joinPage = await page.context().newPage();
		await joinPage.goto(sharePath);
		await joinPage.locator('[data-testid="join-name"]').fill('Second');
		await joinPage.locator('[data-testid="join-email"]').fill(uniqueEmail('lim2'));
		await joinPage.locator('[data-testid="join-btn"]').click();
		await expect(joinPage.locator('text=You can only send 1 invites')).toBeVisible();
		await joinPage.close();
	});

	test('max attendees enforcement', async ({ page, request }) => {
		await createParty(page, request, {
			creatorEmail: uniqueEmail('max-host'),
			maxAttendees: 2
		});

		// Host (1) + invite (2) = at capacity
		const email1 = uniqueEmail('maxA');
		await inviteViaShareLink(page, request, 'A', email1);

		// Reload — invite form should be hidden, capacity message shown
		await page.reload();
		await expect(page.locator('text=Party is at capacity')).toBeVisible();
	});
});
