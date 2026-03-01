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
	} = {}
) {
	await page.goto('/create');
	await page.getByLabel(/party name/i).fill(options.name ?? 'Edge Case Party');
	await page.getByLabel(/description/i).fill('Testing edge cases');
	await page.getByLabel(/date/i).fill('2026-08-01');
	await page.getByLabel(/start time/i).fill('20:00');
	await page.getByLabel(/location/i).fill('Edge Street');
	await page.getByLabel(/your name/i).fill('Edge Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'edgehost@test.com');
	if (options.maxAttendees) {
		await page.locator('[data-testid="max-attendees"]').fill(options.maxAttendees);
	}
	if (options.maxDepth) {
		await page.getByLabel(/max invite depth/i).fill(options.maxDepth);
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

test.describe('Error Handling & Edge Cases', () => {

	test('invalid invite token returns error', async ({ page }) => {
		const response = await page.goto('/invite/NONEXISTENT_TOKEN_123');
		expect(response!.status()).toBe(404);
	});

	test('invalid attendee token returns error', async ({ page }) => {
		const response = await page.goto('/attendee/NONEXISTENT_TOKEN_123');
		expect(response!.status()).toBe(404);
	});

	test('invalid party code returns error', async ({ page }) => {
		const response = await page.goto('/party/NONEXISTENT');
		expect(response!.status()).toBe(404);
	});

	test('invalid admin token with valid party code returns error', async ({
		page,
		request
	}) => {
		await createParty(page, { email: 'ec-admin@test.com' });

		// Get valid party code from the View Playlist link
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const href = await partyLink.getAttribute('href');
		const partyCode = href!.match(/\/party\/([A-Za-z0-9]+)/)![1];

		const response = await page.goto(`/party/${partyCode}/admin/WRONG_TOKEN`);
		expect(response!.status()).toBe(404);
	});

	test('double-accept redirects to dashboard', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-double@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Double Acceptor',
			'ec-double-accept@test.com'
		);

		// First accept
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Try to visit the invite link again — should redirect to dashboard
		const revisitPage = await context.newPage();
		await revisitPage.goto(invitePath);
		await expect(revisitPage).toHaveURL(/\/attendee\/.+/);
	});

	test('invite when party is full shows error', async ({
		page,
		request
	}) => {
		// Create party with max 2 attendees (creator = 1, so 1 more allowed)
		await createParty(page, { maxAttendees: '2', email: 'ec-full@test.com' });

		// First invite fills it up
		await sendInviteAndGetPath(page, request, 'Last Spot', 'ec-lastspot@test.com');

		// Try second invite — should fail
		await page.locator('[data-testid="invite-name"]').fill('Too Many');
		await page.locator('[data-testid="invite-email"]').fill('ec-toomany@test.com');
		await page.locator('[data-testid="send-invite-btn"]').click();

		await expect(page.getByText(/full|max.*attendees|capacity/i)).toBeVisible();
	});

	test('invalid YouTube URL on invite acceptance shows error', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-badurl@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Bad URL Person',
			'ec-badurl-invitee@test.com'
		);

		const invitePage = await context.newPage();
		await invitePage.goto(invitePath);

		// Try with a non-YouTube URL
		await invitePage.locator('[data-testid="youtube-url"]').fill('https://www.example.com/not-youtube');
		await invitePage.locator('[data-testid="accept-btn"]').click();

		// Should show a validation error and stay on the invite page
		await expect(invitePage.getByText(/invalid youtube url/i)).toBeVisible();
		await expect(invitePage).toHaveURL(/\/invite\/.+/);
	});

	test('create party with missing required fields shows validation', async ({ page }) => {
		await page.goto('/create');

		// Try to submit without filling anything
		await page.getByRole('button', { name: /create party/i }).click();

		// The form should not navigate away (HTML5 validation prevents submission)
		await expect(page).toHaveURL('/create');
	});

	test('invalid YouTube URL on bonus song add shows error', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-bonus-invalid@test.com' });

		// Earn a bonus slot
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Bonus Helper',
			'ec-bonus-helper@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		await page.reload();

		// Try to add a non-YouTube URL as bonus song
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await youtubeInput.fill('https://www.example.com/not-youtube');
		await page.getByRole('button', { name: /^add$/i }).click();

		// Should show error
		await expect(page.getByText(/invalid youtube url/i)).toBeVisible();

		// Song count should still be 0
		await expect(page.locator('.song-card')).toHaveCount(0);
	});

	test('non-existent YouTube video on bonus song add shows error', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-bonus-notfound@test.com' });

		// Earn a bonus slot
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Notfound Helper',
			'ec-bonus-notfound-helper@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		await page.reload();

		// Try to add a non-existent YouTube video
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await youtubeInput.fill('https://www.youtube.com/watch?v=XXXXXXXXXXX');
		await page.getByRole('button', { name: /^add$/i }).click();

		// Should show error about not finding the video
		await expect(page.getByText(/could not find/i)).toBeVisible();

		// Song count should still be 0
		await expect(page.locator('.song-card')).toHaveCount(0);
	});

	test('send invite with empty name shows validation error', async ({
		page
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-noname@test.com' });

		// Fill only email, remove required from name field, submit
		await page.locator('[data-testid="invite-email"]').fill('ec-noname-friend@test.com');
		await page.locator('[data-testid="invite-name"]').evaluate(
			(el) => el.removeAttribute('required')
		);
		await page.locator('[data-testid="send-invite-btn"]').click();

		// Should show server-side validation error
		await expect(page.getByText(/name.*required/i)).toBeVisible();
	});

	test('send invite with empty email shows validation error', async ({
		page
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-noemail@test.com' });

		// Fill only name, remove required from email field, submit
		await page.locator('[data-testid="invite-name"]').fill('No Email Friend');
		await page.locator('[data-testid="invite-email"]').evaluate(
			(el) => el.removeAttribute('required')
		);
		await page.locator('[data-testid="send-invite-btn"]').click();

		// Should show server-side validation error
		await expect(page.getByText(/email.*required/i)).toBeVisible();
	});

	test('accept invite with cleared name shows validation error', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-clearname@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Clear Name Person',
			'ec-clearname-invitee@test.com'
		);

		const invitePage = await context.newPage();
		await invitePage.goto(invitePath);

		// Clear the pre-filled name and remove required attribute
		await invitePage.locator('[data-testid="name-input"]').fill('');
		await invitePage.locator('[data-testid="name-input"]').evaluate(
			(el) => el.removeAttribute('required')
		);
		await invitePage.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await invitePage.locator('[data-testid="accept-btn"]').click();

		// Should show validation error and stay on invite page
		await expect(invitePage.getByText(/name.*required/i)).toBeVisible();
		await expect(invitePage).toHaveURL(/\/invite\/.+/);
	});

	test('accept invite with empty YouTube URL shows validation error', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ec-nourl@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'No URL Person',
			'ec-nourl-invitee@test.com'
		);

		const invitePage = await context.newPage();
		await invitePage.goto(invitePath);

		// Remove required attribute from YouTube URL field, submit without it
		await invitePage.locator('[data-testid="youtube-url"]').evaluate(
			(el) => el.removeAttribute('required')
		);
		await invitePage.locator('[data-testid="accept-btn"]').click();

		// Should show validation error and stay on invite page
		await expect(invitePage.getByText(/youtube.*required/i)).toBeVisible();
		await expect(invitePage).toHaveURL(/\/invite\/.+/);
	});
});
