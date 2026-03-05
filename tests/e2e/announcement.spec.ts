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

async function getAnnouncementEmails(request: any, to?: string) {
	const params = new URLSearchParams({ type: 'announcement' });
	if (to) params.set('to', to);
	const res = await request.get(`/api/emails?${params}`);
	const data = await res.json();
	return data.emails;
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Announcements', () => {
	test('creator can send announcement to accepted guests', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('ann-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		// Invite and accept two guests
		const guest1Email = uniqueEmail('ann-g1');
		const guest2Email = uniqueEmail('ann-g2');
		const path1 = await sendInviteAndGetPath(page, request, 'Guest1', guest1Email);
		const path2 = await sendInviteAndGetPath(page, request, 'Guest2', guest2Email);

		await acceptInvite(page, path1, guest1Email);
		await acceptInvite(page, path2, guest2Email);

		// Go back to creator page and send announcement
		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('accepted');
		await page.locator('[data-testid="announcement-subject"]').fill('Party Update');
		await page.locator('[data-testid="announcement-message"]').fill('See you all soon!');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toContainText('2 guests');

		// Verify both guests got the email
		const emails1 = await getAnnouncementEmails(request, guest1Email);
		const emails2 = await getAnnouncementEmails(request, guest2Email);
		expect(emails1).toHaveLength(1);
		expect(emails2).toHaveLength(1);
		expect(emails1[0].subject).toBe('Party Update');
	});

	test('announcement to "accepted" skips pending guests', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('skip-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		// Invite two guests, accept only one
		const acceptedEmail = uniqueEmail('skip-acc');
		const pendingEmail = uniqueEmail('skip-pend');
		const acceptedPath = await sendInviteAndGetPath(page, request, 'AccGuest', acceptedEmail);
		await sendInviteAndGetPath(page, request, 'PendGuest', pendingEmail);

		await acceptInvite(page, acceptedPath, acceptedEmail);

		// Send announcement to accepted only
		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('accepted');
		await page.locator('[data-testid="announcement-subject"]').fill('Accepted Only');
		await page.locator('[data-testid="announcement-message"]').fill('Only for accepted');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toContainText('1 guest');

		const acceptedEmails = await getAnnouncementEmails(request, acceptedEmail);
		const pendingEmails = await getAnnouncementEmails(request, pendingEmail);
		expect(acceptedEmails).toHaveLength(1);
		expect(pendingEmails).toHaveLength(0);
	});

	test('announcement to "pending" skips accepted guests', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('pend-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		const acceptedEmail = uniqueEmail('pend-acc');
		const pendingEmail = uniqueEmail('pend-pend');
		const acceptedPath = await sendInviteAndGetPath(page, request, 'AccGuest', acceptedEmail);
		await sendInviteAndGetPath(page, request, 'PendGuest', pendingEmail);

		await acceptInvite(page, acceptedPath, acceptedEmail);

		// Send announcement to pending only
		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('pending');
		await page.locator('[data-testid="announcement-subject"]').fill('Pending Only');
		await page.locator('[data-testid="announcement-message"]').fill('Only for pending');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toContainText('1 guest');

		const acceptedEmails = await getAnnouncementEmails(request, acceptedEmail);
		const pendingEmails = await getAnnouncementEmails(request, pendingEmail);
		expect(acceptedEmails).toHaveLength(0);
		expect(pendingEmails).toHaveLength(1);
	});

	test('announcement to "all" includes pending guests', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('all-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		const acceptedEmail = uniqueEmail('all-acc');
		const pendingEmail = uniqueEmail('all-pend');
		const acceptedPath = await sendInviteAndGetPath(page, request, 'AccGuest', acceptedEmail);
		await sendInviteAndGetPath(page, request, 'PendGuest', pendingEmail);

		await acceptInvite(page, acceptedPath, acceptedEmail);

		// Send announcement to all
		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('all');
		await page.locator('[data-testid="announcement-subject"]').fill('For Everyone');
		await page.locator('[data-testid="announcement-message"]').fill('Everyone gets this');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toContainText('2 guests');

		const acceptedEmails = await getAnnouncementEmails(request, acceptedEmail);
		const pendingEmails = await getAnnouncementEmails(request, pendingEmail);
		expect(acceptedEmails).toHaveLength(1);
		expect(pendingEmails).toHaveLength(1);
	});

	test('announcement excludes declined guests', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('decl-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		const acceptedEmail = uniqueEmail('decl-acc');
		const declinedEmail = uniqueEmail('decl-dec');
		const acceptedPath = await sendInviteAndGetPath(page, request, 'AccGuest', acceptedEmail);
		const declinedPath = await sendInviteAndGetPath(page, request, 'DecGuest', declinedEmail);

		await acceptInvite(page, acceptedPath, acceptedEmail);

		// Decline the second invite
		await page.goto(declinedPath);
		await verifyEmail(page, declinedEmail);
		await page.locator('[data-testid="decline-btn"]').click();
		await page.waitForSelector('text=declined');

		// Send announcement to "all" — should still skip declined
		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('all');
		await page.locator('[data-testid="announcement-subject"]').fill('Not for declined');
		await page.locator('[data-testid="announcement-message"]').fill('Only active guests');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toContainText('1 guest');

		const declinedEmails = await getAnnouncementEmails(request, declinedEmail);
		expect(declinedEmails).toHaveLength(0);
	});

	test('non-creator cannot send announcements', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('nocr-host');
		await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		const guestEmail = uniqueEmail('nocr-guest');
		const guestPath = await sendInviteAndGetPath(page, request, 'Guest', guestEmail);

		await acceptInvite(page, guestPath, guestEmail);

		// Guest page should not have announcement form
		await expect(page.locator('[data-testid="announcement-form"]')).not.toBeVisible();
	});

	test('creator does not receive own announcement', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('self-host');
		const creatorUrl = await createParty(page, request, { creatorEmail, maxAttendees: 20 });

		const guestEmail = uniqueEmail('self-guest');
		const guestPath = await sendInviteAndGetPath(page, request, 'Guest', guestEmail);
		await acceptInvite(page, guestPath, guestEmail);

		await page.goto(creatorUrl);
		await page.locator('[data-testid="announcement-audience"]').selectOption('accepted');
		await page.locator('[data-testid="announcement-subject"]').fill('Test');
		await page.locator('[data-testid="announcement-message"]').fill('Test message');
		await page.locator('[data-testid="send-announcement-btn"]').click();

		await expect(page.locator('[data-testid="announcement-sent-success"]')).toBeVisible();

		const creatorEmails = await getAnnouncementEmails(request, creatorEmail);
		expect(creatorEmails).toHaveLength(0);
	});
});
