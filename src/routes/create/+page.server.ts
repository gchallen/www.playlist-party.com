import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { parties, attendees } from '$lib/server/db/schema';
import { generateInviteToken } from '$lib/server/tokens';
import { sendCreatorWelcomeEmail, sendEmailVerification } from '$lib/server/email';
import { createSignedToken, verifySignedToken } from '$lib/server/hmac';
import { checkEmailRateLimit, recordEmailSend } from '$lib/server/rate-limit';
import { parseFlexibleTime } from '$lib/time';
import type { PageServerLoad, Actions } from './$types';

const MAPS_DOMAINS = ['google.com', 'google.co', 'goo.gl', 'maps.app.goo.gl'];

function isGoogleMapsUrl(urlStr: string): boolean {
	try {
		const url = new URL(urlStr);
		const host = url.hostname.toLowerCase();
		return MAPS_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
	} catch {
		return false;
	}
}

function extractPlaceName(mapsUrl: string): string | null {
	try {
		const url = new URL(mapsUrl);

		// /place/Empire+State+Building/@... → "Empire State Building"
		const placeMatch = url.pathname.match(/\/place\/([^/@]+)/);
		if (placeMatch) {
			return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
		}

		// ?q=Central+Park
		const q = url.searchParams.get('q');
		if (q) {
			// Skip if it looks like bare coordinates
			if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(q.trim())) return null;
			return decodeURIComponent(q.replace(/\+/g, ' '));
		}

		return null;
	} catch {
		return null;
	}
}

async function resolveLocationUrl(rawUrl: string): Promise<{ location: string | null; locationUrl: string }> {
	let finalUrl = rawUrl;

	// Follow redirects for shortened URLs
	try {
		const url = new URL(rawUrl);
		const host = url.hostname.toLowerCase();
		if (host === 'goo.gl' || host === 'maps.app.goo.gl') {
			const res = await fetch(rawUrl, { redirect: 'follow' });
			if (res.url && res.url !== rawUrl) {
				finalUrl = res.url;
			}
		}
	} catch {
		// Keep original URL on fetch failure
	}

	const placeName = extractPlaceName(finalUrl);
	return { location: placeName, locationUrl: finalUrl };
}

const VERIFY_COOKIE = 'create_verify_token';

export const load: PageServerLoad = async ({ url, platform, cookies }) => {
	const tokenFromUrl = url.searchParams.get('token');

	if (tokenFromUrl) {
		const result = verifySignedToken(tokenFromUrl, platform);
		if (result) {
			cookies.set(VERIFY_COOKIE, tokenFromUrl, {
				path: '/create',
				httpOnly: true,
				sameSite: 'lax'
			});
			redirect(303, '/create');
		}
		return { verifiedEmail: null, verificationToken: null };
	}

	const tokenFromCookie = cookies.get(VERIFY_COOKIE);
	if (tokenFromCookie) {
		const result = verifySignedToken(tokenFromCookie, platform);
		if (result) {
			return { verifiedEmail: result.email, verificationToken: tokenFromCookie };
		}
		// Token expired or invalid — clear stale cookie
		cookies.delete(VERIFY_COOKIE, { path: '/create' });
	}

	return { verifiedEmail: null, verificationToken: null };
};

export const actions = {
	verify: async ({ request, platform, url }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		const email = data.get('email')?.toString()?.trim()?.toLowerCase();
		if (!email) return fail(400, { verifyError: 'Email is required' });

		// Rate limit check
		const rateLimit = await checkEmailRateLimit(db, email);
		if (!rateLimit.allowed) {
			return fail(429, { verifyError: rateLimit.retryAfterMessage });
		}

		const token = createSignedToken(email, platform);
		const verifyUrl = `${url.origin}/create?token=${token}`;

		await sendEmailVerification(email, verifyUrl, platform);
		await recordEmailSend(db, email, 'email_verification');

		// In dev (no Resend key), return the link directly so it can be clicked
		const isDev = !platform?.env?.RESEND_API_KEY;
		return { emailSent: true, devVerifyUrl: isDev ? verifyUrl : null };
	},

	create: async ({ request, platform, url, cookies }) => {
		const db = await getDb(platform);
		const data = await request.formData();

		// Verify HMAC token
		const verificationToken = data.get('verificationToken')?.toString();
		if (!verificationToken) return fail(400, { error: 'Email verification required' });

		const verified = verifySignedToken(verificationToken, platform);
		if (!verified) return fail(400, { error: 'Verification expired. Please verify your email again.' });

		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const date = data.get('date')?.toString()?.trim();
		const rawTime = data.get('time')?.toString()?.trim() || null;
		const rawDurationHours = data.get('durationHours')?.toString()?.trim() || null;
		const rawLocationUrl = data.get('locationUrl')?.toString()?.trim() || null;
		const createdBy = data.get('createdBy')?.toString()?.trim();
		const creatorEmail = verified.email;
		const maxAttendees = parseInt(data.get('maxAttendees')?.toString() || '50', 10);
		const maxDepthRaw = data.get('maxDepth')?.toString()?.trim();
		const maxDepth = maxDepthRaw ? parseInt(maxDepthRaw, 10) : null;
		const maxInvitesRaw = data.get('maxInvitesPerGuest')?.toString()?.trim();
		const maxInvitesPerGuest = maxInvitesRaw ? parseInt(maxInvitesRaw, 10) : null;
		const songsPerGuest = Math.max(1, parseInt(data.get('songsPerGuest')?.toString() || '1', 10) || 1);

		const rawCustomMessage = data.get('customInviteMessage')?.toString()?.trim() || null;
		const customInviteMessage = rawCustomMessage ? rawCustomMessage.slice(0, 2000) : null;

		if (!name) return fail(400, { error: 'Party name is required' });
		if (!date) return fail(400, { error: 'Date is required' });
		if (!createdBy) return fail(400, { error: 'Your name is required' });
		if (isNaN(maxAttendees) || maxAttendees < 2)
			return fail(400, { error: 'Max attendees must be at least 2' });

		// Parse start time (safety net — client already sends HH:MM)
		const time = rawTime ? (parseFlexibleTime(rawTime) ?? null) : null;
		if (rawTime && !time) return fail(400, { error: 'Invalid start time' });

		// Compute end time from start + duration
		let endTime: string | null = null;
		if (time && rawDurationHours) {
			const hours = parseFloat(rawDurationHours);
			if (isNaN(hours) || hours <= 0) return fail(400, { error: 'Invalid duration' });
			const [sh, sm] = time.split(':').map(Number);
			const totalMinutes = sh * 60 + sm + Math.round(hours * 60);
			const eh = Math.floor(totalMinutes / 60) % 24;
			const em = totalMinutes % 60;
			endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
		}

		// Resolve location URL
		let location: string | null = null;
		let locationUrl: string | null = null;

		if (rawLocationUrl) {
			if (!isGoogleMapsUrl(rawLocationUrl)) {
				return fail(400, { error: 'Location must be a Google Maps link' });
			}
			const resolved = await resolveLocationUrl(rawLocationUrl);
			location = resolved.location;
			locationUrl = resolved.locationUrl;
		}

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
				locationUrl,
				createdBy,
				creatorEmail,
				maxDepth,
				maxAttendees,
				maxInvitesPerGuest,
				songsPerGuest,
				customInviteMessage
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

		const magicUrl = `${url.origin}/party/${inviteToken}`;
		await sendCreatorWelcomeEmail(creatorEmail, createdBy, name, magicUrl, platform);
		await recordEmailSend(db, creatorEmail, 'creator_welcome');

		cookies.delete(VERIFY_COOKIE, { path: '/create' });
		cookies.set(`pv_${inviteToken}`, '1', {
			path: `/party/${inviteToken}`,
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});

		redirect(303, `/party/${inviteToken}`);
	}
} satisfies Actions;
