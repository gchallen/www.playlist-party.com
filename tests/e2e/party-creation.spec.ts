import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function verifyEmail(page: Page, email: string): Promise<void> {
	await page.locator('[data-testid="verify-email-input"]').waitFor();
	await page.locator('[data-testid="verify-email-input"]').fill(email);
	await page.locator('[data-testid="verify-email-btn"]').click();
	await page.locator('[data-testid="verify-gate"]').waitFor({ state: 'detached' });
}

async function createParty(
	page: Page,
	options: {
		name?: string;
		createdBy?: string;
		creatorEmail?: string;
		date?: string;
		startTime?: string;
		endTime?: string;
		maxAttendees?: number;
		maxDepth?: number;
		maxInvitesPerGuest?: number;
	} = {}
): Promise<string> {
	const creatorEmail = options.creatorEmail || uniqueEmail('host');

	await page.goto('/');
	await page.getByRole('link', { name: 'Start a Party' }).click();

	await page.locator('#name').fill(options.name || 'Test Party');
	await page.locator('#date').fill(options.date || '2026-07-04');
	if (options.startTime) await page.locator('#time').fill(options.startTime);
	if (options.endTime) await page.locator('[data-testid="end-time"]').fill(options.endTime);
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
	await verifyEmail(page, creatorEmail);
	return page.url();
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Party Creation', () => {
	test('landing page shows hero and Start a Party button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'PLAYLIST PARTY' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start a Party' })).toBeVisible();
	});

	test('clicking Start a Party reveals the creation form', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Party' }).click();
		await expect(page.locator('#name')).toBeVisible();
		await expect(page.locator('#createdBy')).toBeVisible();
		await expect(page.locator('[data-testid="creator-email"]')).toBeVisible();
	});

	test('successful creation redirects to /party/{token}', async ({ page }) => {
		const url = await createParty(page, { creatorEmail: uniqueEmail('redir') });
		expect(url).toMatch(/\/party\/[a-zA-Z0-9_-]+/);
		await expect(page.locator('text=Your Party')).toBeVisible();
	});

	test('creator receives welcome email with party URL', async ({ page, request }) => {
		const email = uniqueEmail('welcome');
		await createParty(page, { creatorEmail: email });

		const res = await request.get(`/api/emails?to=${encodeURIComponent(email)}&type=creator_welcome`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].metadata.magicUrl).toContain('/party/');
	});

	test('genre picker shows capacity info when times are set', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Party' }).click();

		await page.locator('#time').fill('18:00');
		await page.locator('[data-testid="end-time"]').fill('21:00');
		await page.locator('[data-testid="genre-select"]').selectOption('jazz');
		await expect(page.locator('[data-testid="guest-capacity-info"]')).toBeVisible();
	});

	test('creator page shows all management sections', async ({ page }) => {
		await createParty(page, { creatorEmail: uniqueEmail('sections') });
		await expect(page.locator('text=Your Party')).toBeVisible();
		await expect(page.locator('text=Invite Friends')).toBeVisible();
		await expect(page.locator('text=Party Settings')).toBeVisible();
		await expect(page.locator('text=Add a Song')).toBeVisible();
	});

	test('max attendees defaults to 50', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Party' }).click();
		const val = await page.locator('[data-testid="max-attendees"]').inputValue();
		expect(val).toBe('50');
	});
});
