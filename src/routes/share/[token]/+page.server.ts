import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { parties, attendees, songs } from '$lib/server/db/schema';
import { generateInviteToken, generateShareToken } from '$lib/server/tokens';
import { sendInviteEmail } from '$lib/server/email';
import { recordEmailSend } from '$lib/server/rate-limit';
import { computeTargetDuration } from '$lib/server/playlist';
import { validateInvite, toSongInfo } from '$lib/server/invite-validation';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = await getDb(platform);

	const sharer = await db.query.attendees.findFirst({
		where: eq(attendees.shareToken, params.token)
	});

	if (!sharer) {
		error(404, 'Not found');
	}

	const party = await db.query.parties.findFirst({
		where: eq(parties.id, sharer.partyId)
	});

	if (!party) {
		error(404, 'Party not found');
	}

	const allAttendeesList = await db.query.attendees.findMany({
		where: eq(attendees.partyId, party.id)
	});
	const activeCount = allAttendeesList.filter((a) => !a.declinedAt).length;

	const allSongs = await db.query.songs.findMany({
		where: eq(songs.partyId, party.id)
	});

	const isFull = activeCount >= party.maxAttendees;

	return {
		party: {
			name: party.name,
			date: party.date,
			time: party.time,
			location: party.location,
			locationUrl: party.locationUrl,
			description: party.description
		},
		sharerName: sharer.name,
		songCount: allSongs.length,
		attendeeCount: activeCount,
		isFull
	};
};

export const actions = {
	join: async ({ params, request, platform, url }) => {
		const db = await getDb(platform);

		const sharer = await db.query.attendees.findFirst({
			where: eq(attendees.shareToken, params.token)
		});

		if (!sharer) {
			return fail(404, { joinError: 'Invalid share link' });
		}

		const party = await db.query.parties.findFirst({
			where: eq(parties.id, sharer.partyId)
		});

		if (!party) {
			return fail(404, { joinError: 'Party not found' });
		}

		const data = await request.formData();
		const name = data.get('name')?.toString()?.trim();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();

		if (!name) return fail(400, { joinError: 'Your name is required' });
		if (!email) return fail(400, { joinError: 'Your email is required' });

		const allAttendeesList = await db.query.attendees.findMany({
			where: eq(attendees.partyId, party.id)
		});

		const allSongs = await db.query.songs.findMany({
			where: eq(songs.partyId, party.id)
		});
		const targetDuration = computeTargetDuration(party.time, party.endTime);

		const validationError = await validateInvite(
			{
				db,
				party,
				attendee: sharer,
				allAttendees: allAttendeesList,
				allSongs: allSongs.map(toSongInfo),
				targetDuration
			},
			name,
			email
		);

		if (validationError) {
			return fail(400, { joinError: validationError });
		}

		const newToken = generateInviteToken();

		await db.insert(attendees).values({
			partyId: party.id,
			name,
			email,
			invitedBy: sharer.id,
			inviteToken: newToken,
			shareToken: generateShareToken(),
			depth: sharer.depth + 1
		});

		const magicUrl = `${url.origin}/party/${newToken}`;
		await sendInviteEmail({
			to: email,
			inviteeName: name,
			inviterName: sharer.name,
			partyName: party.name,
			magicUrl,
			platform,
			customSubject: party.customInviteSubject,
			customMessage: party.customInviteMessage ?? '',
			replyTo: party.creatorEmail
		});
		await recordEmailSend(db, email, 'invite');

		return { joinSuccess: true };
	}
} satisfies Actions;
