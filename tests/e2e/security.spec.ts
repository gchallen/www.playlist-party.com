import { test, expect } from '@playwright/test';
import type { Page, BrowserContext, APIRequestContext } from '@playwright/test';

async function createParty(
	page: Page,
	options: {
		name?: string;
		email?: string;
		maxAttendees?: string;
	} = {}
) {
	await page.goto('/create');
	await page.getByLabel(/party name/i).fill(options.name ?? 'Security Party');
	await page.getByLabel(/description/i).fill('Testing security');
	await page.getByLabel(/date/i).fill('2026-08-10');
	await page.getByLabel(/start time/i).fill('20:00');
	await page.getByLabel(/location/i).fill('Secure Street');
	await page.getByLabel(/your name/i).fill('Secure Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'sechost@test.com');
	if (options.maxAttendees) {
		await page.locator('[data-testid="max-attendees"]').fill(options.maxAttendees);
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

test.describe('Security', () => {

	test('public playlist page does not leak emails or tokens', async ({
		page,
		context,
		request
	}) => {
		const creatorEmail = 'sec-leak-creator@test.com';
		const attendeeEmail = 'sec-leak-attendee@test.com';

		await createParty(page, { maxAttendees: '20', email: creatorEmail });

		// Get the attendee token from URL
		const attendeeUrl = page.url();
		const attendeeToken = attendeeUrl.match(/\/attendee\/([A-Za-z0-9_-]+)/)![1];

		// Get admin token from welcome email
		const adminRes = await request.get(
			'/api/emails?type=creator_welcome&to=' + encodeURIComponent(creatorEmail)
		);
		const adminEmails = (await adminRes.json()).emails;
		const adminUrl = adminEmails[0].metadata.adminUrl;
		const adminToken = adminUrl.match(/admin\/([A-Za-z0-9_-]+)/)?.[1];

		// Invite and accept
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Leak Test Guest',
			attendeeEmail
		);
		const guestPage = await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Get guest's token
		const guestUrl = guestPage.url();
		const guestToken = guestUrl.match(/\/attendee\/([A-Za-z0-9_-]+)/)![1];

		// Navigate to public playlist page
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const partyHref = await partyLink.getAttribute('href');
		await page.goto(partyHref!);

		// Get full page content
		const content = await page.content();

		// Verify no emails leak
		expect(content).not.toContain(creatorEmail);
		expect(content).not.toContain(attendeeEmail);

		// Verify no tokens leak
		expect(content).not.toContain(attendeeToken);
		expect(content).not.toContain(guestToken);
		if (adminToken) {
			expect(content).not.toContain(adminToken);
		}

		// Before reveal, names should not be visible
		await expect(page.getByText('Secure Host')).not.toBeVisible();
		await expect(page.getByText('Leak Test Guest')).not.toBeVisible();
	});

	test('public playlist page shows names after reveal but still no emails', async ({
		page,
		context,
		request
	}) => {
		const creatorEmail = 'sec-reveal-creator@test.com';

		await createParty(page, {
			name: 'Reveal Security Party',
			maxAttendees: '20',
			email: creatorEmail
		});

		// Invite and accept
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Revealed Guest',
			'sec-reveal-guest@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Perform reveal via admin
		const adminRes = await request.get(
			'/api/emails?type=creator_welcome&to=' + encodeURIComponent(creatorEmail)
		);
		const adminEmails = (await adminRes.json()).emails;
		const adminPath = new URL(adminEmails[0].metadata.adminUrl).pathname;

		const adminPage = await context.newPage();
		await adminPage.goto(adminPath);
		await adminPage.getByRole('button', { name: /reveal names/i }).click();
		await expect(adminPage.getByText(/names have been revealed/i)).toBeVisible();

		// Visit the playlist page
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const partyHref = await partyLink.getAttribute('href');
		await page.goto(partyHref!);

		// After reveal, names should be visible
		await expect(page.getByText('Revealed Guest')).toBeVisible();

		// But emails should still NOT be in the page content
		const content = await page.content();
		expect(content).not.toContain('sec-reveal-creator@test.com');
		expect(content).not.toContain('sec-reveal-guest@test.com');
	});

	test('double-accept via browser shows redirect to dashboard', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'sec-double@test.com' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Double Post',
			'sec-double-invitee@test.com'
		);

		// First accept via browser
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Try to visit the invite link again — should redirect to dashboard
		const revisitPage = await context.newPage();
		await revisitPage.goto(invitePath);
		await expect(revisitPage).toHaveURL(/\/attendee\/.+/);
		// Should see the welcome message on the dashboard
		await expect(revisitPage.getByText(/Welcome.*Double Post/i)).toBeVisible();
	});
});
