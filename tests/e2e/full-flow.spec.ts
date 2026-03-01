import { test, expect } from '@playwright/test';

test.describe('Full Party Lifecycle', () => {

	test('complete party lifecycle from creation to reveal', async ({
		page,
		context,
		request
	}) => {
		const creatorEmail = 'ff-creator@test.com';

		// 1. Creator visits landing page and navigates to create
		await page.goto('/');
		await page.getByRole('link', { name: /start a party/i }).click();
		await expect(page).toHaveURL('/create');

		// 2. Creator fills out the party form
		await page.getByLabel(/party name/i).fill('Full Flow Party');
		await page.getByLabel(/description/i).fill('Testing the complete lifecycle');
		await page.getByLabel(/date/i).fill('2026-08-15');
		await page.getByLabel(/start time/i).fill('19:00');
		await page.getByLabel(/location/i).fill('Flow Hall');
		await page.getByLabel(/your name/i).fill('Flow Creator');
		await page.locator('[data-testid="creator-email"]').fill(creatorEmail);
		await page.locator('[data-testid="genre-select"]').selectOption('rock');
		await page.locator('[data-testid="max-attendees"]').fill('10');

		await page.getByRole('button', { name: /create party/i }).click();

		// 3. Creator is redirected to attendee dashboard
		await expect(page).toHaveURL(/\/attendee\/.+/);
		await expect(page.getByText(/Welcome.*Flow Creator/i)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Full Flow Party' })).toBeVisible();

		// 4. Creator sends invite to friend1
		await page.locator('[data-testid="invite-name"]').fill('Friend One');
		await page.locator('[data-testid="invite-email"]').fill('ff-friend1@test.com');
		await page.locator('[data-testid="send-invite-btn"]').click();
		await expect(page.locator('[data-testid="invite-sent-success"]')).toBeVisible();

		// Creator sends invite to friend2
		await page.locator('[data-testid="invite-name"]').fill('Friend Two');
		await page.locator('[data-testid="invite-email"]').fill('ff-friend2@test.com');
		await page.locator('[data-testid="send-invite-btn"]').click();
		await expect(page.locator('[data-testid="invite-sent-success"]')).toBeVisible();

		// 5. Verify invite emails were sent
		const friend1EmailRes = await request.get(
			'/api/emails?type=invite&to=' + encodeURIComponent('ff-friend1@test.com')
		);
		const friend1Emails = (await friend1EmailRes.json()).emails;
		expect(friend1Emails.length).toBe(1);
		expect(friend1Emails[0].metadata.partyName).toBe('Full Flow Party');

		const friend2EmailRes = await request.get(
			'/api/emails?type=invite&to=' + encodeURIComponent('ff-friend2@test.com')
		);
		const friend2Emails = (await friend2EmailRes.json()).emails;
		expect(friend2Emails.length).toBe(1);

		// Extract invite paths
		const friend1InvitePath = new URL(friend1Emails[0].metadata.magicUrl).pathname;
		const friend2InvitePath = new URL(friend2Emails[0].metadata.magicUrl).pathname;

		// 6. Friend1 opens invite link, sees party info, accepts
		const friend1Page = await context.newPage();
		await friend1Page.goto(friend1InvitePath);

		await expect(friend1Page.getByRole('heading', { name: 'Full Flow Party' })).toBeVisible();
		await expect(friend1Page.locator('[data-testid="name-input"]')).toHaveValue('Friend One');
		await friend1Page.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		await friend1Page.locator('[data-testid="accept-btn"]').click();

		// 7. Friend1 is redirected to their dashboard
		await expect(friend1Page).toHaveURL(/\/attendee\/.+/);
		await expect(friend1Page.getByText(/Welcome.*Friend One/i)).toBeVisible();

		// 8. Verify creator got a bonus_earned email
		const bonusRes = await request.get(
			'/api/emails?type=bonus_earned&to=' + encodeURIComponent(creatorEmail)
		);
		const bonusEmails = (await bonusRes.json()).emails;
		expect(bonusEmails.length).toBeGreaterThanOrEqual(1);
		expect(bonusEmails[0].metadata.acceptedName).toBe('Friend One');

		// 9. Friend2 accepts with a different song
		const friend2Page = await context.newPage();
		await friend2Page.goto(friend2InvitePath);
		await friend2Page.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
		await friend2Page.locator('[data-testid="accept-btn"]').click();
		await expect(friend2Page).toHaveURL(/\/attendee\/.+/);

		// 10. Friend1 sends invite to friend3 (creating depth=2 chain)
		await friend1Page.reload();
		await friend1Page.locator('[data-testid="invite-name"]').fill('Friend Three');
		await friend1Page.locator('[data-testid="invite-email"]').fill('ff-friend3@test.com');
		await friend1Page.locator('[data-testid="send-invite-btn"]').click();
		await expect(friend1Page.locator('[data-testid="invite-sent-success"]')).toBeVisible();

		// 11. Friend3 accepts their invite
		const friend3EmailRes = await request.get(
			'/api/emails?type=invite&to=' + encodeURIComponent('ff-friend3@test.com')
		);
		const friend3Emails = (await friend3EmailRes.json()).emails;
		const friend3InvitePath = new URL(friend3Emails[0].metadata.magicUrl).pathname;

		const friend3Page = await context.newPage();
		await friend3Page.goto(friend3InvitePath);
		await friend3Page.locator('[data-testid="youtube-url"]').fill('https://www.youtube.com/watch?v=kJQP7kiw5Fk');
		await friend3Page.locator('[data-testid="accept-btn"]').click();
		await expect(friend3Page).toHaveURL(/\/attendee\/.+/);

		// 12. Navigate to the playlist page — verify songs shown, names hidden
		const partyLink = page.getByRole('link', { name: 'View Playlist' });
		const partyHref = await partyLink.getAttribute('href');
		expect(partyHref).toBeTruthy();
		await page.goto(partyHref!);

		await expect(page.getByRole('heading', { name: 'Full Flow Party' })).toBeVisible();
		await expect(page.getByText('3 tracks')).toBeVisible();
		await expect(page.locator('.song-card')).toHaveCount(3);

		// Names should be hidden (not revealed yet)
		await expect(page.getByText('Friend One')).not.toBeVisible();
		await expect(page.getByText('Friend Two')).not.toBeVisible();
		await expect(page.getByText('Friend Three')).not.toBeVisible();

		// 13. Creator navigates to admin panel
		const adminRes = await request.get(
			'/api/emails?type=creator_welcome&to=' + encodeURIComponent(creatorEmail)
		);
		const adminEmails = (await adminRes.json()).emails;
		const adminPath = new URL(adminEmails[0].metadata.adminUrl).pathname;

		const adminPage = await context.newPage();
		await adminPage.goto(adminPath);

		// Should see 4 attendees (creator + 3 friends)
		const attendeesSection = adminPage.locator('[data-testid="attendees-section"]');
		await expect(attendeesSection).toContainText('Attendees (4)');
		await expect(attendeesSection).toContainText('Flow Creator');
		await expect(attendeesSection).toContainText('Friend One');
		await expect(attendeesSection).toContainText('Friend Two');
		await expect(attendeesSection).toContainText('Friend Three');

		// 14. Creator clicks Reveal
		await adminPage.getByRole('button', { name: /reveal names/i }).click();
		await expect(adminPage.getByText(/names have been revealed/i)).toBeVisible();

		// 15. Navigate back to playlist page — verify names are now visible
		await page.goto(partyHref!);

		await expect(page.getByText('Friend One')).toBeVisible();
		await expect(page.getByText('Friend Two')).toBeVisible();
		await expect(page.getByText('Friend Three')).toBeVisible();
	});
});
