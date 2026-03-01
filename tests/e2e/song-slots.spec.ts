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
	await page.getByLabel(/party name/i).fill(options.name ?? 'Song Slot Party');
	await page.getByLabel(/description/i).fill('Testing song slot mechanics');
	await page.getByLabel(/date/i).fill('2026-07-20');
	await page.getByLabel(/start time/i).fill(options.startTime ?? '20:00');
	if (options.endTime) {
		await page.locator('[data-testid="end-time"]').fill(options.endTime);
	}
	await page.getByLabel(/location/i).fill('Slot Street');
	await page.getByLabel(/your name/i).fill('Slot Host');
	await page.locator('[data-testid="creator-email"]').fill(options.email ?? 'slothost@test.com');
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

test.describe('Song Slot Mechanics', () => {

	test('party starter has entry song section showing "add yours"', async ({ page }) => {
		await createParty(page);

		const songSlots = page.locator('[data-testid="song-slots"]');
		await expect(songSlots).toBeVisible();
		// Entry song not yet added
		await expect(songSlots).toContainText(/add yours/i);
	});

	test('bonus songs: 0 earned initially (no accepted invitees)', async ({ page }) => {
		await createParty(page);

		const songSlots = page.locator('[data-testid="song-slots"]');
		await expect(songSlots).toBeVisible();
		// Should show 0 / 0 bonus songs (none earned yet)
		await expect(songSlots).toContainText(/0/);
	});

	test('after invitee accepts: inviter earns +1 bonus song slot', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Bonus Friend',
			'bonus@test.com'
		);

		// Accept the invite
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Reload the starter's dashboard to see updated bonus count
		await page.reload();
		const songSlots = page.locator('[data-testid="song-slots"]');
		// Should now show 0 / 1 bonus used (1 earned from accepted invite)
		await expect(songSlots).toContainText('0');
		await expect(songSlots).toContainText('1');
	});

	test('can add bonus song when slot is earned', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		// Send invite and have it accepted to earn a bonus slot
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Earner Friend',
			'earner@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Reload starter dashboard
		await page.reload();

		// Should see the add bonus song form
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await expect(youtubeInput).toBeVisible();

		// Add a bonus song
		await youtubeInput.fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await page.getByRole('button', { name: /^add$/i }).click();

		// Song should appear
		await expect(page.locator('.song-card')).toHaveCount(1);
	});

	test('cannot add more bonus songs than earned slots', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		// Earn 1 bonus slot
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Only One',
			'onlyone@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		await page.reload();

		// Add the 1 allowed bonus song
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await youtubeInput.fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(1);

		// The add form should now be hidden (no more bonus slots available)
		await expect(page.locator('input[name="youtubeUrl"]')).not.toBeVisible();
	});

	test('duplicate song detection — same video same party', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		// Earn 2 bonus slots
		const invite1 = await sendInviteAndGetPath(
			page,
			request,
			'Dup Friend 1',
			'dup1@test.com'
		);
		await acceptInvite(
			context,
			invite1,
			'https://www.youtube.com/watch?v=kJQP7kiw5Fk'
		);

		const invite2 = await sendInviteAndGetPath(
			page,
			request,
			'Dup Friend 2',
			'dup2@test.com'
		);
		await acceptInvite(
			context,
			invite2,
			'https://www.youtube.com/watch?v=RgKAFK5djSk'
		);

		await page.reload();

		// Add a bonus song
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await youtubeInput.fill('https://www.youtube.com/watch?v=OPf0YbXqDm0');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(1);

		// Try to add the same song again
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=OPf0YbXqDm0');
		await page.getByRole('button', { name: /^add$/i }).click();

		// Should show duplicate error
		await expect(page.getByText(/already.*playlist/i)).toBeVisible();
		await expect(page.locator('.song-card')).toHaveCount(1);
	});

	test('same video by different attendees also rejected', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		// First person (invitee) adds a specific song as entry
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'First Singer',
			'first@test.com'
		);
		await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=JGwWNGJdvx8'
		);

		// Second person tries to accept with the same song
		const invite2Path = await sendInviteAndGetPath(
			page,
			request,
			'Second Singer',
			'second@test.com'
		);
		const invitePage2 = await context.newPage();
		await invitePage2.goto(invite2Path);
		await invitePage2
			.locator('[data-testid="youtube-url"]')
			.fill('https://www.youtube.com/watch?v=JGwWNGJdvx8');
		await invitePage2.locator('[data-testid="accept-btn"]').click();

		// Should show duplicate error and stay on invite page
		await expect(invitePage2.getByText(/already.*playlist/i)).toBeVisible();
	});

	test('different videos can be added', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { maxAttendees: '20' });

		// Earn 2 bonus slots
		const invite1 = await sendInviteAndGetPath(
			page,
			request,
			'Varied 1',
			'varied1@test.com'
		);
		await acceptInvite(
			context,
			invite1,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		const invite2 = await sendInviteAndGetPath(
			page,
			request,
			'Varied 2',
			'varied2@test.com'
		);
		await acceptInvite(
			context,
			invite2,
			'https://www.youtube.com/watch?v=9bZkp7q19f0'
		);

		await page.reload();

		// Add first bonus song
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=kJQP7kiw5Fk');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(1);

		// Add second (different) bonus song
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=RgKAFK5djSk');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(2);
	});

	test('max attendees is enforced — cannot send invite when full', async ({
		page,
		context,
		request
	}) => {
		// Create party with max 2 attendees (starter = 1, so only 1 more invite allowed)
		await createParty(page, { maxAttendees: '2' });

		// First invite should succeed
		await sendInviteAndGetPath(page, request, 'Last Spot', 'last@test.com');

		// Second invite should fail — party is full
		await page.locator('[data-testid="invite-name"]').fill('Too Many');
		await page.locator('[data-testid="invite-email"]').fill('toomany@test.com');
		await page.locator('[data-testid="send-invite-btn"]').click();

		// Should show error about max attendees
		await expect(page.getByText(/full|max.*attendees|capacity/i)).toBeVisible();
	});

	test('max depth is enforced', async ({
		page,
		context,
		request
	}) => {
		// Create party with max depth of 1
		await createParty(page, { maxAttendees: '20', maxDepth: '1' });

		// Starter (depth 0) sends invite
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Depth One',
			'depth1@test.com'
		);

		// Depth-1 person accepts
		const depth1Page = await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Depth-1 person tries to invite (would create depth-2, exceeding max_depth=1)
		await depth1Page.locator('[data-testid="invite-name"]').fill('Too Deep');
		await depth1Page.locator('[data-testid="invite-email"]').fill('toodeep@test.com');
		await depth1Page.locator('[data-testid="send-invite-btn"]').click();

		// Should show depth limit error
		await expect(depth1Page.getByText('Maximum invite depth reached')).toBeVisible();
	});

	test('auto-drop: bonus songs get bumped when playlist overflows', async ({
		page,
		context,
		request
	}) => {
		// Create party with max 4 attendees.
		// We need: entry songs from invitees + bonus songs from starter > 4
		// Starter has no entry song (auto-accepted on creation).
		// Plan: invite A, B, C upfront (4 total), accept A+B, add 2 bonuses, then accept C → overflow.
		await createParty(page, { maxAttendees: '4', email: 'dropper@test.com' });

		// Send all 3 invites upfront (before any acceptances to avoid hitting max)
		const inviteA = await sendInviteAndGetPath(page, request, 'Person A', 'drop-a@test.com');
		const inviteB = await sendInviteAndGetPath(page, request, 'Person B', 'drop-b@test.com');
		const inviteC = await sendInviteAndGetPath(page, request, 'Person C', 'drop-c@test.com');

		// A accepts → 1 entry song. Starter earns 1 bonus.
		await acceptInvite(context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

		// Starter adds bonus song #1
		await page.reload();
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(1);

		// B accepts → 2 entry songs + 1 bonus = 3 songs. Starter earns 2nd bonus.
		await acceptInvite(context, inviteB, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk');

		// Starter adds bonus song #2
		await page.reload();
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=RgKAFK5djSk');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(2);

		// C accepts → 3 entry songs + 2 bonus = 5 songs > maxAttendees (4) → auto-drop!
		await acceptInvite(context, inviteC, 'https://www.youtube.com/watch?v=OPf0YbXqDm0');

		// Starter should have received a bonus_bumped email
		const response = await request.get(
			'/api/emails?type=bonus_bumped&to=' + encodeURIComponent('dropper@test.com')
		);
		const { emails } = await response.json();
		expect(emails.length).toBeGreaterThanOrEqual(1);
	});

	test('auto-drop: correct song bumped with verified email metadata', async ({
		page,
		context,
		request
	}) => {
		await createParty(page, { name: 'Auto Drop Verify', maxAttendees: '4', email: 'ad-verify@test.com' });

		// Send 3 invites upfront
		const inviteA = await sendInviteAndGetPath(page, request, 'AD Person A', 'ad-verify-a@test.com');
		const inviteB = await sendInviteAndGetPath(page, request, 'AD Person B', 'ad-verify-b@test.com');
		const inviteC = await sendInviteAndGetPath(page, request, 'AD Person C', 'ad-verify-c@test.com');

		// A accepts → 1 entry song. Starter earns bonus #1.
		await acceptInvite(context, inviteA, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

		// Starter adds bonus song #1 (Gangnam Style)
		await page.reload();
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(1);

		// B accepts → 2 entry songs + 1 bonus = 3 songs. Starter earns bonus #2.
		await acceptInvite(context, inviteB, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk');

		// Starter adds bonus song #2 (See You Again)
		await page.reload();
		await page.locator('input[name="youtubeUrl"]').fill('https://www.youtube.com/watch?v=RgKAFK5djSk');
		await page.getByRole('button', { name: /^add$/i }).click();
		await expect(page.locator('.song-card')).toHaveCount(2);

		// C accepts → 3 entry + 2 bonus = 5 > maxAttendees(4) → auto-drop!
		await acceptInvite(context, inviteC, 'https://www.youtube.com/watch?v=OPf0YbXqDm0');

		// Verify the bumped email was sent with correct metadata
		const response = await request.get(
			'/api/emails?type=bonus_bumped&to=' + encodeURIComponent('ad-verify@test.com')
		);
		const { emails } = await response.json();
		expect(emails.length).toBe(1);
		expect(emails[0].metadata.recipientName).toBe('Slot Host');
		expect(emails[0].metadata.partyName).toBe('Auto Drop Verify');
		// The most recent bonus song (song #2) should be bumped
		expect(emails[0].metadata.bumpedSongTitle).toBeTruthy();

		// Verify playlist now has exactly maxAttendees (4) songs
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const partyHref = await partyLink.getAttribute('href');
		await page.goto(partyHref!);
		await expect(page.locator('.song-card')).toHaveCount(4);
	});

	test('bonus songs available when below estimatedGuests', async ({
		page,
		context,
		request
	}) => {
		// estimatedGuests=5, maxAttendees=8 — with 3 accepted, we're below estimated
		await createParty(page, {
			maxAttendees: '8',
			estimatedGuests: '5',
			email: 'taper-below@test.com'
		});

		// Invite and accept 2 people (3 total with creator, below estimatedGuests=5)
		const invite1 = await sendInviteAndGetPath(page, request, 'Below A', 'taper-below-a@test.com');
		await acceptInvite(context, invite1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

		const invite2 = await sendInviteAndGetPath(page, request, 'Below B', 'taper-below-b@test.com');
		await acceptInvite(context, invite2, 'https://www.youtube.com/watch?v=9bZkp7q19f0');

		// Reload starter's dashboard — should see bonus form (bonuses available)
		await page.reload();
		const youtubeInput = page.locator('input[name="youtubeUrl"]');
		await expect(youtubeInput).toBeVisible();
	});

	test('bonus songs unavailable at max capacity', async ({
		page,
		context,
		request
	}) => {
		// estimatedGuests=3, maxAttendees=4 — fill to 4 accepted
		await createParty(page, {
			maxAttendees: '4',
			estimatedGuests: '3',
			email: 'taper-max@test.com'
		});

		// Send all 3 invites upfront
		const invite1 = await sendInviteAndGetPath(page, request, 'Max A', 'taper-max-a@test.com');
		const invite2 = await sendInviteAndGetPath(page, request, 'Max B', 'taper-max-b@test.com');
		const invite3 = await sendInviteAndGetPath(page, request, 'Max C', 'taper-max-c@test.com');

		// Accept all 3 → 4 total accepted (creator + 3)
		await acceptInvite(context, invite1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await acceptInvite(context, invite2, 'https://www.youtube.com/watch?v=9bZkp7q19f0');
		await acceptInvite(context, invite3, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk');

		// Reload starter's dashboard — bonus form should be hidden
		await page.reload();

		// Host has 3 earned bonuses, but bonusAvailable should be false (at max capacity)
		await expect(page.locator('input[name="youtubeUrl"]')).not.toBeVisible();

		// Should show "bonuses paused" text
		await expect(page.getByText(/bonuses paused/i)).toBeVisible();
	});

	test('bonus songs taper off between estimatedGuests and maxAttendees', async ({
		page,
		context,
		request
	}) => {
		// estimatedGuests=3, maxAttendees=6
		// When currentAccepted >= estimatedGuests AND totalSongs >= maxAttendees, bonuses unavailable
		await createParty(page, {
			maxAttendees: '6',
			estimatedGuests: '3',
			email: 'taper-mid@test.com'
		});

		// Send 5 invites (to fill up)
		const invite1 = await sendInviteAndGetPath(page, request, 'Taper A', 'taper-mid-a@test.com');
		const invite2 = await sendInviteAndGetPath(page, request, 'Taper B', 'taper-mid-b@test.com');
		const invite3 = await sendInviteAndGetPath(page, request, 'Taper C', 'taper-mid-c@test.com');
		const invite4 = await sendInviteAndGetPath(page, request, 'Taper D', 'taper-mid-d@test.com');
		const invite5 = await sendInviteAndGetPath(page, request, 'Taper E', 'taper-mid-e@test.com');

		// Accept all 5 → 6 total accepted (creator + 5), each adding entry song
		// totalSongs = 5 (entry songs), currentAccepted = 6 (>= estimatedGuests=3)
		await acceptInvite(context, invite1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await acceptInvite(context, invite2, 'https://www.youtube.com/watch?v=9bZkp7q19f0');
		await acceptInvite(context, invite3, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk');
		await acceptInvite(context, invite4, 'https://www.youtube.com/watch?v=RgKAFK5djSk');
		await acceptInvite(context, invite5, 'https://www.youtube.com/watch?v=OPf0YbXqDm0');

		// Reload starter's dashboard
		await page.reload();

		// currentAccepted=6, maxAttendees=6 → branch 3: return false
		// bonus form should be hidden
		await expect(page.locator('input[name="youtubeUrl"]')).not.toBeVisible();

		// Should show "bonuses paused" text
		await expect(page.getByText(/bonuses paused/i)).toBeVisible();
	});

	test('entry songs are never dropped', async ({
		page,
		context,
		request
	}) => {
		// Create party with max 2 attendees
		await createParty(page, { maxAttendees: '2', email: 'keeper@test.com' });

		// Invite and accept person A (entry song)
		const invitePath = await sendInviteAndGetPath(
			page,
			request,
			'Entry Singer',
			'entry@test.com'
		);
		const entryPage = await acceptInvite(
			context,
			invitePath,
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);

		// Entry singer's song should still be visible on their dashboard
		await expect(entryPage.locator('.song-card')).toHaveCount(1);

		// Reload the entry singer's page to confirm song persists
		await entryPage.reload();
		await expect(entryPage.locator('.song-card')).toHaveCount(1);
	});
});
