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

async function createParty(
	page: Page,
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
	await page.locator('#name').fill(options.name || 'Test Party');
	await page.locator('#date').fill('2026-07-04');
	await page.locator('#createdBy').fill(options.createdBy || 'Test Host');
	await page.locator('[data-testid="creator-email"]').fill(creatorEmail);
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

async function acceptInvite(page: Page, path: string, name?: string): Promise<void> {
	await page.goto(path);
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

test.describe('Song Slots', () => {
	test('attendee starts with 1 song slot (the accept song)', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('slot-host') });
		const email = uniqueEmail('slot');
		const path = await sendInviteAndGetPath(page, request, 'SlotTest', email);
		await acceptInvite(page, path, 'SlotTest');

		// Should show 1/1 songs
		await expect(page.locator('[data-testid="song-slots"]')).toContainText('1 / 1');
	});

	test('attendee gains +1 slot per invite sent', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('earn-host') });
		const emailA = uniqueEmail('earnA');
		const pathA = await sendInviteAndGetPath(page, request, 'Alice', emailA);
		await acceptInvite(page, pathA, 'Alice');

		// Alice sends an invite — should now have 2 slots
		const emailB = uniqueEmail('earnB');
		await sendInviteAndGetPath(page, request, 'Bob', emailB);

		// Reload to see updated slot count
		await page.reload();
		await expect(page.locator('[data-testid="song-slots"]')).toContainText('1 / 2');
	});

	test('attendee cannot add song when at slot limit', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('noslot-host') });
		const email = uniqueEmail('noslot');
		const path = await sendInviteAndGetPath(page, request, 'NoSlot', email);
		await acceptInvite(page, path, 'NoSlot');

		// At 1/1 — the add song form should not be visible (no slots left)
		await expect(page.locator('text=Add a Song')).not.toBeVisible();
	});

	test('creator can always add songs (unlimited)', async ({ page }) => {
		await createParty(page, { creatorEmail: uniqueEmail('unlim-host') });
		// Creator should see "Your Party" and the add song form
		await expect(page.locator('text=Your Party')).toBeVisible();
		await expect(page.locator('text=Add a Song')).toBeVisible();
	});
});

test.describe('Creator Song Management', () => {
	test('creator sees remove buttons on songs', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('rm-host') });

		// Invite and accept a guest to get a song on the playlist
		const email = uniqueEmail('rm-guest');
		const path = await sendInviteAndGetPath(page, request, 'Guest', email);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'Guest');
		await page2.close();

		// Reload creator page — should see the remove button
		await page.reload();
		await expect(page.locator('[data-testid="remove-song-btn"]').first()).toBeVisible();
	});

	test('creator can remove a song', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('del-host') });

		const email = uniqueEmail('del-guest');
		const path = await sendInviteAndGetPath(page, request, 'Guest', email);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'Guest');
		await page2.close();

		await page.reload();
		const songCountBefore = await page.locator('[data-testid="remove-song-btn"]').count();
		expect(songCountBefore).toBeGreaterThan(0);

		await page.locator('[data-testid="remove-song-btn"]').first().click();
		await page.waitForTimeout(500);

		const songCountAfter = await page.locator('[data-testid="remove-song-btn"]').count();
		expect(songCountAfter).toBe(songCountBefore - 1);
	});

	test('creator sees reorder buttons', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('reord-host') });

		// Add two guests to have multiple songs
		const email1 = uniqueEmail('reord1');
		const path1 = await sendInviteAndGetPath(page, request, 'G1', email1);
		const email2 = uniqueEmail('reord2');
		const path2 = await sendInviteAndGetPath(page, request, 'G2', email2);

		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, 'G1');
		await page2.close();

		const page3 = await page.context().newPage();
		await acceptInvite(page3, path2, 'G2');
		await page3.close();

		await page.reload();
		// Should see move down on first, move up on second
		await expect(page.locator('[data-testid="move-down-btn"]').first()).toBeVisible();
		await expect(page.locator('[data-testid="move-up-btn"]').first()).toBeVisible();
	});
});

test.describe('Creator Settings', () => {
	test('creator sees settings panel', async ({ page }) => {
		await createParty(page, { creatorEmail: uniqueEmail('settings-host') });
		await expect(page.locator('text=Party Settings')).toBeVisible();
		await expect(page.locator('[data-testid="song-attribution"]')).toBeVisible();
	});

	test('creator can update song attribution setting', async ({ page }) => {
		await createParty(page, { creatorEmail: uniqueEmail('attr-host') });

		await page.locator('[data-testid="song-attribution"]').selectOption('visible');
		await page.getByRole('button', { name: 'Save Settings' }).click();
		await page.waitForSelector('text=Settings updated');

		// Reload and verify
		await page.reload();
		const value = await page.locator('[data-testid="song-attribution"]').inputValue();
		expect(value).toBe('visible');
	});

	test('creator can update max invites per guest', async ({ page }) => {
		await createParty(page, { creatorEmail: uniqueEmail('maxinv-host') });

		await page.locator('[data-testid="max-invites-per-guest"]').fill('3');
		await page.getByRole('button', { name: 'Save Settings' }).click();
		await page.waitForSelector('text=Settings updated');

		await page.reload();
		const value = await page.locator('[data-testid="max-invites-per-guest"]').inputValue();
		expect(value).toBe('3');
	});
});

test.describe('Duplicate Song Rejection', () => {
	test('same YouTube URL cannot be added twice to a party', async ({ page, request }) => {
		await createParty(page, { creatorEmail: uniqueEmail('dupsong-host') });

		// Invite and accept first guest with a specific URL
		const email1 = uniqueEmail('dupsong1');
		const path1 = await sendInviteAndGetPath(page, request, 'First', email1);

		const page2 = await page.context().newPage();
		await page2.goto(path1);
		await page2.locator('[data-testid="name-input"]').fill('First');
		await page2.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page2.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page2.locator('[data-testid="accept-btn"]').click();
		await page2.waitForSelector('text=Welcome');
		await page2.close();

		// Invite and try to accept second guest with the SAME URL
		const email2 = uniqueEmail('dupsong2');
		const path2 = await sendInviteAndGetPath(page, request, 'Second', email2);

		const page3 = await page.context().newPage();
		await page3.goto(path2);
		await page3.locator('[data-testid="name-input"]').fill('Second');
		await page3.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page3.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page3.locator('[data-testid="accept-btn"]').click();
		await expect(page3.locator('text=already on the playlist')).toBeVisible();
		await page3.close();
	});
});
