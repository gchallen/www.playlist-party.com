import { test, expect } from '@playwright/test';
import type { Page, BrowserContext, APIRequestContext } from '@playwright/test';

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
	await page.getByLabel(/party name/i).fill(options.name ?? 'Usability Party');
	await page.getByLabel(/description/i).fill('Testing usability');
	await page.getByLabel(/date/i).fill('2026-08-05');
	await page.getByLabel(/start time/i).fill('20:00');
	await page.getByLabel(/location/i).fill('Usability Ave');
	await page.getByLabel(/your name/i).fill('UX Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'uxhost@test.com');
	if (options.maxAttendees) {
		await page.locator('[data-testid="max-attendees"]').fill(options.maxAttendees);
	}
	if (options.maxDepth) {
		await page.getByLabel(/max invite depth/i).fill(options.maxDepth);
	}
	await page.getByRole('button', { name: /create party/i }).click();
	await expect(page).toHaveURL(/\/attendee\/.+/);
}

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

test.describe('Attendee Dashboard Usability', () => {

	test('invite status shows accepted and pending correctly', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ux-status@test.com' });

		// Send 2 invites
		const invite1 = await sendInviteAndGetPath(
			page,
			request,
			'Accepted Alice',
			'ux-alice@test.com'
		);
		await sendInviteAndGetPath(
			page,
			request,
			'Pending Bob',
			'ux-bob@test.com'
		);

		// Only accept the first invite
		await acceptInvite(
			context,
			invite1,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Reload the creator's dashboard
		await page.reload();

		// Verify both invitee names appear
		await expect(page.getByText('Accepted Alice')).toBeVisible();
		await expect(page.getByText('Pending Bob')).toBeVisible();

		// Verify emails appear
		await expect(page.getByText('ux-alice@test.com')).toBeVisible();
		await expect(page.getByText('ux-bob@test.com')).toBeVisible();

		// Verify status labels
		await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
	});

	test('non-creator attendee cannot see admin link', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ux-noadmin@test.com' });

		// Creator should see admin link
		await expect(page.locator('[data-testid="admin-link"]')).toBeVisible();

		// Send invite and accept it
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Regular Guest',
			'ux-regular@test.com'
		);

		const guestPage = await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Guest should NOT see admin link
		await expect(guestPage.locator('[data-testid="admin-link"]')).not.toBeVisible();

		// Guest SHOULD see View Playlist link
		await expect(guestPage.getByRole('link', { name: 'View Playlist' })).toBeVisible();
	});

	test('attendee dashboard only shows own invitees', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ux-own@test.com' });

		// Creator invites A
		const inviteA = await sendInviteAndGetPath(
			page,
			request,
			'Friend A',
			'ux-own-a@test.com'
		);
		const pageA = await acceptInvite(
			context,
			inviteA,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Creator invites B
		await sendInviteAndGetPath(
			page,
			request,
			'Friend B',
			'ux-own-b@test.com'
		);

		// A invites C
		const inviteC = await sendInviteAndGetPath(
			pageA,
			request,
			'Friend C',
			'ux-own-c@test.com'
		);

		// Reload A's dashboard — should only see their own invitee (C), not B
		await pageA.reload();
		await expect(pageA.getByText('Friend C')).toBeVisible();
		await expect(pageA.getByText('Friend B')).not.toBeVisible();

		// Creator's dashboard should show A and B, not C
		await page.reload();
		await expect(page.getByText('Friend A')).toBeVisible();
		await expect(page.getByText('Friend B')).toBeVisible();
		await expect(page.getByText('Friend C')).not.toBeVisible();
	});

	test('dashboard re-entry via bookmarked URL', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ux-bookmark@test.com' });

		// Get the attendee URL from the current page
		const attendeeUrl = page.url();

		// Send an invite and accept it
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Bookmark Friend',
			'ux-bookmark-friend@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Open a new page and navigate directly to the bookmarked URL
		const newPage = await context.newPage();
		await newPage.goto(attendeeUrl);

		// Should load the dashboard with correct data
		await expect(newPage.getByText(/Welcome.*UX Host/i)).toBeVisible();
		await expect(newPage.getByRole('heading', { name: 'Usability Party' })).toBeVisible();

		// Should show the invited friend
		await expect(newPage.getByText('Bookmark Friend')).toBeVisible();
	});

	test('creator dashboard shows empty songs state', async ({ page }) => {
		await createParty(page, { email: 'ux-emptysongs@test.com' });

		// Creator is auto-accepted but has NO entry song (bypasses invite flow)
		// Should see "You haven't added any songs yet." message
		await expect(
			page.getByText("You haven't added any songs yet.")
		).toBeVisible();

		// No song cards should be present
		await expect(page.locator('.song-card')).toHaveCount(0);
	});
});
