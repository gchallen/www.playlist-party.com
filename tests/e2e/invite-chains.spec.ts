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
	await page.getByLabel(/party name/i).fill(options.name ?? 'Chain Party');
	await page.getByLabel(/description/i).fill('Testing invite chains');
	await page.getByLabel(/date/i).fill('2026-08-20');
	await page.getByLabel(/start time/i).fill('20:00');
	await page.getByLabel(/location/i).fill('Chain Hall');
	await page.getByLabel(/your name/i).fill('Chain Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'chainhost@test.com');
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

test.describe('Multi-Depth Invite Chains', () => {

	test('three-level invite chain: creator -> A -> B -> C', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ic-host@test.com' });

		// Creator (depth 0) invites A (depth 1)
		const inviteA = await sendInviteAndGetPath(page, request, 'Chain A', 'ic-a@test.com');
		const pageA = await acceptInvite(
			context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// A (depth 1) invites B (depth 2)
		const inviteB = await sendInviteAndGetPath(pageA, request, 'Chain B', 'ic-b@test.com');
		const pageB = await acceptInvite(
			context, inviteB, 'https://www.youtube.com/watch?v=9bZkp7q19f0'
		);

		// B (depth 2) invites C (depth 3)
		const inviteC = await sendInviteAndGetPath(pageB, request, 'Chain C', 'ic-c@test.com');
		const pageC = await acceptInvite(
			context, inviteC, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk'
		);

		// Verify C is on the dashboard
		await expect(pageC.getByText(/Welcome.*Chain C/i)).toBeVisible();

		// Verify all 3 songs exist on the playlist
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const partyHref = await partyLink.getAttribute('href');
		await page.goto(partyHref!);
		await expect(page.getByText('3 tracks')).toBeVisible();
	});

	test('max depth enforcement: depth-limited person cannot invite further', async ({
		page,
		context,
		request
	}) => {
		// maxDepth=2 means: creator=0, A=1, B=2 (max). B cannot invite.
		await createParty(page, { maxAttendees: '20', maxDepth: '2', email: 'ic-depth@test.com' });

		// Creator invites A (depth 1)
		const inviteA = await sendInviteAndGetPath(page, request, 'Depth A', 'ic-depth-a@test.com');
		const pageA = await acceptInvite(
			context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// A invites B (depth 2 — at the limit)
		const inviteB = await sendInviteAndGetPath(pageA, request, 'Depth B', 'ic-depth-b@test.com');
		const pageB = await acceptInvite(
			context, inviteB, 'https://www.youtube.com/watch?v=9bZkp7q19f0'
		);

		// B tries to invite C (depth 3) — should be rejected
		await pageB.locator('[data-testid="invite-name"]').fill('Depth C');
		await pageB.locator('[data-testid="invite-email"]').fill('ic-depth-c@test.com');
		await pageB.locator('[data-testid="send-invite-btn"]').click();

		// Should show depth error
		await expect(pageB.getByText(/depth/i)).toBeVisible();
	});

	test('bonus songs earned through invite chain', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ic-bonus@test.com' });

		// Creator invites A
		const inviteA = await sendInviteAndGetPath(page, request, 'Bonus A', 'ic-bonus-a@test.com');

		// Before A accepts, creator has 0 bonus slots
		const songSlots = page.locator('[data-testid="song-slots"]');
		await expect(songSlots).toContainText('0');

		// A accepts — creator should now have 1 bonus slot
		await acceptInvite(
			context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Reload creator's dashboard to see updated bonus count
		await page.reload();
		await expect(songSlots).toContainText('1');

		// Verify creator got bonus_earned email
		const bonusRes = await request.get(
			'/api/emails?type=bonus_earned&to=' + encodeURIComponent('ic-bonus@test.com')
		);
		const bonusEmails = (await bonusRes.json()).emails;
		expect(bonusEmails.length).toBeGreaterThanOrEqual(1);
		expect(bonusEmails[0].metadata.acceptedName).toBe('Bonus A');
	});

	test('bonus notification flows to correct inviter in chain', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20', email: 'ic-notify@test.com' });

		// Creator invites A
		const inviteA = await sendInviteAndGetPath(page, request, 'Notify A', 'ic-notify-a@test.com');
		const pageA = await acceptInvite(
			context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// A invites B
		const inviteB = await sendInviteAndGetPath(pageA, request, 'Notify B', 'ic-notify-b@test.com');

		// When B accepts, the bonus_earned email should go to A (the inviter), not the creator
		await acceptInvite(
			context, inviteB, 'https://www.youtube.com/watch?v=9bZkp7q19f0'
		);

		// Check A got the bonus email
		const bonusRes = await request.get(
			'/api/emails?type=bonus_earned&to=' + encodeURIComponent('ic-notify-a@test.com')
		);
		const bonusEmails = (await bonusRes.json()).emails;
		expect(bonusEmails.length).toBeGreaterThanOrEqual(1);
		expect(bonusEmails[0].metadata.acceptedName).toBe('Notify B');
	});
});
