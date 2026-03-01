import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { parties, attendees } from '$lib/server/db/schema';
import { generatePartyCode, generateAdminToken, generateInviteToken } from '$lib/server/tokens';
import { sendCreatorWelcomeEmail } from '$lib/server/email';
import type { Actions } from './$types';

export const actions = {
	default: async ({ request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const date = data.get('date')?.toString()?.trim();
		const time = data.get('time')?.toString()?.trim() || null;
		const endTime = data.get('endTime')?.toString()?.trim() || null;
		const location = data.get('location')?.toString()?.trim() || null;
		const createdBy = data.get('createdBy')?.toString()?.trim();
		const creatorEmail = data.get('creatorEmail')?.toString()?.trim();
		const maxAttendees = parseInt(data.get('maxAttendees')?.toString() || '50', 10);
		const maxDepthRaw = data.get('maxDepth')?.toString()?.trim();
		const maxDepth = maxDepthRaw ? parseInt(maxDepthRaw, 10) : null;
		const estimatedGuestsRaw = data.get('estimatedGuests')?.toString()?.trim();
		const estimatedGuests = estimatedGuestsRaw ? parseInt(estimatedGuestsRaw, 10) : null;
		const avgSongDurationRaw = data.get('avgSongDurationSeconds')?.toString()?.trim();
		const avgSongDurationSeconds = avgSongDurationRaw ? parseInt(avgSongDurationRaw, 10) : null;

		if (!name) return fail(400, { error: 'Party name is required' });
		if (!date) return fail(400, { error: 'Date is required' });
		if (!createdBy) return fail(400, { error: 'Your name is required' });
		if (!creatorEmail) return fail(400, { error: 'Your email is required' });
		if (isNaN(maxAttendees) || maxAttendees < 2)
			return fail(400, { error: 'Max attendees must be at least 2' });

		const partyCode = generatePartyCode();
		const adminToken = generateAdminToken();
		const inviteToken = generateInviteToken();

		const [party] = await db
			.insert(parties)
			.values({
				name,
				description,
				date,
				time,
				endTime,
				location,
				createdBy,
				creatorEmail,
				partyCode,
				maxDepth,
				maxAttendees,
				estimatedGuests,
				avgSongDurationSeconds,
				adminToken
			})
			.returning();

		await db.insert(attendees).values({
			partyId: party.id,
			name: createdBy,
			email: creatorEmail,
			inviteToken,
			depth: 0,
			acceptedAt: new Date().toISOString()
		});

		const origin = url.origin;
		const magicUrl = `${origin}/attendee/${inviteToken}`;
		const adminUrl = `${origin}/party/${partyCode}/admin/${adminToken}`;

		await sendCreatorWelcomeEmail(creatorEmail, createdBy, name, magicUrl, adminUrl);

		redirect(303, `/attendee/${inviteToken}`);
	}
} satisfies Actions;
