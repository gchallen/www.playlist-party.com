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
		maxDepth?: number;
		maxInvitesPerGuest?: number;
		startTime?: string;
		durationHours?: number;
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
	if (options.startTime) {
		await page.locator('#startTimeInput').fill(options.startTime);
	}
	if (options.durationHours !== undefined) {
		await page.locator('[data-testid="duration-hours"]').fill(String(options.durationHours));
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

test.describe('Song Slots', () => {
	test('attendee starts with 1 song slot (the accept song)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('slot-host') });
		const email = uniqueEmail('slot');
		const path = await inviteViaShareLink(page, request, 'SlotTest', email);
		await acceptInvite(page, path, 'SlotTest');

		// Should show 1/1 songs
		await expect(page.locator('[data-testid="song-slots"]')).toContainText('1 / 1');
	});

	test('attendee gains +1 slot per invite sent', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('earn-host') });
		const emailA = uniqueEmail('earnA');
		const pathA = await inviteViaShareLink(page, request, 'Alice', emailA);
		await acceptInvite(page, pathA, 'Alice');

		// Alice invites Bob via her share link — should now have 2 slots
		const emailB = uniqueEmail('earnB');
		await inviteViaShareLink(page, request, 'Bob', emailB);

		// Reload to see updated slot count
		await page.reload();
		await expect(page.locator('[data-testid="song-slots"]')).toContainText('1 / 2');
	});

	test('attendee cannot add song when at slot limit', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('noslot-host') });
		const email = uniqueEmail('noslot');
		const path = await inviteViaShareLink(page, request, 'NoSlot', email);
		await acceptInvite(page, path, 'NoSlot');

		// At 1/1 — the add song form should not be visible (no slots left)
		await expect(page.locator('text=Add a Song')).not.toBeVisible();
	});

	test('creator can always add songs (unlimited)', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('unlim-host') });
		// Creator should see "Your Party" and the add song form
		await expect(page.locator('text=Your Party')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add a Song' })).toBeVisible();
	});

	test('creator cannot add song when playlist is full — must remove first', async ({ page, request }) => {
		// Create party with short duration so we can fill it with a few songs
		const partyUrl = await createParty(page, request, {
			creatorEmail: uniqueEmail('full-host'),
			startTime: '7pm',
			durationHours: 0.5 // 30 min = 1800 seconds
		});

		const testUrls = [
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
			'https://www.youtube.com/watch?v=9bZkp7q19f0',
			'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
			'https://www.youtube.com/watch?v=RgKAFK5djSk',
			'https://www.youtube.com/watch?v=OPf0YbXqDm0',
			'https://www.youtube.com/watch?v=JGwWNGJdvx8',
			'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
			'https://www.youtube.com/watch?v=60ItHLz5WEA'
		];

		// Add songs one by one, reloading between to avoid form state issues
		for (const url of testUrls) {
			await page.goto(partyUrl);
			await page.locator('input[name="youtubeUrl"]').fill(url);
			await page.evaluate(() => {
				const el = document.querySelector('input[name="durationSeconds"]') as HTMLInputElement;
				if (el) el.value = '350';
			});
			await page.locator('form[action="?/addSong"] button[type="submit"]').click();
			// Wait for either outcome
			await expect(page.locator('text=Song added!').or(page.locator('text=Playlist is full'))).toBeVisible();
			if (await page.locator('text=Playlist is full').isVisible()) {
				return; // Test passes — creator was blocked
			}
		}

		// Should have been rejected before exhausting URLs
		expect(false).toBe(true);
	});
});

test.describe('Creator Song Management', () => {
	test('creator sees remove buttons on songs', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('rm-host') });

		// Invite and accept a guest to get a song on the playlist
		const email = uniqueEmail('rm-guest');
		const path = await inviteViaShareLink(page, request, 'Guest', email);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'Guest');
		await page2.close();

		// Reload creator page — should see the remove button
		await page.reload();
		await expect(page.locator('[data-testid="remove-song-btn"]').first()).toBeVisible();
	});

	test('creator can remove a song', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('del-host') });

		const email = uniqueEmail('del-guest');
		const path = await inviteViaShareLink(page, request, 'Guest', email);
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

	test('creator sees drag handles on songs', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('reord-host') });

		// Add two guests to have multiple songs
		const email1 = uniqueEmail('reord1');
		const path1 = await inviteViaShareLink(page, request, 'G1', email1);
		const email2 = uniqueEmail('reord2');
		const path2 = await inviteViaShareLink(page, request, 'G2', email2);

		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, 'G1');
		await page2.close();

		const page3 = await page.context().newPage();
		await acceptInvite(page3, path2, 'G2');
		await page3.close();

		await page.reload();
		// Creator should see drag handles for reordering
		await expect(page.locator('[data-testid="drag-handle"]').first()).toBeVisible();
		const handleCount = await page.locator('[data-testid="drag-handle"]').count();
		expect(handleCount).toBeGreaterThanOrEqual(2);
	});

	test('non-creator sees drag handles only on own songs', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('nodrag-host') });

		const email1 = uniqueEmail('nodrag1');
		const path1 = await inviteViaShareLink(page, request, 'G1', email1);
		const email2 = uniqueEmail('nodrag2');
		const path2 = await inviteViaShareLink(page, request, 'G2', email2);

		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, 'G1');
		await page2.close();

		const page3 = await page.context().newPage();
		await acceptInvite(page3, path2, 'G2');

		// Non-creator should see drag handle only on their own song (1 of 2)
		await expect(page3.locator('[data-testid="drag-handle"]')).toHaveCount(1);
		// Non-creator should not see remove buttons
		await expect(page3.locator('[data-testid="remove-song-btn"]')).toHaveCount(0);
		await page3.close();
	});

	test('moveSong action reorders songs', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('move-host') });

		// Add two guests
		const email1 = uniqueEmail('move1');
		const path1 = await inviteViaShareLink(page, request, 'First', email1);
		const email2 = uniqueEmail('move2');
		const path2 = await inviteViaShareLink(page, request, 'Second', email2);

		const page2 = await page.context().newPage();
		await acceptInvite(page2, path1, 'First');
		await page2.close();

		const page3 = await page.context().newPage();
		await acceptInvite(page3, path2, 'Second');
		await page3.close();

		// Reload creator page — should see two songs
		await page.reload();
		const cards = page.locator('.song-card');
		await expect(cards).toHaveCount(2);

		// Get first song's title
		const firstTitle = await cards.nth(0).locator('p').first().textContent();
		const secondTitle = await cards.nth(1).locator('p').first().textContent();
		expect(firstTitle).toBeTruthy();
		expect(secondTitle).toBeTruthy();
		expect(firstTitle).not.toBe(secondTitle);

		// Use the moveSong action via page.evaluate (includes session cookies)
		const songId = await cards.nth(0).locator('form input[name="songId"]').first().inputValue();
		await page.evaluate(async (sid) => {
			const fd = new FormData();
			fd.set('songId', sid);
			fd.set('newPosition', '1');
			await fetch('?/moveSong', { method: 'POST', body: fd });
		}, songId);

		// Reload and verify order is swapped
		await page.reload();
		const newFirstTitle = await page.locator('.song-card').nth(0).locator('p').first().textContent();
		expect(newFirstTitle).toBe(secondTitle);
	});
});

test.describe('Creator Settings', () => {
	test('creator sees settings panel', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('settings-host') });
		await expect(page.locator('text=Party Settings')).toBeVisible();
		await expect(page.locator('[data-testid="song-attribution"]')).toBeVisible();
	});

	test('creator can update song attribution setting', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('attr-host') });

		await page.locator('[data-testid="song-attribution"]').selectOption('visible');
		await page.getByRole('button', { name: 'Save Settings' }).click();
		await page.waitForSelector('text=Settings updated');

		// Reload and verify
		await page.reload();
		const value = await page.locator('[data-testid="song-attribution"]').inputValue();
		expect(value).toBe('visible');
	});

	test('creator can update max invites per guest', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('maxinv-host') });

		await page.locator('[data-testid="max-invites-per-guest"]').fill('3');
		await page.getByRole('button', { name: 'Save Settings' }).click();
		await page.waitForSelector('text=Settings updated');

		await page.reload();
		const value = await page.locator('[data-testid="max-invites-per-guest"]').inputValue();
		expect(value).toBe('3');
	});
});

test.describe('Song Timeline', () => {
	test('songs display estimated start times when party has a start time', async ({ page, request }) => {
		// Create party with a start time set
		const creatorEmail = uniqueEmail('timeline-host');
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Party' }).click();
		await verifyCreatorEmail(page, request, creatorEmail);
		await page.locator('#name').fill('Timeline Party');
		await page.locator('#date').fill('2026-07-04');
		await page.locator('#createdBy').fill('Timeline Host');
		await page.locator('#startTimeInput').fill('8pm');
		await page.getByRole('button', { name: 'Create Party' }).click();
		await page.waitForURL(/\/party\//);

		const email = uniqueEmail('timeline-guest');
		const path = await inviteViaShareLink(page, request, 'TimeGuest', email);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'TimeGuest');
		await page2.close();

		// Reload creator page — song card should have a start time displayed
		await page.reload();
		const songCards = page.locator('.song-card');
		await expect(songCards).toHaveCount(1);

		// The start time appears as text containing AM or PM (e.g., "8 PM")
		const cardText = await songCards.first().textContent();
		expect(cardText).toMatch(/\d{1,2}(:\d{2})?\s*(AM|PM)/);
	});

	test('songs do not display start times when party has no start time', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('notime-host') });

		const email = uniqueEmail('notime-guest');
		const path = await inviteViaShareLink(page, request, 'NoTimeGuest', email);
		const page2 = await page.context().newPage();
		await acceptInvite(page2, path, 'NoTimeGuest');
		await page2.close();

		await page.reload();
		const songCards = page.locator('.song-card');
		await expect(songCards).toHaveCount(1);

		// No AM/PM text should appear in the card
		const cardText = await songCards.first().textContent();
		expect(cardText).not.toMatch(/\d{1,2}(:\d{2})?\s*(AM|PM)/);
	});
});

test.describe('Duplicate Song Rejection', () => {
	test('same YouTube URL cannot be added twice to a party', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('dupsong-host') });

		// Invite and accept first guest with a specific URL
		const email1 = uniqueEmail('dupsong1');
		const path1 = await inviteViaShareLink(page, request, 'First', email1);

		const page2 = await page.context().newPage();
		await page2.goto(path1);
		await page2.locator('[data-testid="name-input"]').fill('First');
		await page2.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page2.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page2.locator('[data-testid="accept-btn"]').click();
		await page2.waitForSelector('text=Welcome');
		await page2.close();

		// Invite and try to accept second guest with the SAME URL
		const email2 = uniqueEmail('dupsong2');
		const path2 = await inviteViaShareLink(page, request, 'Second', email2);

		const page3 = await page.context().newPage();
		await page3.goto(path2);
		await page3.locator('[data-testid="name-input"]').fill('Second');
		await page3.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await page3.evaluate(() => {
			const el = document.querySelector('input[name="durationSeconds_0"]') as HTMLInputElement;
			if (el) el.value = '210';
		});
		await page3.locator('[data-testid="accept-btn"]').click();
		await expect(page3.locator('text=already on the playlist')).toBeVisible();
		await page3.close();
	});
});
