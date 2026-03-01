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
	await page.getByLabel(/party name/i).fill(options.name ?? 'Invite Test Party');
	await page.getByLabel(/description/i).fill('Testing invite flows');
	await page.getByLabel(/date/i).fill('2026-07-15');
	await page.getByLabel(/start time/i).fill(options.startTime ?? '20:00');
	if (options.endTime) {
		await page.locator('[data-testid="end-time"]').fill(options.endTime);
	}
	await page.getByLabel(/location/i).fill('Test Venue');
	await page.getByLabel(/your name/i).fill('Party Starter');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'starter@test.com');
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
 * Helper: sends an invite via the dashboard form and retrieves the invite link from email API.
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

	// Get invite link from emails API
	const response = await request.get(
		'/api/emails?type=invite&to=' + encodeURIComponent(email)
	);
	const { emails } = await response.json();
	const magicUrl = emails[emails.length - 1].metadata.magicUrl;
	const url = new URL(magicUrl);
	return url.pathname;
}

/**
 * Helper: accepts an invite by filling in the form on the invite page.
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

test.describe('Invite & Accept Flow', () => {

	test('attendee dashboard shows invite form with name and email fields', async ({ page }) => {
		await createParty(page);

		await expect(page.locator('[data-testid="invite-name"]')).toBeVisible();
		await expect(page.locator('[data-testid="invite-email"]')).toBeVisible();
		await expect(page.locator('[data-testid="send-invite-btn"]')).toBeVisible();
	});

	test('sending invite shows success message with invitee name', async ({
		page,
		request
	}) => {
		await createParty(page);

		await page.locator('[data-testid="invite-name"]').fill('Alice');
		await page.locator('[data-testid="invite-email"]').fill('alice@test.com');
		await page.locator('[data-testid="send-invite-btn"]').click();

		const success = page.locator('[data-testid="invite-sent-success"]');
		await expect(success).toBeVisible();
		await expect(success).toContainText('Alice');
	});

	test('invitee receives invite email', async ({ page, request }) => {
		await createParty(page);

		await sendInviteAndGetPath(page, request, 'Bob', 'bob@test.com');

		const response = await request.get(
			'/api/emails?type=invite&to=' + encodeURIComponent('bob@test.com')
		);
		const { emails } = await response.json();
		expect(emails.length).toBeGreaterThanOrEqual(1);
		expect(emails[0].metadata.inviteeName).toBe('Bob');
		expect(emails[0].metadata.inviterName).toBe('Party Starter');
		expect(emails[0].metadata.partyName).toBe('Invite Test Party');
		expect(emails[0].metadata.magicUrl).toContain('/invite/');
	});

	test('invite link from email shows party info and pre-filled name', async ({
		page,
		context,
		request
	}) => {
		await createParty(page);

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Charlie',
			'charlie@test.com'
		);

		const invitePage = await context.newPage();
		await invitePage.goto(invitePath);

		// Should show party name
		await expect(invitePage.getByRole('heading', { name: 'Invite Test Party' })).toBeVisible();

		// Name should be pre-filled
		const nameInput = invitePage.locator('[data-testid="name-input"]');
		await expect(nameInput).toHaveValue('Charlie');

		// YouTube URL field and accept button should be visible
		await expect(invitePage.locator('[data-testid="youtube-url"]')).toBeVisible();
		await expect(invitePage.locator('[data-testid="accept-btn"]')).toBeVisible();
	});

	test('accepting invite redirects to attendee dashboard', async ({
		page,
		context,
		request
	}) => {
		await createParty(page);

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Dana',
			'dana@test.com'
		);

		const inviteePage = await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Should be on attendee dashboard
		await expect(inviteePage).toHaveURL(/\/attendee\/.+/);
		await expect(inviteePage.getByText(/Welcome.*Dana/i)).toBeVisible();
		await expect(inviteePage.getByRole('heading', { name: 'Invite Test Party' })).toBeVisible();
	});

	test('inviter receives bonus earned notification email', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { email: 'bonus-test-starter@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Eve',
			'eve@test.com'
		);

		// Eve accepts the invite
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Check that Party Starter got a bonus_earned email
		const response = await request.get(
			'/api/emails?type=bonus_earned&to=' + encodeURIComponent('bonus-test-starter@test.com')
		);
		const { emails } = await response.json();
		expect(emails.length).toBeGreaterThanOrEqual(1);
		const lastEmail = emails[emails.length - 1];
		expect(lastEmail.metadata.acceptedName).toBe('Eve');
		expect(lastEmail.metadata.recipientName).toBe('Party Starter');
	});

	test('accepted invite redirects to dashboard on revisit', async ({
		page,
		context,
		request
	}) => {
		await createParty(page);

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Frank',
			'frank@test.com'
		);

		// Accept the invite
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Revisit the invite link — should redirect to attendee dashboard
		const revisitPage = await context.newPage();
		await revisitPage.goto(invitePath);
		await expect(revisitPage).toHaveURL(/\/attendee\/.+/);
	});

	test('different invitees get unique invite tokens', async ({ page, request }) => {
		await createParty(page);

		const path1 = await sendInviteAndGetPath(
			page,
			request,
			'Grace',
			'grace@test.com'
		);

		const path2 = await sendInviteAndGetPath(
			page,
			request,
			'Hank',
			'hank@test.com'
		);

		expect(path1).not.toBe(path2);
		expect(path1).toMatch(/\/invite\/[A-Za-z0-9_-]+/);
		expect(path2).toMatch(/\/invite\/[A-Za-z0-9_-]+/);
	});
});
