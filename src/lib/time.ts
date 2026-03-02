/**
 * Parse flexible time input into HH:MM format.
 * Accepts: "10pm", "6:30 PM", "22:00", "noon", "midnight", "6p", "6a"
 * Returns null if unparseable.
 */
export function parseFlexibleTime(input: string): string | null {
	const s = input.trim().toLowerCase();
	if (!s) return null;

	// Special words
	if (s === 'noon') return '12:00';
	if (s === 'midnight') return '00:00';

	// 24h format: "22:00", "8:30", "0:00"
	const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
	if (match24) {
		const h = parseInt(match24[1], 10);
		const m = parseInt(match24[2], 10);
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
			return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		}
		return null;
	}

	// 12h format: "10pm", "10 PM", "6:30pm", "6:30 AM", "6p", "6a"
	const match12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am?|pm?)$/);
	if (match12) {
		let h = parseInt(match12[1], 10);
		const m = match12[2] ? parseInt(match12[2], 10) : 0;
		const period = match12[3].startsWith('p') ? 'pm' : 'am';

		if (h < 1 || h > 12 || m < 0 || m > 59) return null;

		if (period === 'am') {
			if (h === 12) h = 0;
		} else {
			if (h !== 12) h += 12;
		}

		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
	}

	return null;
}

/**
 * Format HH:MM into human-readable 12h time.
 * "18:00" → "6 PM", "18:30" → "6:30 PM", "00:00" → "12 AM"
 */
export function formatTime(hhMM: string): string {
	const parts = hhMM.split(':');
	if (parts.length !== 2) return hhMM;

	let h = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	if (isNaN(h) || isNaN(m)) return hhMM;

	const period = h >= 12 ? 'PM' : 'AM';
	if (h === 0) h = 12;
	else if (h > 12) h -= 12;

	return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Compute estimated start times for each song based on party start + cumulative durations.
 * Returns formatted 12h times (e.g., "8:15 PM").
 */
export function computeSongStartTimes(
	partyStartHHMM: string | null | undefined,
	durations: number[]
): string[] {
	if (!partyStartHHMM) return durations.map(() => '');

	const parts = partyStartHHMM.split(':');
	if (parts.length !== 2) return durations.map(() => '');

	const startH = parseInt(parts[0], 10);
	const startM = parseInt(parts[1], 10);
	if (isNaN(startH) || isNaN(startM)) return durations.map(() => '');

	let totalSeconds = startH * 3600 + startM * 60;
	const times: string[] = [];

	for (const dur of durations) {
		const h = Math.floor(totalSeconds / 3600) % 24;
		const m = Math.floor((totalSeconds % 3600) / 60);
		const hh = String(h).padStart(2, '0');
		const mm = String(m).padStart(2, '0');
		times.push(formatTime(`${hh}:${mm}`));
		totalSeconds += dur;
	}

	return times;
}
