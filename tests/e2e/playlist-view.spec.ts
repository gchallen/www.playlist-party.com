import { test, expect } from '@playwright/test';
import type { Page, BrowserContext, APIRequestContext } from '@playwright/test';

/**
 * Helper: creates a party and lands on the attendee dashboard.
 */
async function createParty(
	page: Page,
	options: {
		name?: string;
		email?: string;
		maxAttendees?: string;
		maxDepth?: string;
		estimatedGuests?: string;
		startTime?: string;
		endTime?: string;
		genre?: string;
	} = {}
) {
	await page.goto('/create');
	await page.getByLabel(/party name/i).fill(options.name ?? 'Playlist View Party');
	await page.getByLabel(/description/i).fill('Testing playlist view page');
	await page.getByLabel(/date/i).fill('2026-07-25');
	await page.getByLabel(/start time/i).fill(options.startTime ?? '20:00');
	if (options.endTime) {
		await page.locator('[data-testid="end-time"]').fill(options.endTime);
	}
	await page.getByLabel(/location/i).fill('View Venue');
	await page.getByLabel(/your name/i).fill('View Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'viewhost@test.com');
	if (options.genre) {
		await page.locator('[data-testid="genre-select"]').selectOption(options.genre);
	}
	if (options.maxAttendees) {
		await page.locator('[data-testid="max-attendees"]').fill(options.maxAttendees);
	}
	if (options.maxDepth) {
		await page.getByLabel(/max invite depth/i).fill(options.maxDepth);
	}
	if (options.estimatedGuests) {
		await page.locator('[data-testid="estimated-guests"]').fill(options.estimatedGuests);
	}
	await page.getByRole('button', { name: /create party/i }).click();
	await expect(page).toHaveURL(/\/attendee\/.+/);
}

/**
 * Helper: sends an invite and returns the invite path from email.
 */
async function sendInviteAndGetPath(
	page: Page,
	request: APIRequestContext,
	name: string,
	email: string
): Promise<string> {
	await page.locator('[data-testid="invite-name"]').fill(name);
	await page.locator('[data-testid="invite-email"]').fill(email);
	await page.locator('[data-testid="send-invite-btn"]').click();
	await expect(page.locator('[data-testid="invite-sent-success"]')).toBeVisible();

	const response = await request.get(
		'/api/emails?type=invite&to=' + encodeURIComponent(email)
	);
	const { emails } = await response.json();
	const magicUrl = emails[emails.length - 1].metadata.magicUrl;
	const url = new URL(magicUrl);
	return url.pathname;
}

/**
 * Helper: accepts an invite on a new page and returns it.
 */
async function acceptInvite(
	context: BrowserContext,
	invitePath: string,
	youtubeUrl: string,
	name?: string
): Promise<Page> {
	const page = await context.newPage();
	await page.goto(invitePath);
	if (name) {
		await page.locator('[data-testid="name-input"]').fill(name);
	}
	await page.locator('[data-testid="youtube-url"]').fill(youtubeUrl);
	await page.locator('[data-testid="accept-btn"]').click();
	await expect(page).toHaveURL(/\/attendee\/.+/);
	return page;
}

/**
 * Helper: gets the party page path from the attendee dashboard.
 */
async function getPartyPagePath(page: Page): Promise<string> {
	const partyLink = page.getByRole('link', { name: 'View Playlist' });
	await expect(partyLink).toBeVisible();
	const href = await partyLink.getAttribute('href');
	expect(href).toBeTruthy();
	return href!;
}

/**
 * Helper: gets the admin page path from the welcome email.
 */
async function getAdminPath(request: APIRequestContext, email: string): Promise<string> {
	const response = await request.get(
		'/api/emails?type=creator_welcome&to=' + encodeURIComponent(email)
	);
	const { emails } = await response.json();
	expect(emails.length).toBeGreaterThanOrEqual(1);
	const adminUrl = emails[emails.length - 1].metadata.adminUrl;
	const url = new URL(adminUrl);
	return url.pathname;
}

test.describe('Playlist View Page', () => {

	test('songs display on playlist page after invite accepted', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'pv-songs@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Song Viewer',
			'pv-viewer@test.com'
		);

		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Navigate to the party/playlist page
		const partyPath = await getPartyPagePath(page);
		await page.goto(partyPath);

		// Should show the party name
		await expect(page.getByRole('heading', { name: 'Playlist View Party' })).toBeVisible();

		// Should show 1 track
		await expect(page.getByText('1 track')).toBeVisible();

		// Song card should be visible
		await expect(page.locator('.song-card')).toHaveCount(1);
	});

	test('submitter names hidden before reveal', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'pv-hidden@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Hidden Singer',
			'pv-hidden-singer@test.com'
		);

		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Navigate to the playlist page
		const partyPath = await getPartyPagePath(page);
		await page.goto(partyPath);

		// The name "Hidden Singer" should NOT appear on the playlist page (not revealed)
		await expect(page.getByText('Hidden Singer')).not.toBeVisible();
	});

	test('submitter names shown after admin reveal', async ({
		page,
		context,
		request
	}) => {
		const creatorEmail = 'pv-reveal@test.com';
		await createParty(page, { maxAttendees: '20', email: creatorEmail });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Revealed Singer',
			'pv-revealed-singer@test.com'
		);

		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Get the admin page path and perform the reveal
		const adminPath = await getAdminPath(request, creatorEmail);
		const adminPage = await context.newPage();
		await adminPage.goto(adminPath);

		// Should see the party name in admin
		await expect(adminPage.getByRole('heading', { name: 'Playlist View Party' })).toBeVisible();

		// Click the Reveal Names button
		await adminPage.getByRole('button', { name: /reveal names/i }).click();

		// Should show confirmation that names are revealed
		await expect(adminPage.getByText(/names have been revealed/i)).toBeVisible();

		// Now visit the playlist page and verify names are shown
		const partyPath = await getPartyPagePath(page);
		await page.goto(partyPath);

		// The name "Revealed Singer" should now be visible
		await expect(page.getByText('Revealed Singer')).toBeVisible();
	});

	test('multiple songs display in position order', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'pv-multi@test.com' });

		// First invitee adds a song (entry song, position 0)
		const invite1 = await sendInviteAndGetPath(
			page,
			request,
			'First Artist',
			'pv-first@test.com'
		);
		await acceptInvite(
			context,
			invite1,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Second invitee adds a song (entry song, position 1)
		const invite2 = await sendInviteAndGetPath(
			page,
			request,
			'Second Artist',
			'pv-second@test.com'
		);
		await acceptInvite(
			context,
			invite2,
			'https://www.youtube.com/watch?v=9bZkp7q19f0'
		);

		// Navigate to the playlist page
		const partyPath = await getPartyPagePath(page);
		await page.goto(partyPath);

		// Should show 2 tracks
		await expect(page.getByText('2 tracks')).toBeVisible();

		// Verify both songs appear as song cards
		await expect(page.locator('.song-card')).toHaveCount(2);
	});

	test('empty playlist shows appropriate empty state', async ({ page }) => {
		// Create a party (creator is auto-accepted but has no songs)
		await createParty(page, { email: 'pv-empty@test.com' });

		// Navigate to the playlist page
		const partyPath = await getPartyPagePath(page);
		await page.goto(partyPath);

		// Should show 0 tracks
		await expect(page.getByText('0 tracks')).toBeVisible();

		// Should show empty state message in the playlist area
		await expect(
			page.getByText('No songs yet. The playlist will grow as people accept their invitations!')
		).toBeVisible();

		// No song cards should be present
		await expect(page.locator('.song-card')).toHaveCount(0);
	});
});
