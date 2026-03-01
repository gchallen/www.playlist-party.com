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
	await page.getByLabel(/party name/i).fill(options.name ?? 'Admin Panel Party');
	await page.getByLabel(/description/i).fill('Testing admin panel');
	await page.getByLabel(/date/i).fill('2026-07-30');
	await page.getByLabel(/start time/i).fill('20:00');
	await page.getByLabel(/location/i).fill('Admin Street');
	await page.getByLabel(/your name/i).fill('Admin Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'adminhost@test.com');
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

test.describe('Admin Panel', () => {

	test('admin page loads with valid token and shows party info', async ({
		page,
		request
	}) => {
		const email = 'ap-valid@test.com';
		await createParty(page, { email });

		const adminPath = await getAdminPath(request, email);
		await page.goto(adminPath);

		// Should show the party name
		await expect(page.getByRole('heading', { name: 'Admin Panel Party' })).toBeVisible();

		// Should show admin badge
		await expect(page.getByText('Admin', { exact: true })).toBeVisible();

		// Should show party settings
		await expect(page.locator('[data-testid="party-settings"]')).toBeVisible();

		// Should show attendees section
		await expect(page.locator('[data-testid="attendees-section"]')).toBeVisible();

		// Should show songs section
		await expect(page.locator('[data-testid="songs-section"]')).toBeVisible();
	});

	test('admin page shows attendees with correct status', async ({
		page,
		context,
		request
	}) => {
		const email = 'ap-attendees@test.com';
		await createParty(page, { maxAttendees: '20', email });

		// Send two invites
		const invite1 = await sendInviteAndGetPath(page, request, 'Accepted Guest', 'ap-accepted@test.com');
		await sendInviteAndGetPath(page, request, 'Pending Guest', 'ap-pending@test.com');

		// Only first one accepts
		await acceptInvite(context, invite1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

		// Navigate to admin page
		const adminPath = await getAdminPath(request, email);
		await page.goto(adminPath);

		const attendeesSection = page.locator('[data-testid="attendees-section"]');
		await expect(attendeesSection).toBeVisible();

		// Should show 3 attendees (host + 2 invitees)
		await expect(attendeesSection).toContainText('Attendees (3)');

		// Should show the accepted guest
		await expect(attendeesSection).toContainText('Accepted Guest');
		await expect(attendeesSection).toContainText('Pending Guest');

		// Should show accepted/pending statuses
		await expect(attendeesSection.getByText('Accepted').first()).toBeVisible();
		await expect(attendeesSection.getByText('Pending').first()).toBeVisible();
	});

	test('reveal button works and shows confirmation', async ({
		page,
		context,
		request
	}) => {
		const email = 'ap-reveal@test.com';
		await createParty(page, { maxAttendees: '20', email });

		const adminPath = await getAdminPath(request, email);
		await page.goto(adminPath);

		// Should show the reveal button
		const revealBtn = page.getByRole('button', { name: /reveal names/i });
		await expect(revealBtn).toBeVisible();

		// Click reveal
		await revealBtn.click();

		// Should show confirmation
		await expect(page.getByText(/names have been revealed/i)).toBeVisible();

		// The reveal button should no longer be visible
		await expect(page.getByRole('button', { name: /reveal names/i })).not.toBeVisible();
	});

	test('invalid admin token returns error', async ({ page }) => {
		// First create a party to get a valid party code
		await createParty(page, { email: 'ap-invalid@test.com' });

		// Get the party code from the "View Playlist" link
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const href = await partyLink.getAttribute('href');
		const partyCode = href!.match(/\/party\/([A-Za-z0-9]+)/)![1];

		// Navigate to admin with invalid token
		const response = await page.goto(`/party/${partyCode}/admin/INVALID_TOKEN_123`);

		// Should return a 404 error
		expect(response!.status()).toBe(404);
	});

	test('reveal state persists after page refresh', async ({
		page,
		context,
		request
	}) => {
		const email = 'ap-persist@test.com';
		await createParty(page, { maxAttendees: '20', email });

		const adminPath = await getAdminPath(request, email);
		await page.goto(adminPath);

		// Reveal names
		await page.getByRole('button', { name: /reveal names/i }).click();
		await expect(page.getByText(/names have been revealed/i)).toBeVisible();

		// Refresh the page
		await page.reload();

		// Revealed state should persist
		await expect(page.getByText(/names have been revealed/i)).toBeVisible();

		// Reveal button should still not be visible
		await expect(page.getByRole('button', { name: /reveal names/i })).not.toBeVisible();
	});
});
