import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';

test.describe('Party Creation Flow', () => {

	test('landing page has "Start a Party" call to action', async ({ page }) => {
		await page.goto('/');
		const cta = page.getByRole('link', { name: /start a party/i });
		await expect(cta).toBeVisible();
		await cta.click();
		await expect(page).toHaveURL('/create');
	});

	test('create party form has all required fields', async ({ page }) => {
		await page.goto('/create');

		// Party details
		await expect(page.getByLabel(/party name/i)).toBeVisible();
		await expect(page.getByLabel(/description/i)).toBeVisible();
		await expect(page.getByLabel(/date/i)).toBeVisible();
		await expect(page.getByLabel(/start time/i)).toBeVisible();
		await expect(page.getByLabel(/location/i)).toBeVisible();

		// Creator identity
		await expect(page.getByLabel(/your name/i)).toBeVisible();
		await expect(page.locator('[data-testid="creator-email"]')).toBeVisible();

		// Genre picker
		await expect(page.locator('[data-testid="genre-select"]')).toBeVisible();

		// Guest limits
		await expect(page.locator('[data-testid="max-attendees"]')).toBeVisible();

		// Submit button
		await expect(page.getByRole('button', { name: /create party/i })).toBeVisible();
	});

	test('max attendees is required and defaults to 50', async ({ page }) => {
		await page.goto('/create');
		const maxAttendees = page.locator('[data-testid="max-attendees"]');
		await expect(maxAttendees).toHaveValue('50');
		await expect(maxAttendees).toHaveAttribute('required', '');
	});

	test('max invite depth is optional', async ({ page }) => {
		await page.goto('/create');
		const maxDepth = page.getByLabel(/max invite depth/i);
		await expect(maxDepth).not.toHaveAttribute('required', '');
	});

	test('genre picker shows options and sets avg duration', async ({ page }) => {
		await page.goto('/create');
		const genreSelect = page.locator('[data-testid="genre-select"]');

		// Check default is pop
		await expect(genreSelect).toHaveValue('pop');

		// Verify options exist
		await genreSelect.selectOption('rock');
		await expect(genreSelect).toHaveValue('rock');

		await genreSelect.selectOption('electronic-dance');
		await expect(genreSelect).toHaveValue('electronic-dance');

		await genreSelect.selectOption('jazz');
		await expect(genreSelect).toHaveValue('jazz');
	});

	test('setting start/end time + genre updates capacity info text', async ({ page }) => {
		await page.goto('/create');

		// Set start and end time
		await page.getByLabel(/start time/i).fill('20:00');
		await page.locator('[data-testid="end-time"]').fill('23:00');

		// Should show capacity info text
		const capacityInfo = page.locator('[data-testid="guest-capacity-info"]');
		await expect(capacityInfo).toBeVisible();
		await expect(capacityInfo).toContainText(/can host up to/i);
	});

	test('successfully creates party and redirects to attendee dashboard', async ({ page }) => {
		await page.goto('/create');

		await page.getByLabel(/party name/i).fill('Test Party');
		await page.getByLabel(/description/i).fill('A great test party');
		await page.getByLabel(/date/i).fill('2026-06-15');
		await page.getByLabel(/start time/i).fill('20:00');
		await page.getByLabel(/location/i).fill('123 Test Street');
		await page.getByLabel(/your name/i).fill('Test Host');
		await page.locator('[data-testid="creator-email"]').fill('host@test.com');

		await page.getByRole('button', { name: /create party/i }).click();

		// Should redirect to the attendee dashboard
		await expect(page).toHaveURL(/\/attendee\/.+/);

		// Dashboard should show the party name
		await expect(page.getByRole('heading', { name: 'Test Party' })).toBeVisible();

		// Dashboard should show welcome with creator's name
		await expect(page.getByText(/Welcome.*Test Host/i)).toBeVisible();
	});

	test('creator receives welcome email', async ({ page, request }) => {
		await page.goto('/create');

		await page.getByLabel(/party name/i).fill('Email Test Party');
		await page.getByLabel(/description/i).fill('Testing email');
		await page.getByLabel(/date/i).fill('2026-07-01');
		await page.getByLabel(/start time/i).fill('19:00');
		await page.getByLabel(/location/i).fill('Email Ave');
		await page.getByLabel(/your name/i).fill('Email Host');
		await page.locator('[data-testid="creator-email"]').fill('creator@test.com');

		await page.getByRole('button', { name: /create party/i }).click();
		await expect(page).toHaveURL(/\/attendee\/.+/);

		// Check for welcome email
		const response = await request.get(
			'/api/emails?type=creator_welcome&to=' + encodeURIComponent('creator@test.com')
		);
		const { emails } = await response.json();
		expect(emails.length).toBeGreaterThanOrEqual(1);
		expect(emails[0].metadata.partyName).toBe('Email Test Party');
		expect(emails[0].metadata.creatorName).toBe('Email Host');
		expect(emails[0].metadata.magicUrl).toBeTruthy();
		expect(emails[0].metadata.adminUrl).toBeTruthy();
	});

	test('attendee dashboard shows admin link for party creator', async ({ page }) => {
		await page.goto('/create');

		await page.getByLabel(/party name/i).fill('Admin Link Party');
		await page.getByLabel(/description/i).fill('Testing admin link');
		await page.getByLabel(/date/i).fill('2026-07-01');
		await page.getByLabel(/start time/i).fill('19:00');
		await page.getByLabel(/location/i).fill('Admin Ave');
		await page.getByLabel(/your name/i).fill('Admin Host');
		await page.locator('[data-testid="creator-email"]').fill('admin@test.com');

		await page.getByRole('button', { name: /create party/i }).click();
		await expect(page).toHaveURL(/\/attendee\/.+/);

		// Party starter should see admin link
		const adminLink = page.locator('[data-testid="admin-link"]');
		await expect(adminLink).toBeVisible();

		const href = await adminLink.getAttribute('href');
		expect(href).toMatch(/\/party\/[A-Za-z0-9]+\/admin\/[A-Za-z0-9_-]+/);
	});

	test('party is accessible via party code', async ({ page }) => {
		await page.goto('/create');

		await page.getByLabel(/party name/i).fill('Public Party');
		await page.getByLabel(/description/i).fill('Viewable by party code');
		await page.getByLabel(/date/i).fill('2026-08-10');
		await page.getByLabel(/start time/i).fill('21:00');
		await page.getByLabel(/location/i).fill('Public Plaza');
		await page.getByLabel(/your name/i).fill('Public Host');
		await page.locator('[data-testid="creator-email"]').fill('public@test.com');

		await page.getByRole('button', { name: /create party/i }).click();
		await expect(page).toHaveURL(/\/attendee\/.+/);

		// Find the link to the playlist/party page
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		await expect(partyLink).toBeVisible();

		const partyHref = await partyLink.getAttribute('href');
		expect(partyHref).toMatch(/\/party\/[A-Za-z0-9]+/);

		await partyLink.click();
		await expect(page).toHaveURL(/\/party\/[A-Za-z0-9]+/);

		// Should show the party name
		await expect(page.getByRole('heading', { name: 'Public Party' })).toBeVisible();
	});
});
