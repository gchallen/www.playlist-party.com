/**
 * Pure playlist logic — no DB dependency.
 * Importable by both routes and the simulator.
 */

export interface SongInfo {
	id: number;
	addedBy: number;
	durationSeconds: number;
	addedAt: string;
}

/**
 * Parse HH:MM time string, handle midnight crossing, return duration in seconds.
 * Returns null if either time is missing or unparseable.
 */
export function computeTargetDuration(
	time: string | null | undefined,
	endTime: string | null | undefined
): number | null {
	if (!time || !endTime) return null;

	const start = parseTimeToMinutes(time);
	const end = parseTimeToMinutes(endTime);
	if (start === null || end === null) return null;

	let diff = end - start;
	if (diff <= 0) diff += 24 * 60; // crosses midnight
	return diff * 60; // convert to seconds
}

function parseTimeToMinutes(t: string): number | null {
	const match = t.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/**
 * How many songs can this person have?
 * Creator: Infinity
 * Attendee: 1 (for accepting) + number of invites sent
 */
export function computeMaxSongs(isCreator: boolean, invitesSent: number): number {
	if (isCreator) return Infinity;
	return 1 + invitesSent;
}

/**
 * Can new invitations be issued?
 * False when at maxAttendees.
 * False when at target duration AND every attendee with songs has exactly 1 (nothing left to drop).
 */
export function canIssueInvitations(
	totalAttendees: number,
	maxAttendees: number,
	songs: SongInfo[],
	targetDuration: number | null
): boolean {
	if (totalAttendees >= maxAttendees) return false;

	// If no target duration, always allow (up to maxAttendees)
	if (targetDuration === null) return true;

	const totalDuration = songs.reduce((sum, s) => sum + s.durationSeconds, 0);
	if (totalDuration < targetDuration) return true;

	// We're at or over target duration — can we still drop songs to make room?
	const songsByAttendee = groupSongsByAttendee(songs);
	for (const attendeeSongs of songsByAttendee.values()) {
		if (attendeeSongs.length > 1) return true; // someone has >1 song, can drop
	}

	return false;
}

/**
 * "Make room only" strategy: determine which songs to drop so adding the new one
 * doesn't make the playlist worse. Returns song IDs to drop.
 *
 * Algorithm:
 * 1. Check if adding the new song would exceed target duration
 * 2. If so, find attendee with largest total duration ("sonic footprint") who has >1 song
 * 3. Drop their most recently added song
 * 4. Repeat if still over after accounting for the new song
 * 5. Return empty array if no drops needed, or null if the add should be rejected
 *    (nobody has >1 song and we're over target)
 */
export function computeOverflowDrops(
	existingSongs: SongInfo[],
	newSongDuration: number,
	targetDuration: number | null,
	newSongAddedBy: number
): { drops: number[] } | null {
	// No target duration means no overflow management
	if (targetDuration === null) return { drops: [] };

	const currentDuration = existingSongs.reduce((sum, s) => sum + s.durationSeconds, 0);

	// If adding the new song doesn't exceed target, no drops needed
	if (currentDuration + newSongDuration <= targetDuration) return { drops: [] };

	// We need to make room — simulate drops
	const remaining = [...existingSongs];
	const drops: number[] = [];

	// Simulate adding the new song
	const simulatedTotal = () =>
		remaining.reduce((sum, s) => sum + s.durationSeconds, 0) + newSongDuration;

	while (simulatedTotal() > targetDuration) {
		// Build footprint map including the new song's contributor
		const songsByAttendee = groupSongsByAttendee(remaining);

		// Add the new song's contribution to its attendee's count
		const newAttendeeExisting = songsByAttendee.get(newSongAddedBy) || [];
		// The new song isn't in `remaining` yet, but contributes to footprint count
		const effectiveCount = newAttendeeExisting.length + 1;

		// Find attendee with largest sonic footprint who has >1 song (counting the new one for its adder)
		let bestAttendeeId: number | null = null;
		let bestFootprint = 0;

		for (const [attendeeId, attendeeSongs] of songsByAttendee) {
			const count = attendeeId === newSongAddedBy ? effectiveCount : attendeeSongs.length;
			if (count <= 1) continue; // can't drop if they'd have 0 songs

			const footprint = attendeeSongs.reduce((sum, s) => sum + s.durationSeconds, 0) +
				(attendeeId === newSongAddedBy ? newSongDuration : 0);

			if (footprint > bestFootprint) {
				bestFootprint = footprint;
				bestAttendeeId = attendeeId;
			}
		}

		if (bestAttendeeId === null) {
			// Nobody has >1 song — can't drop anything
			return null;
		}

		const targetSongs = songsByAttendee.get(bestAttendeeId)!;
		// Drop the most recently added song from this attendee
		const sorted = [...targetSongs].sort(
			(a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
		);

		// If this is the new song's adder, they need to keep at least 1 existing song
		// (the new song will be their other one)
		const minKeep = bestAttendeeId === newSongAddedBy ? 1 : 1;
		if (sorted.length <= minKeep) {
			// Shouldn't happen given count check above, but guard anyway
			return null;
		}

		const toDrop = sorted[0];
		drops.push(toDrop.id);
		const idx = remaining.findIndex((s) => s.id === toDrop.id);
		if (idx !== -1) remaining.splice(idx, 1);
	}

	return { drops };
}

function groupSongsByAttendee(songs: SongInfo[]): Map<number, SongInfo[]> {
	const map = new Map<number, SongInfo[]>();
	for (const song of songs) {
		const group = map.get(song.addedBy) || [];
		group.push(song);
		map.set(song.addedBy, group);
	}
	return map;
}
