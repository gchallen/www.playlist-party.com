import { describe, it, expect } from 'vitest';
import { computeSongStartTimes } from '../../src/lib/time';

describe('computeSongStartTimes', () => {
	it('returns formatted start times based on party start and durations', () => {
		const times = computeSongStartTimes('20:00', [180, 240, 210]);
		expect(times).toEqual(['8 PM', '8:03 PM', '8:07 PM']);
	});

	it('handles minutes rollover', () => {
		const times = computeSongStartTimes('20:58', [180]);
		// 20:58 is the first song's start
		expect(times[0]).toBe('8:58 PM');
	});

	it('handles hour rollover', () => {
		// Start at 11:55 PM with a 10-minute song
		const times = computeSongStartTimes('23:55', [600, 60]);
		expect(times[0]).toBe('11:55 PM');
		expect(times[1]).toBe('12:05 AM'); // next day
	});

	it('returns empty strings for null start time', () => {
		const times = computeSongStartTimes(null, [180, 240]);
		expect(times).toEqual(['', '']);
	});

	it('returns empty strings for undefined start time', () => {
		const times = computeSongStartTimes(undefined, [180]);
		expect(times).toEqual(['']);
	});

	it('returns empty array for empty durations', () => {
		const times = computeSongStartTimes('20:00', []);
		expect(times).toEqual([]);
	});

	it('handles noon correctly', () => {
		const times = computeSongStartTimes('12:00', [180]);
		expect(times[0]).toBe('12 PM');
	});

	it('handles midnight correctly', () => {
		const times = computeSongStartTimes('00:00', [180]);
		expect(times[0]).toBe('12 AM');
	});
});
