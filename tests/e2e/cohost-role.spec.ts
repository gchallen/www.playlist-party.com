import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────

const YOUTUBE_URLS = [
	'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	'https://www.youtube.com/watch?v=9bZkp7q19f0',
	'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
	'https://www.youtube.com/watch?v=RgKAFK5djSk',
	'https://www.youtube.com/watch?v=OPf0YbXqDm0',
	'https://www.youtube.com/watch?v=JGwWNGJdvx8',
	'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
	'https://www.youtube.com/watch?v=60ItHLz5WEA'
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

async function toggleCohostForGuest(creatorPage: Page): Promise<void> {
	const btn = creatorPage.locator('[data-testid="toggle-cohost-btn"]').first();
	await btn.waitFor();
	await btn.click();
	await creatorPage.waitForSelector('[data-testid="cohost-toggled-success"]');
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Co-Host Role', () => {
	test('creator can toggle co-host status on accepted attendee', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-toggle-host') });

		const email = uniqueEmail('cohost-toggle-guest');
		const path = await inviteViaShareLink(page, request, 'CohostGuest', email);
		const guestPage = await page.context().newPage();
		await acceptInvite(guestPage, path, 'CohostGuest');
		await guestPage.close();

		// Reload creator page to see the guest in invites
		await page.reload();

		// Toggle co-host on
		const toggleBtn = page.locator('[data-testid="toggle-cohost-btn"]').first();
		await expect(toggleBtn).toBeVisible();
		await expect(toggleBtn).toContainText('Make Co-Host');
		await toggleBtn.click();
		await page.waitForSelector('[data-testid="cohost-toggled-success"]');

		// Button should now show "Co-Host"
		await page.reload();
		const updatedBtn = page.locator('[data-testid="toggle-cohost-btn"]').first();
		await expect(updatedBtn).toContainText('Co-Host');

		// Toggle co-host off
		await updatedBtn.click();
		await page.waitForSelector('[data-testid="cohost-toggled-success"]');
		await page.reload();
		await expect(page.locator('[data-testid="toggle-cohost-btn"]').first()).toContainText('Make Co-Host');
	});

	test('co-host sees settings panel and can update settings', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-settings-host') });

		const email = uniqueEmail('cohost-settings-guest');
		const path = await inviteViaShareLink(page, request, 'CohostSettings', email);
		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path, 'CohostSettings');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Reload co-host page — settings panel should be visible
		await cohostPage.reload();
		await expect(cohostPage.locator('text=Party Settings')).toBeVisible();

		// Co-host can save settings
		await cohostPage.locator('[data-testid="song-attribution"]').selectOption('visible');
		await cohostPage.getByRole('button', { name: 'Save Settings' }).click();
		await expect(cohostPage.locator('text=Settings updated!')).toBeVisible();

		await cohostPage.close();
	});

	test('co-host sees guest tree', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-tree-host') });

		const email = uniqueEmail('cohost-tree-guest');
		const path = await inviteViaShareLink(page, request, 'CohostTree', email);
		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path, 'CohostTree');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Reload co-host page — guest tree should be visible
		await cohostPage.reload();
		await expect(cohostPage.locator('text=Guest Tree')).toBeVisible();

		await cohostPage.close();
	});

	test('co-host can lock and unlock playlist', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-lock-host') });

		const email = uniqueEmail('cohost-lock-guest');
		const path = await inviteViaShareLink(page, request, 'CohostLock', email);
		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path, 'CohostLock');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Reload co-host page — lock button should be visible
		await cohostPage.reload();
		const lockBtn = cohostPage.locator('[data-testid="lock-playlist-btn"]');
		await expect(lockBtn).toBeVisible();
		await lockBtn.click();

		// Verify locked
		await cohostPage.reload();
		await expect(cohostPage.locator('[data-testid="playlist-locked-badge"]')).toBeVisible();

		// Unlock
		const unlockBtn = cohostPage.locator('[data-testid="unlock-playlist-btn"]');
		await expect(unlockBtn).toBeVisible();
		await unlockBtn.click();

		await cohostPage.reload();
		await expect(cohostPage.locator('[data-testid="playlist-locked-badge"]')).not.toBeVisible();

		await cohostPage.close();
	});

	test('co-host cannot promote other co-hosts', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-nopromo-host') });

		const email1 = uniqueEmail('cohost-nopromo1');
		const path1 = await inviteViaShareLink(page, request, 'Cohost1', email1);
		const email2 = uniqueEmail('cohost-nopromo2');
		const path2 = await inviteViaShareLink(page, request, 'Guest2', email2);

		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path1, 'Cohost1');

		const guest2Page = await page.context().newPage();
		await acceptInvite(guest2Page, path2, 'Guest2');
		await guest2Page.close();

		// Make Cohost1 a co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Co-host page should NOT show toggle-cohost buttons
		await cohostPage.reload();
		await expect(cohostPage.locator('[data-testid="toggle-cohost-btn"]')).toHaveCount(0);

		await cohostPage.close();
	});

	test('promoting to co-host clears DJ status', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-cleardj-host') });

		const email = uniqueEmail('cohost-cleardj');
		const path = await inviteViaShareLink(page, request, 'DJToCohost', email);
		const guestPage = await page.context().newPage();
		await acceptInvite(guestPage, path, 'DJToCohost');

		// Make DJ first
		await page.reload();
		const djBtn = page.locator('[data-testid="toggle-dj-btn"]').first();
		await djBtn.click();
		await page.waitForSelector('[data-testid="dj-toggled-success"]');

		// Verify DJ badge is shown
		await page.reload();
		await expect(page.locator('[data-testid="toggle-dj-btn"]').first()).toContainText('DJ');

		// Now promote to co-host
		const cohostBtn = page.locator('[data-testid="toggle-cohost-btn"]').first();
		await cohostBtn.click();
		await page.waitForSelector('[data-testid="cohost-toggled-success"]');

		// After reload, DJ toggle should be hidden (co-host supersedes DJ)
		await page.reload();
		await expect(page.locator('[data-testid="toggle-dj-btn"]')).toHaveCount(0);
		await expect(page.locator('[data-testid="toggle-cohost-btn"]').first()).toContainText('Co-Host');

		await guestPage.close();
	});

	test('co-host can toggle DJ status on guests they invited', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-toggledj-host') });

		const email1 = uniqueEmail('cohost-toggledj1');
		const path1 = await inviteViaShareLink(page, request, 'Cohost1', email1);

		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path1, 'Cohost1');

		// Make Cohost1 a co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Co-host invites Guest2 via their own share link
		await cohostPage.reload();
		const email2 = uniqueEmail('cohost-toggledj2');
		const path2 = await inviteViaShareLink(cohostPage, request, 'Guest2', email2);

		const guest2Page = await page.context().newPage();
		await acceptInvite(guest2Page, path2, 'Guest2');
		await guest2Page.close();

		// Co-host can see and click toggle-dj for Guest2 (in their myInvites)
		await cohostPage.reload();
		const djBtn = cohostPage.locator('[data-testid="toggle-dj-btn"]').first();
		await expect(djBtn).toBeVisible();
		await expect(djBtn).toContainText('Make DJ');
		await djBtn.click();
		await cohostPage.waitForSelector('[data-testid="dj-toggled-success"]');

		await cohostPage.close();
	});

	test('co-host can access live DJ screen', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-live-host') });

		const email = uniqueEmail('cohost-live');
		const path = await inviteViaShareLink(page, request, 'CohostLive', email);

		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path, 'CohostLive');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Co-host can access live screen
		const token = path.split('/party/')[1];
		const response = await cohostPage.goto(`/party/${token}/live`);
		expect(response?.status()).toBe(200);

		await cohostPage.close();
	});

	test('co-host can decline guests on behalf', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-decline-host') });

		const email1 = uniqueEmail('cohost-decline1');
		const path1 = await inviteViaShareLink(page, request, 'Cohost1', email1);

		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path1, 'Cohost1');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Co-host invites Target via their own share link
		await cohostPage.reload();
		const email2 = uniqueEmail('cohost-decline2');
		const path2 = await inviteViaShareLink(cohostPage, request, 'Target', email2);

		const targetPage = await page.context().newPage();
		await acceptInvite(targetPage, path2, 'Target');
		await targetPage.close();

		// Co-host should see decline-on-behalf buttons for their invitees
		await cohostPage.reload();
		const declineBtn = cohostPage.locator('[data-testid="decline-on-behalf-btn"]');
		const count = await declineBtn.count();
		expect(count).toBeGreaterThanOrEqual(1);

		await cohostPage.close();
	});

	test('co-host status is cleared when marking cant-make-it', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('cohost-cantmakeit-host') });

		const email = uniqueEmail('cohost-cantmakeit');
		const path = await inviteViaShareLink(page, request, 'CohostLeave', email);
		const cohostPage = await page.context().newPage();
		await acceptInvite(cohostPage, path, 'CohostLeave');

		// Make co-host
		await page.reload();
		await toggleCohostForGuest(page);

		// Co-host marks cant-make-it (button visible since they're not the original creator)
		await cohostPage.reload();
		await cohostPage.locator('[data-testid="cant-make-it-btn"]').click();
		await expect(cohostPage.locator('[data-testid="unavailable-banner"]')).toBeVisible();

		// On creator's page, the attendee is now unavailable — co-host toggle shouldn't show
		// for unavailable attendees (status !== 'attending')
		await page.reload();
		// The toggle-cohost-btn is only shown for attending guests
		// Since the guest is now unavailable, no cohost button should appear
		await expect(page.locator('[data-testid="toggle-cohost-btn"]')).toHaveCount(0);

		await cohostPage.close();
	});
});
