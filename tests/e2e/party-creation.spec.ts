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

async function verifyCreatorEmail(page: Page, _request: any, email: string): Promise<void> {
	await page.locator('[data-testid="creator-verify-email"]').fill(email);
	await page.locator('[data-testid="verify-email-btn"]').click();
	// In dev mode, verify action sets cookie and redirects directly to the creation form
	await page.locator('#name').waitFor();
}

async function createParty(
	page: Page,
	request: any,
	options: {
		name?: string;
		createdBy?: string;
		creatorEmail?: string;
		date?: string;
		startTime?: string;
		durationHours?: number;
		maxAttendees?: number;
		maxDepth?: number;
		maxInvitesPerGuest?: number;
	} = {}
): Promise<string> {
	const creatorEmail = options.creatorEmail || uniqueEmail('host');

	await page.goto('/');
	await page.getByRole('link', { name: 'Start a Party' }).click();

	// Email verification step
	await verifyCreatorEmail(page, request, creatorEmail);

	await page.locator('#name').fill(options.name || 'Test Party');
	await page.locator('#date').fill(options.date || '2026-07-04');
	if (options.startTime) await page.locator('#startTimeInput').fill(options.startTime);
	if (options.durationHours !== undefined) await page.locator('[data-testid="duration-hours"]').fill(String(options.durationHours));
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

	await page.getByRole('button', { name: 'Create Party' }).click();
	await page.waitForURL(/\/party\//);
	return page.url();
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe('Party Creation', () => {
	test('landing page shows hero and Start a Party button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'PLAYLIST PARTY' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Start a Party' })).toBeVisible();
	});

	test('clicking Start a Party shows email verification form', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Start a Party' }).click();
		await expect(page.locator('[data-testid="creator-verify-email"]')).toBeVisible();
		await expect(page.locator('[data-testid="verify-email-btn"]')).toBeVisible();
	});

	test('email verification bypasses email and shows creation form directly', async ({ page, request }) => {
		const email = uniqueEmail('verify');
		await page.goto('/create');
		await page.locator('[data-testid="creator-verify-email"]').fill(email);
		await page.locator('[data-testid="verify-email-btn"]').click();

		// Without RESEND_API_KEY, verification is immediate — creation form appears
		await expect(page.locator('#name')).toBeVisible();
		await expect(page.locator('[data-testid="creator-email"]')).toHaveValue(email);
	});

	test('clicking verification link shows creation form with email locked', async ({ page, request }) => {
		const email = uniqueEmail('locked');
		await page.goto('/create');
		await verifyCreatorEmail(page, request, email);

		// Email should be readonly and pre-filled
		const emailInput = page.locator('[data-testid="creator-email"]');
		await expect(emailInput).toHaveValue(email);
		await expect(emailInput).toHaveAttribute('readonly', '');
		await expect(page.locator('#name')).toBeVisible();
		await expect(page.locator('#createdBy')).toBeVisible();
	});

	test('successful creation redirects to /party/{token}', async ({ page, request }) => {
		const url = await createParty(page, request, { creatorEmail: uniqueEmail('redir') });
		expect(url).toMatch(/\/party\/[a-zA-Z0-9_-]+/);
		await expect(page.locator('text=Your Party')).toBeVisible();
	});

	test('creator receives welcome email with party URL', async ({ page, request }) => {
		const email = uniqueEmail('welcome');
		await createParty(page, request, { creatorEmail: email });

		const res = await request.get(`/api/emails?to=${encodeURIComponent(email)}&type=creator_welcome`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].metadata.magicUrl).toContain('/party/');
	});

	test('genre picker shows capacity info when times are set', async ({ page, request }) => {
		const email = uniqueEmail('genre');
		await page.goto('/create');
		await verifyCreatorEmail(page, request, email);

		await page.locator('#startTimeInput').fill('6pm');
		await page.locator('[data-testid="duration-hours"]').fill('3');
		await page.locator('[data-testid="genre-select"]').selectOption('jazz');
		await expect(page.locator('[data-testid="guest-capacity-info"]')).toBeVisible();
	});

	test('creator page shows all management sections', async ({ page, request }) => {
		await createParty(page, request, { creatorEmail: uniqueEmail('sections') });
		await expect(page.locator('text=Your Party')).toBeVisible();
		await expect(page.locator('text=Invite Friends')).toBeVisible();
		await expect(page.locator('text=Party Settings')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add a Song' })).toBeVisible();
	});

	test('max attendees defaults to 50', async ({ page, request }) => {
		const email = uniqueEmail('defaults');
		await page.goto('/create');
		await verifyCreatorEmail(page, request, email);
		const val = await page.locator('[data-testid="max-attendees"]').inputValue();
		expect(val).toBe('50');
	});

	test('custom invite message appears in invite emails', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('custmsg-host');
		const customMsg = 'Bring your dancing shoes and your best playlist picks!';

		await createParty(page, request, { creatorEmail, name: 'Custom Msg Party' });

		// Fill custom message on party page
		await page.locator('[data-testid="invite-email-message"]').fill(customMsg);

		// Send an invite
		const guestEmail = uniqueEmail('custmsg-guest');
		await page.locator('[data-testid="invite-name"]').fill('Guest One');
		await page.locator('[data-testid="invite-email"]').fill(guestEmail);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.locator('[data-testid="invite-sent-success"]').waitFor();

		// Check the invite email
		const res = await request.get(`/api/emails?to=${encodeURIComponent(guestEmail)}&type=invite`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].html).toContain(customMsg);
		expect(data.emails[0].html).not.toContain('to the playlist when you RSVP');
	});

	test('invite email has reply-to set to creator email', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('replyto-host');

		const partyUrl = await createParty(page, request, { creatorEmail });

		const guestEmail = uniqueEmail('replyto-guest');
		await page.locator('[data-testid="invite-name"]').fill('Reply Guest');
		await page.locator('[data-testid="invite-email"]').fill(guestEmail);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.locator('[data-testid="invite-sent-success"]').waitFor();

		const res = await request.get(`/api/emails?to=${encodeURIComponent(guestEmail)}&type=invite`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].metadata.replyTo).toBe(creatorEmail);
	});

	test('default message used when custom message is empty', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('defmsg-host');

		await createParty(page, request, { creatorEmail });

		const guestEmail = uniqueEmail('defmsg-guest');
		await page.locator('[data-testid="invite-name"]').fill('Default Guest');
		await page.locator('[data-testid="invite-email"]').fill(guestEmail);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.locator('[data-testid="invite-sent-success"]').waitFor();

		const res = await request.get(`/api/emails?to=${encodeURIComponent(guestEmail)}&type=invite`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].html).toContain('to the playlist when you RSVP');
	});

	test('test email sent to creator inbox', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('testemail-host');
		const customMsg = 'This is a test invite preview message!';

		await createParty(page, request, { creatorEmail, name: 'Test Email Party' });

		// Fill custom message on party page
		await page.locator('[data-testid="invite-email-message"]').fill(customMsg);

		// Click "Send Test Email"
		await page.locator('[data-testid="send-test-email-btn"]').click();
		await page.locator('[data-testid="test-email-success"]').waitFor();

		// Check the email was sent to the creator
		const res = await request.get(`/api/emails?to=${encodeURIComponent(creatorEmail)}&type=invite`);
		const data = await res.json();
		expect(data.emails.length).toBe(1);
		expect(data.emails[0].html).toContain(customMsg);
	});

	test('custom message can be changed between invites', async ({ page, request }) => {
		const creatorEmail = uniqueEmail('editmsg-host');
		const messageA = 'Original custom message for the party';
		const messageB = 'Updated message for the second invite';

		await createParty(page, request, { creatorEmail, name: 'Editable Msg Party' });

		// Set message A and send first invite
		await page.locator('[data-testid="invite-email-message"]').fill(messageA);
		const guestEmailA = uniqueEmail('editmsg-guestA');
		await page.locator('[data-testid="invite-name"]').fill('Guest A');
		await page.locator('[data-testid="invite-email"]').fill(guestEmailA);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.locator('[data-testid="invite-sent-success"]').waitFor();

		// Change to message B and send second invite
		await page.locator('[data-testid="invite-email-message"]').fill(messageB);
		const guestEmailB = uniqueEmail('editmsg-guestB');
		await page.locator('[data-testid="invite-name"]').fill('Guest B');
		await page.locator('[data-testid="invite-email"]').fill(guestEmailB);
		await page.locator('[data-testid="send-invite-btn"]').click();
		await page.locator('[data-testid="invite-sent-success"]').waitFor();

		// Verify first invite got message A
		const resA = await request.get(`/api/emails?to=${encodeURIComponent(guestEmailA)}&type=invite`);
		const dataA = await resA.json();
		expect(dataA.emails.length).toBe(1);
		expect(dataA.emails[0].html).toContain(messageA);
		expect(dataA.emails[0].html).not.toContain(messageB);

		// Verify second invite got message B
		const resB = await request.get(`/api/emails?to=${encodeURIComponent(guestEmailB)}&type=invite`);
		const dataB = await resB.json();
		expect(dataB.emails.length).toBe(1);
		expect(dataB.emails[0].html).toContain(messageB);
		expect(dataB.emails[0].html).not.toContain(messageA);
	});
});
