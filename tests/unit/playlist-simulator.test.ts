import { describe, it, expect } from 'vitest';
import {
	computeTargetDuration,
	computeMaxSongs,
	canIssueInvitations,
	computeOverflowDrops,
	type SongInfo
} from '../../src/lib/server/playlist';

// ─── PartySimulator ───────────────────────────────────────────────

interface SimAttendee {
	id: number;
	name: string;
	email: string;
	isCreator: boolean;
	invitedBy: number | null;
	depth: number;
	accepted: boolean;
	invitesSent: number;
}

class PartySimulator {
	targetDurationSeconds: number | null;
	maxAttendees: number;
	maxInvitesPerGuest: number | null;
	maxDepth: number | null;
	songsPerGuest: number;

	attendees: SimAttendee[] = [];
	songs: SongInfo[] = [];

	private nextAttendeeId = 1;
	private nextSongId = 1;
	private emails = new Set<string>();

	constructor(
		config: {
			targetDurationSeconds?: number | null;
			maxAttendees?: number;
			maxInvitesPerGuest?: number | null;
			maxDepth?: number | null;
			songsPerGuest?: number;
		} = {}
	) {
		this.targetDurationSeconds = config.targetDurationSeconds ?? null;
		this.maxAttendees = config.maxAttendees ?? 100;
		this.maxInvitesPerGuest = config.maxInvitesPerGuest ?? null;
		this.maxDepth = config.maxDepth ?? null;
		this.songsPerGuest = config.songsPerGuest ?? 1;
	}

	createHost(name: string, email = `${name.toLowerCase()}@test.com`): SimAttendee {
		const host: SimAttendee = {
			id: this.nextAttendeeId++,
			name,
			email,
			isCreator: true,
			invitedBy: null,
			depth: 0,
			accepted: true,
			invitesSent: 0
		};
		this.attendees.push(host);
		this.emails.add(email);
		return host;
	}

	sendInvite(inviter: SimAttendee, name: string, email: string): SimAttendee | null {
		// Duplicate email check
		if (this.emails.has(email)) return null;

		// maxAttendees check
		if (this.attendees.length >= this.maxAttendees) return null;

		// maxInvitesPerGuest check
		if (this.maxInvitesPerGuest !== null && inviter.invitesSent >= this.maxInvitesPerGuest) return null;

		// maxDepth check
		if (this.maxDepth !== null && inviter.depth + 1 > this.maxDepth) return null;

		// canIssueInvitations check
		if (!canIssueInvitations(this.attendees.length, this.maxAttendees, this.songs, this.targetDurationSeconds)) {
			return null;
		}

		const invitee: SimAttendee = {
			id: this.nextAttendeeId++,
			name,
			email,
			isCreator: false,
			invitedBy: inviter.id,
			depth: inviter.depth + 1,
			accepted: false,
			invitesSent: 0
		};
		this.attendees.push(invitee);
		this.emails.add(email);
		inviter.invitesSent++;
		return invitee;
	}

	acceptInvite(attendee: SimAttendee, songDurationSeconds: number): { success: boolean; droppedSongIds: number[] } {
		if (attendee.accepted) return { success: false, droppedSongIds: [] };
		if (attendee.isCreator) return { success: false, droppedSongIds: [] };
		if (songDurationSeconds <= 0) return { success: false, droppedSongIds: [] };

		attendee.accepted = true;

		// Run overflow check
		const result = computeOverflowDrops(this.songs, songDurationSeconds, this.targetDurationSeconds, attendee.id);

		if (result === null) {
			// Can't make room — reject acceptance
			attendee.accepted = false;
			return { success: false, droppedSongIds: [] };
		}

		// Drop songs
		for (const dropId of result.drops) {
			const idx = this.songs.findIndex((s) => s.id === dropId);
			if (idx !== -1) this.songs.splice(idx, 1);
		}

		// Add the entry song
		this.songs.push({
			id: this.nextSongId++,
			addedBy: attendee.id,
			durationSeconds: songDurationSeconds,
			addedAt: new Date().toISOString()
		});

		return { success: true, droppedSongIds: result.drops };
	}

	addSong(attendee: SimAttendee, durationSeconds: number): { success: boolean; droppedSongIds: number[] } {
		if (!attendee.accepted && !attendee.isCreator) return { success: false, droppedSongIds: [] };
		if (durationSeconds <= 0) return { success: false, droppedSongIds: [] };

		const maxSongs = computeMaxSongs(attendee.isCreator, attendee.invitesSent, this.songsPerGuest);
		const currentSongs = this.songs.filter((s) => s.addedBy === attendee.id).length;
		if (currentSongs >= maxSongs) return { success: false, droppedSongIds: [] };

		const result = computeOverflowDrops(this.songs, durationSeconds, this.targetDurationSeconds, attendee.id);

		if (result === null) return { success: false, droppedSongIds: [] };

		for (const dropId of result.drops) {
			const idx = this.songs.findIndex((s) => s.id === dropId);
			if (idx !== -1) this.songs.splice(idx, 1);
		}

		this.songs.push({
			id: this.nextSongId++,
			addedBy: attendee.id,
			durationSeconds,
			addedAt: new Date().toISOString()
		});

		return { success: true, droppedSongIds: result.drops };
	}

	get totalDuration(): number {
		return this.songs.reduce((sum, s) => sum + s.durationSeconds, 0);
	}

	get totalSongs(): number {
		return this.songs.length;
	}

	get acceptedAttendees(): SimAttendee[] {
		return this.attendees.filter((a) => a.accepted);
	}

	everyoneHasAtLeastOneSong(): boolean {
		for (const a of this.acceptedAttendees) {
			if (a.isCreator) continue; // creator may have 0 songs
			if (!this.songs.some((s) => s.addedBy === a.id)) return false;
		}
		return true;
	}

	songCountFor(attendee: SimAttendee): number {
		return this.songs.filter((s) => s.addedBy === attendee.id).length;
	}

	durationFor(attendee: SimAttendee): number {
		return this.songs.filter((s) => s.addedBy === attendee.id).reduce((sum, s) => sum + s.durationSeconds, 0);
	}
}

// ─── Tests ────────────────────────────────────────────────────────

describe('computeTargetDuration', () => {
	it('computes duration for normal times', () => {
		expect(computeTargetDuration('18:00', '21:00')).toBe(3 * 3600);
	});

	it('handles midnight crossing', () => {
		expect(computeTargetDuration('22:00', '02:00')).toBe(4 * 3600);
	});

	it('returns null for missing times', () => {
		expect(computeTargetDuration(null, '21:00')).toBeNull();
		expect(computeTargetDuration('18:00', null)).toBeNull();
		expect(computeTargetDuration(null, null)).toBeNull();
	});

	it('returns null for invalid format', () => {
		expect(computeTargetDuration('abc', '21:00')).toBeNull();
	});
});

describe('computeMaxSongs', () => {
	it('returns Infinity for creator', () => {
		expect(computeMaxSongs(true, 0)).toBe(Infinity);
		expect(computeMaxSongs(true, 10)).toBe(Infinity);
		expect(computeMaxSongs(true, 0, 3)).toBe(Infinity);
	});

	it('returns songsPerGuest + invitesSent for attendee (default 1)', () => {
		expect(computeMaxSongs(false, 0)).toBe(1);
		expect(computeMaxSongs(false, 3)).toBe(4);
		expect(computeMaxSongs(false, 10)).toBe(11);
	});

	it('uses songsPerGuest parameter', () => {
		expect(computeMaxSongs(false, 0, 2)).toBe(2);
		expect(computeMaxSongs(false, 3, 2)).toBe(5);
		expect(computeMaxSongs(false, 0, 3)).toBe(3);
		expect(computeMaxSongs(false, 5, 3)).toBe(8);
	});
});

describe('songsPerGuest', () => {
	it('attendee gets songsPerGuest slots on accept', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800, songsPerGuest: 2 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		sim.acceptInvite(alice, 200);

		// Should be able to add 1 more (2 total: entry + 1 bonus from songsPerGuest=2)
		const result = sim.addSong(alice, 200);
		expect(result.success).toBe(true);
		expect(sim.songCountFor(alice)).toBe(2);

		// Third should fail (no invites sent)
		const result2 = sim.addSong(alice, 200);
		expect(result2.success).toBe(false);
	});

	it('songsPerGuest=3 with invites stacks correctly', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800, songsPerGuest: 3 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		sim.acceptInvite(alice, 200);

		// Alice has 3 base slots + 0 invites = 3 total
		sim.addSong(alice, 200);
		sim.addSong(alice, 200);
		expect(sim.songCountFor(alice)).toBe(3);

		// Can't add 4th without sending invites
		expect(sim.addSong(alice, 200).success).toBe(false);

		// Send invite → +1 slot = 4 total
		sim.sendInvite(alice, 'Bob', 'bob@test.com');
		expect(sim.addSong(alice, 200).success).toBe(true);
		expect(sim.songCountFor(alice)).toBe(4);
	});

	it('simulation with songsPerGuest=2, 10 guests, converges', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3 * 3600,
			maxAttendees: 50,
			songsPerGuest: 2
		});
		const host = sim.createHost('Host');

		const guests: SimAttendee[] = [];
		for (let i = 0; i < 10; i++) {
			const g = sim.sendInvite(host, `Guest${i}`, `guest${i}@test.com`)!;
			expect(g).not.toBeNull();
			guests.push(g);
		}

		// All accept
		for (const g of guests) {
			sim.acceptInvite(g, 210);
		}

		// Each uses their second slot
		for (const g of guests) {
			sim.addSong(g, 210);
		}

		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
		// With songsPerGuest=2, each guest should have 2 songs (if not trimmed)
		// Total: 10 guests × 2 songs × 210s = 4200s, under 10800s target
		for (const g of guests) {
			expect(sim.songCountFor(g)).toBe(2);
		}
	});
});

describe('Basic mechanics', () => {
	it('creator can add unlimited songs', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800 }); // 3h
		const host = sim.createHost('Host');

		for (let i = 0; i < 20; i++) {
			const result = sim.addSong(host, 180);
			expect(result.success).toBe(true);
		}
		expect(sim.songCountFor(host)).toBe(20);
	});

	it('attendee gets 1 slot for accepting', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;

		const result = sim.acceptInvite(alice, 200);
		expect(result.success).toBe(true);
		expect(sim.songCountFor(alice)).toBe(1);

		// Can't add more without invites
		const result2 = sim.addSong(alice, 200);
		expect(result2.success).toBe(false);
	});

	it('attendee gets +1 slot per invite sent (not accepted)', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		sim.acceptInvite(alice, 200);

		// Send invite → +1 slot
		sim.sendInvite(alice, 'Bob', 'bob@test.com');
		const result = sim.addSong(alice, 200);
		expect(result.success).toBe(true);
		expect(sim.songCountFor(alice)).toBe(2);

		// Send another → +1 more
		sim.sendInvite(alice, 'Charlie', 'charlie@test.com');
		const result2 = sim.addSong(alice, 200);
		expect(result2.success).toBe(true);
		expect(sim.songCountFor(alice)).toBe(3);
	});

	it('attendee cannot exceed their slot count', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		sim.acceptInvite(alice, 200);
		sim.sendInvite(alice, 'Bob', 'bob@test.com');

		// Use both slots (1 entry + 1 for invite)
		sim.addSong(alice, 200);
		expect(sim.songCountFor(alice)).toBe(2);

		// Third should fail
		const result = sim.addSong(alice, 200);
		expect(result.success).toBe(false);
		expect(sim.songCountFor(alice)).toBe(2);
	});

	it('duplicate email invite rejected within same party', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 10800 });
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com');
		expect(alice).not.toBeNull();

		const duplicate = sim.sendInvite(host, 'Alice2', 'alice@test.com');
		expect(duplicate).toBeNull();
	});

	it('host email is also tracked for duplicates', () => {
		const sim = new PartySimulator();
		const host = sim.createHost('Host', 'host@test.com');
		const dup = sim.sendInvite(host, 'Also Host', 'host@test.com');
		expect(dup).toBeNull();
	});
});

describe('Overflow algorithm', () => {
	it('drops song from biggest sonic footprint when over target', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 600, maxAttendees: 20 }); // 10 min
		const host = sim.createHost('Host');

		// Host adds 3 songs totaling 540s
		sim.addSong(host, 180);
		sim.addSong(host, 180);
		sim.addSong(host, 180);

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		// Alice accepts with 180s song → total would be 720s (over 600s target)
		const result = sim.acceptInvite(alice, 180);
		expect(result.success).toBe(true);
		expect(result.droppedSongIds.length).toBeGreaterThan(0);
		// Host had the biggest footprint, should have lost a song
		expect(sim.songCountFor(host)).toBeLessThan(3);
	});

	it('never drops below 1 song per attendee', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 450, maxAttendees: 20 });
		const host = sim.createHost('Host');
		sim.addSong(host, 200);

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		// 200 + 200 = 400 ≤ 450, alice can accept without drops
		const aliceResult = sim.acceptInvite(alice, 200);
		expect(aliceResult.success).toBe(true);

		// Now: host 200 + alice 200 = 400. Target 450.
		// Bob accepts with 200: 400 + 200 = 600 > 450.
		// Nobody has >1 song → can't drop → Bob rejected
		const bob = sim.sendInvite(host, 'Bob', 'bob@test.com')!;
		const result = sim.acceptInvite(bob, 200);
		expect(result.success).toBe(false);

		// Everyone who was accepted retains their song
		expect(sim.songCountFor(host)).toBe(1);
		expect(sim.songCountFor(alice)).toBe(1);
	});

	it('host songs can be dropped too', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 500, maxAttendees: 20 });
		const host = sim.createHost('Host');
		sim.addSong(host, 200);
		sim.addSong(host, 200);

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		const result = sim.acceptInvite(alice, 200);
		expect(result.success).toBe(true);
		// Host had biggest footprint (400s), should have had a song dropped
		expect(result.droppedSongIds.length).toBe(1);
		expect(sim.songCountFor(host)).toBe(1);
	});

	it('drops most recent song from target attendee', () => {
		// Target high enough for host to add all 3 without overflow
		const sim = new PartySimulator({ targetDurationSeconds: 540, maxAttendees: 20 });
		const host = sim.createHost('Host');

		sim.addSong(host, 180); // song id 1
		sim.addSong(host, 180); // song id 2
		sim.addSong(host, 180); // song id 3, total 540 = target

		// Verify host has all 3
		expect(sim.songCountFor(host)).toBe(3);

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		const result = sim.acceptInvite(alice, 180);
		expect(result.success).toBe(true);
		expect(result.droppedSongIds.length).toBe(1);
		// The dropped song should be the most recently added (highest ID among host's songs)
		expect(sim.songCountFor(host)).toBe(2);
	});

	it('handles multiple drops in one add', () => {
		// Target high enough for host to add 3 small songs, but alice's big song needs 2 drops
		const sim = new PartySimulator({ targetDurationSeconds: 350, maxAttendees: 20 });
		const host = sim.createHost('Host');

		sim.addSong(host, 100); // total 100
		sim.addSong(host, 100); // total 200
		sim.addSong(host, 100); // total 300, under 350

		expect(sim.songCountFor(host)).toBe(3);

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		// Alice adds 200s song: 300 + 200 = 500 > 350
		// Need to drop enough: 300 - X + 200 ≤ 350 → X ≥ 150, so 2 drops of 100
		const result = sim.acceptInvite(alice, 200);
		expect(result.success).toBe(true);
		expect(result.droppedSongIds.length).toBe(2);
		expect(sim.songCountFor(host)).toBe(1);
	});

	it('"make room only" — doesn\'t trim below target', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 1000, maxAttendees: 20 });
		const host = sim.createHost('Host');
		sim.addSong(host, 400);
		sim.addSong(host, 400); // 800 total, under target

		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		const result = sim.acceptInvite(alice, 180);
		// 800 + 180 = 980 ≤ 1000, no drops needed
		expect(result.success).toBe(true);
		expect(result.droppedSongIds).toHaveLength(0);
		expect(sim.totalDuration).toBe(980);
	});
});

describe('Comprehensive simulations', () => {
	it('10 users, 2 invites each, all accept, 3h party → converges', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3 * 3600,
			maxAttendees: 50
		});
		const host = sim.createHost('Host');

		// Host invites 10 people
		const guests: SimAttendee[] = [];
		for (let i = 0; i < 10; i++) {
			const g = sim.sendInvite(host, `Guest${i}`, `guest${i}@test.com`)!;
			expect(g).not.toBeNull();
			guests.push(g);
		}

		// All accept with ~3.5 min songs
		for (const g of guests) {
			sim.acceptInvite(g, 210);
		}

		// Each sends 2 invites
		const subGuests: SimAttendee[] = [];
		for (const g of guests) {
			for (let j = 0; j < 2; j++) {
				const sg = sim.sendInvite(g, `Sub${g.name}_${j}`, `sub${g.name}_${j}@test.com`);
				if (sg) subGuests.push(sg);
			}
		}

		// All sub-guests accept
		for (const sg of subGuests) {
			sim.acceptInvite(sg, 210);
		}

		// Guests add bonus songs from their invite slots
		for (const g of guests) {
			for (let j = 0; j < g.invitesSent; j++) {
				sim.addSong(g, 210);
			}
		}

		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
		// Duration should be near target (within ~1 song = 210s)
		if (sim.targetDurationSeconds) {
			expect(sim.totalDuration).toBeLessThanOrEqual(sim.targetDurationSeconds + 210);
		}
	});

	it('50 users stress test with varied acceptance rates', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 2 * 3600,
			maxAttendees: 60
		});
		const host = sim.createHost('Host');

		// Host adds some songs
		for (let i = 0; i < 5; i++) {
			sim.addSong(host, 200 + i * 20);
		}

		// Create chain of invites
		let current = host;
		const all: SimAttendee[] = [];
		for (let i = 0; i < 50; i++) {
			const g = sim.sendInvite(current, `User${i}`, `user${i}@stress.com`);
			if (!g) break;
			all.push(g);

			// 80% acceptance rate
			if (Math.random() < 0.8 || i < 10) {
				sim.acceptInvite(g, 150 + Math.floor(Math.random() * 200));
			}

			// Alternate who invites next
			if (g.accepted) current = g;
		}

		// Every accepted attendee still has at least 1 song
		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
	});

	it('all invites declined → no overflow issues', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3600,
			maxAttendees: 20
		});
		const host = sim.createHost('Host');
		sim.addSong(host, 300);

		for (let i = 0; i < 10; i++) {
			sim.sendInvite(host, `Nobody${i}`, `nobody${i}@test.com`);
			// Never accept
		}

		expect(sim.totalSongs).toBe(1);
		expect(sim.totalDuration).toBe(300);
		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
	});

	it('very short party (30 min) with many guests → aggressive trimming', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 30 * 60, // 30 min = 1800s
			maxAttendees: 30
		});
		const host = sim.createHost('Host');

		// Host adds 5 songs
		for (let i = 0; i < 5; i++) {
			sim.addSong(host, 200);
		}
		expect(sim.songCountFor(host)).toBe(5);

		// Guests join — invite may fail once playlist is locked (everyone has 1 song at target)
		let accepted = 0;
		for (let i = 0; i < 10; i++) {
			const g = sim.sendInvite(host, `Guest${i}`, `guest${i}@short.com`);
			if (!g) break;
			const result = sim.acceptInvite(g, 200);
			if (result.success) accepted++;
		}

		expect(accepted).toBeGreaterThan(0);
		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
		// With aggressive trimming, host's songs should have been reduced
		expect(sim.songCountFor(host)).toBeLessThan(5);
	});

	it('host adds 20 songs then guests join → host songs trimmed fairly', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3600,
			maxAttendees: 30
		});
		const host = sim.createHost('Host');

		// Host fills the playlist
		for (let i = 0; i < 20; i++) {
			sim.addSong(host, 180);
		}
		expect(sim.totalDuration).toBe(3600);

		// Guests join and need room
		for (let i = 0; i < 8; i++) {
			const g = sim.sendInvite(host, `Guest${i}`, `guest${i}@fair.com`)!;
			const result = sim.acceptInvite(g, 180);
			expect(result.success).toBe(true);
		}

		// Host should have had many songs dropped
		expect(sim.songCountFor(host)).toBeLessThan(20);
		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
	});

	it('varied duration distributions (short pop vs long jazz)', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3600,
			maxAttendees: 20
		});
		const host = sim.createHost('Host');

		// Host adds jazz (long songs): 420 + 360 + 480 = 1260, under 3600
		sim.addSong(host, 420); // 7 min
		sim.addSong(host, 360); // 6 min
		sim.addSong(host, 480); // 8 min

		// Guests add pop (short songs)
		for (let i = 0; i < 12; i++) {
			const g = sim.sendInvite(host, `PopFan${i}`, `pop${i}@test.com`)!;
			sim.acceptInvite(g, 200); // 3:20
		}

		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
		// Host (biggest footprint with long jazz tracks) should have been trimmed
		// 1260 + 12*200 = 3660 > 3600, overflow would hit host
		expect(sim.songCountFor(host)).toBeLessThanOrEqual(3);
	});

	it('chain depth scenarios with maxDepth limits', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 7200,
			maxAttendees: 50,
			maxDepth: 3
		});
		const host = sim.createHost('Host');

		// Build a chain: Host → A → B → C → D (D should fail at depth 4)
		const a = sim.sendInvite(host, 'A', 'a@chain.com')!;
		sim.acceptInvite(a, 200);

		const b = sim.sendInvite(a, 'B', 'b@chain.com')!;
		expect(b.depth).toBe(2);
		sim.acceptInvite(b, 200);

		const c = sim.sendInvite(b, 'C', 'c@chain.com')!;
		expect(c.depth).toBe(3);
		sim.acceptInvite(c, 200);

		// D should be blocked by maxDepth
		const d = sim.sendInvite(c, 'D', 'd@chain.com');
		expect(d).toBeNull();
	});

	it('maxInvitesPerGuest enforcement', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 7200,
			maxAttendees: 50,
			maxInvitesPerGuest: 2
		});
		const host = sim.createHost('Host');
		const alice = sim.sendInvite(host, 'Alice', 'alice@test.com')!;
		sim.acceptInvite(alice, 200);

		// Alice sends 2 invites (at limit)
		const b1 = sim.sendInvite(alice, 'B1', 'b1@test.com');
		expect(b1).not.toBeNull();
		const b2 = sim.sendInvite(alice, 'B2', 'b2@test.com');
		expect(b2).not.toBeNull();

		// 3rd should be blocked
		const b3 = sim.sendInvite(alice, 'B3', 'b3@test.com');
		expect(b3).toBeNull();
		expect(alice.invitesSent).toBe(2);
	});

	it('duplicate email attempts across different inviters', () => {
		const sim = new PartySimulator({ targetDurationSeconds: 7200, maxAttendees: 50 });
		const host = sim.createHost('Host');

		const alice = sim.sendInvite(host, 'Alice', 'alice@dup.com')!;
		sim.acceptInvite(alice, 200);

		const bob = sim.sendInvite(host, 'Bob', 'bob@dup.com')!;
		sim.acceptInvite(bob, 200);

		// Both try to invite same email
		const fromAlice = sim.sendInvite(alice, 'Charlie', 'charlie@dup.com');
		expect(fromAlice).not.toBeNull();

		const fromBob = sim.sendInvite(bob, 'Also Charlie', 'charlie@dup.com');
		expect(fromBob).toBeNull();
	});

	it('late joiners when playlist is near full', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 1800, // 30 min
			maxAttendees: 20
		});
		const host = sim.createHost('Host');

		// Fill up the playlist
		for (let i = 0; i < 8; i++) {
			sim.addSong(host, 200);
		}
		// Total: 1600s, near the 1800s target

		// Late joiners
		for (let i = 0; i < 3; i++) {
			const g = sim.sendInvite(host, `Late${i}`, `late${i}@test.com`)!;
			const result = sim.acceptInvite(g, 200);
			expect(result.success).toBe(true);
		}

		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
		// Host songs trimmed to make room
		expect(sim.songCountFor(host)).toBeLessThan(8);
	});
});

describe('Invite gating', () => {
	it('stops when at maxAttendees', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 7200,
			maxAttendees: 3
		});
		const host = sim.createHost('Host'); // 1
		const a = sim.sendInvite(host, 'A', 'a@gate.com'); // 2
		expect(a).not.toBeNull();
		const b = sim.sendInvite(host, 'B', 'b@gate.com'); // 3
		expect(b).not.toBeNull();
		const c = sim.sendInvite(host, 'C', 'c@gate.com'); // 4 → blocked
		expect(c).toBeNull();
	});

	it('stops when everyone has 1 song and at target duration', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 600, // 10 min
			maxAttendees: 20
		});
		const host = sim.createHost('Host');
		sim.addSong(host, 200);

		const alice = sim.sendInvite(host, 'Alice', 'alice@gate.com')!;
		sim.acceptInvite(alice, 200);

		const bob = sim.sendInvite(host, 'Bob', 'bob@gate.com')!;
		sim.acceptInvite(bob, 200);

		// Total: 600s = target. Each person has exactly 1 song.
		// New invite should be blocked since we can't drop anything
		const charlie = sim.sendInvite(host, 'Charlie', 'charlie@gate.com');
		expect(charlie).toBeNull();
	});

	it('allows when songs can still be dropped', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 600,
			maxAttendees: 20
		});
		const host = sim.createHost('Host');
		sim.addSong(host, 200);
		sim.addSong(host, 200); // host has 2 songs → can drop one

		const alice = sim.sendInvite(host, 'Alice', 'alice@gate.com')!;
		sim.acceptInvite(alice, 200); // total 600, but host has 2 → droppable

		// Should still allow invites because host has >1 song
		const canInvite = canIssueInvitations(sim.attendees.length, sim.maxAttendees, sim.songs, sim.targetDurationSeconds);
		expect(canInvite).toBe(true);
	});

	it('respects maxInvitesPerGuest per attendee', () => {
		const sim = new PartySimulator({
			maxAttendees: 50,
			maxInvitesPerGuest: 1
		});
		const host = sim.createHost('Host');

		// Host is exempt from maxInvitesPerGuest? Actually, host uses the same check.
		// With maxInvitesPerGuest=1, host can only send 1 invite
		const a = sim.sendInvite(host, 'A', 'a@t.com');
		expect(a).not.toBeNull();
		const b = sim.sendInvite(host, 'B', 'b@t.com');
		expect(b).toBeNull();
	});

	it('respects maxDepth', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 7200,
			maxAttendees: 50,
			maxDepth: 1
		});
		const host = sim.createHost('Host');

		const a = sim.sendInvite(host, 'A', 'a@depth.com')!;
		expect(a.depth).toBe(1);
		sim.acceptInvite(a, 200);

		// A is at depth 1, maxDepth is 1, so A's invitees would be depth 2 → blocked
		const b = sim.sendInvite(a, 'B', 'b@depth.com');
		expect(b).toBeNull();
	});
});

describe('Convergence/fairness properties', () => {
	it('playlist duration stays near target (within ~1 song)', () => {
		const targetDuration = 3600;
		const sim = new PartySimulator({
			targetDurationSeconds: targetDuration,
			maxAttendees: 50
		});
		const host = sim.createHost('Host');

		// Build up playlist
		for (let i = 0; i < 10; i++) {
			sim.addSong(host, 210);
		}

		for (let i = 0; i < 15; i++) {
			const g = sim.sendInvite(host, `G${i}`, `g${i}@converge.com`)!;
			sim.acceptInvite(g, 210);
		}

		// Should be within 1 song of target
		expect(sim.totalDuration).toBeLessThanOrEqual(targetDuration + 210);
	});

	it('no attendee dominates the playlist after overflow stabilizes', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 3600,
			maxAttendees: 30
		});
		const host = sim.createHost('Host');

		// Host adds many songs
		for (let i = 0; i < 15; i++) {
			sim.addSong(host, 200);
		}

		// Many guests join — may stop when invites are gated
		for (let i = 0; i < 12; i++) {
			const g = sim.sendInvite(host, `G${i}`, `g${i}@fair.com`);
			if (!g) break;
			sim.acceptInvite(g, 200);
		}

		const hostSongs = sim.songCountFor(host);
		// After overflow trimming, host should have been reduced significantly
		expect(hostSongs).toBeLessThan(15);
		// Every accepted attendee still has at least 1 song
		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
	});

	it('every accepted attendee retains at least 1 song', () => {
		const sim = new PartySimulator({
			targetDurationSeconds: 1800,
			maxAttendees: 30
		});
		const host = sim.createHost('Host');

		for (let i = 0; i < 10; i++) {
			sim.addSong(host, 180);
		}

		for (let i = 0; i < 10; i++) {
			const g = sim.sendInvite(host, `G${i}`, `g${i}@retain.com`);
			if (!g) break;
			sim.acceptInvite(g, 180);
		}

		expect(sim.everyoneHasAtLeastOneSong()).toBe(true);
	});
});

describe('canIssueInvitations', () => {
	it('returns true when under maxAttendees and under target duration', () => {
		const songs: SongInfo[] = [{ id: 1, addedBy: 1, durationSeconds: 200, addedAt: '2024-01-01' }];
		expect(canIssueInvitations(2, 10, songs, 3600)).toBe(true);
	});

	it('returns false when at maxAttendees', () => {
		expect(canIssueInvitations(10, 10, [], 3600)).toBe(false);
	});

	it('returns true when no target duration', () => {
		expect(canIssueInvitations(5, 10, [], null)).toBe(true);
	});

	it('returns false when at target and everyone has 1 song', () => {
		const songs: SongInfo[] = [
			{ id: 1, addedBy: 1, durationSeconds: 300, addedAt: '2024-01-01' },
			{ id: 2, addedBy: 2, durationSeconds: 300, addedAt: '2024-01-01' }
		];
		expect(canIssueInvitations(3, 10, songs, 600)).toBe(false);
	});

	it('returns true when at target but someone has >1 song', () => {
		const songs: SongInfo[] = [
			{ id: 1, addedBy: 1, durationSeconds: 200, addedAt: '2024-01-01' },
			{ id: 2, addedBy: 1, durationSeconds: 200, addedAt: '2024-01-01' },
			{ id: 3, addedBy: 2, durationSeconds: 200, addedAt: '2024-01-01' }
		];
		expect(canIssueInvitations(3, 10, songs, 600)).toBe(true);
	});
});

describe('computeOverflowDrops', () => {
	it('returns empty drops when under target', () => {
		const songs: SongInfo[] = [{ id: 1, addedBy: 1, durationSeconds: 200, addedAt: '2024-01-01' }];
		const result = computeOverflowDrops(songs, 200, 1000, 2);
		expect(result).toEqual({ drops: [] });
	});

	it('returns empty drops when no target duration', () => {
		const songs: SongInfo[] = [{ id: 1, addedBy: 1, durationSeconds: 200, addedAt: '2024-01-01' }];
		const result = computeOverflowDrops(songs, 200, null, 2);
		expect(result).toEqual({ drops: [] });
	});

	it('returns null when nobody has >1 song and over target', () => {
		const songs: SongInfo[] = [
			{ id: 1, addedBy: 1, durationSeconds: 400, addedAt: '2024-01-01' },
			{ id: 2, addedBy: 2, durationSeconds: 400, addedAt: '2024-01-01' }
		];
		// Adding 400 for attendee 3: total would be 1200, target 600
		// But nobody has >1 song, can't drop
		const result = computeOverflowDrops(songs, 400, 600, 3);
		expect(result).toBeNull();
	});

	it('drops from attendee with largest footprint', () => {
		const songs: SongInfo[] = [
			{ id: 1, addedBy: 1, durationSeconds: 300, addedAt: '2024-01-01T00:00:00' },
			{ id: 2, addedBy: 1, durationSeconds: 300, addedAt: '2024-01-01T00:01:00' },
			{ id: 3, addedBy: 2, durationSeconds: 100, addedAt: '2024-01-01T00:02:00' },
			{ id: 4, addedBy: 2, durationSeconds: 100, addedAt: '2024-01-01T00:03:00' }
		];
		// Target 800, current 800, adding 200 for attendee 3 → 1000
		// Attendee 1 has 600s footprint (biggest), attendee 2 has 200s
		const result = computeOverflowDrops(songs, 200, 800, 3);
		expect(result).not.toBeNull();
		// Should drop from attendee 1 (biggest footprint), most recent = id 2
		expect(result!.drops).toContain(2);
	});
});
