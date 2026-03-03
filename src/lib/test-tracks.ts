/**
 * Pre-computed YouTube track metadata for dev-only testing.
 * No YouTube API calls needed — all metadata is baked in.
 */

export interface TestTrack {
	url: string;
	videoId: string;
	title: string;
	thumbnail: string;
	channelName: string;
	durationSeconds: number;
}

const TEST_TRACKS: TestTrack[] = [
	// ─── Tracks used in E2E tests ───
	{
		url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		videoId: 'dQw4w9WgXcQ',
		title: 'Rick Astley - Never Gonna Give You Up',
		thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		channelName: 'Rick Astley',
		durationSeconds: 212
	},
	{
		url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
		videoId: '9bZkp7q19f0',
		title: 'PSY - GANGNAM STYLE',
		thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg',
		channelName: 'officialpsy',
		durationSeconds: 253
	},
	{
		url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
		videoId: 'kJQP7kiw5Fk',
		title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
		thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
		channelName: 'Luis Fonsi',
		durationSeconds: 282
	},
	{
		url: 'https://www.youtube.com/watch?v=RgKAFK5djSk',
		videoId: 'RgKAFK5djSk',
		title: 'Wiz Khalifa - See You Again ft. Charlie Puth',
		thumbnail: 'https://img.youtube.com/vi/RgKAFK5djSk/hqdefault.jpg',
		channelName: 'Wiz Khalifa',
		durationSeconds: 237
	},
	{
		url: 'https://www.youtube.com/watch?v=OPf0YbXqDm0',
		videoId: 'OPf0YbXqDm0',
		title: 'Mark Ronson - Uptown Funk ft. Bruno Mars',
		thumbnail: 'https://img.youtube.com/vi/OPf0YbXqDm0/hqdefault.jpg',
		channelName: 'Mark Ronson',
		durationSeconds: 270
	},
	{
		url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
		videoId: 'JGwWNGJdvx8',
		title: 'Ed Sheeran - Shape of You',
		thumbnail: 'https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg',
		channelName: 'Ed Sheeran',
		durationSeconds: 234
	},
	{
		url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
		videoId: 'fJ9rUzIMcZQ',
		title: 'Queen - Bohemian Rhapsody',
		thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
		channelName: 'Queen Official',
		durationSeconds: 354
	},
	{
		url: 'https://www.youtube.com/watch?v=60ItHLz5WEA',
		videoId: '60ItHLz5WEA',
		title: 'Alan Walker - Faded',
		thumbnail: 'https://img.youtube.com/vi/60ItHLz5WEA/hqdefault.jpg',
		channelName: 'Alan Walker',
		durationSeconds: 212
	},
	// ─── Additional tracks for dev bulk-add ───
	{
		url: 'https://www.youtube.com/watch?v=CevxZvSJLk8',
		videoId: 'CevxZvSJLk8',
		title: 'Katy Perry - Roar',
		thumbnail: 'https://img.youtube.com/vi/CevxZvSJLk8/hqdefault.jpg',
		channelName: 'Katy Perry',
		durationSeconds: 269
	},
	{
		url: 'https://www.youtube.com/watch?v=YQHsXMglC9A',
		videoId: 'YQHsXMglC9A',
		title: 'Adele - Hello',
		thumbnail: 'https://img.youtube.com/vi/YQHsXMglC9A/hqdefault.jpg',
		channelName: 'Adele',
		durationSeconds: 367
	},
	{
		url: 'https://www.youtube.com/watch?v=hT_nvWreIhg',
		videoId: 'hT_nvWreIhg',
		title: 'OneRepublic - Counting Stars',
		thumbnail: 'https://img.youtube.com/vi/hT_nvWreIhg/hqdefault.jpg',
		channelName: 'OneRepublic',
		durationSeconds: 257
	},
	{
		url: 'https://www.youtube.com/watch?v=lp-EO5I60KA',
		videoId: 'lp-EO5I60KA',
		title: 'Eminem - Lose Yourself',
		thumbnail: 'https://img.youtube.com/vi/lp-EO5I60KA/hqdefault.jpg',
		channelName: 'Eminem',
		durationSeconds: 326
	},
	{
		url: 'https://www.youtube.com/watch?v=PT2_F-1esPk',
		videoId: 'PT2_F-1esPk',
		title: 'The Weeknd - Blinding Lights',
		thumbnail: 'https://img.youtube.com/vi/PT2_F-1esPk/hqdefault.jpg',
		channelName: 'The Weeknd',
		durationSeconds: 200
	},
	{
		url: 'https://www.youtube.com/watch?v=SlPhMPnQ58k',
		videoId: 'SlPhMPnQ58k',
		title: 'Maroon 5 - Sugar',
		thumbnail: 'https://img.youtube.com/vi/SlPhMPnQ58k/hqdefault.jpg',
		channelName: 'Maroon 5',
		durationSeconds: 305
	},
	{
		url: 'https://www.youtube.com/watch?v=bo_efYhYU2A',
		videoId: 'bo_efYhYU2A',
		title: 'Sia - Cheap Thrills',
		thumbnail: 'https://img.youtube.com/vi/bo_efYhYU2A/hqdefault.jpg',
		channelName: 'Sia',
		durationSeconds: 224
	},
	{
		url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc',
		videoId: '7wtfhZwyrcc',
		title: 'Imagine Dragons - Believer',
		thumbnail: 'https://img.youtube.com/vi/7wtfhZwyrcc/hqdefault.jpg',
		channelName: 'Imagine Dragons',
		durationSeconds: 204
	},
	{
		url: 'https://www.youtube.com/watch?v=pRpeEdMmmQ0',
		videoId: 'pRpeEdMmmQ0',
		title: 'Shakira - Waka Waka',
		thumbnail: 'https://img.youtube.com/vi/pRpeEdMmmQ0/hqdefault.jpg',
		channelName: 'Shakira',
		durationSeconds: 197
	},
	{
		url: 'https://www.youtube.com/watch?v=YkgkThdzX-8',
		videoId: 'YkgkThdzX-8',
		title: 'Jennifer Lopez - On The Floor ft. Pitbull',
		thumbnail: 'https://img.youtube.com/vi/YkgkThdzX-8/hqdefault.jpg',
		channelName: 'Jennifer Lopez',
		durationSeconds: 233
	},
	{
		url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g',
		videoId: '2Vv-BfVoq4g',
		title: 'Ed Sheeran - Perfect',
		thumbnail: 'https://img.youtube.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
		channelName: 'Ed Sheeran',
		durationSeconds: 263
	},
	{
		url: 'https://www.youtube.com/watch?v=HP-MbfHFUqs',
		videoId: 'HP-MbfHFUqs',
		title: 'Taylor Swift - Shake It Off',
		thumbnail: 'https://img.youtube.com/vi/HP-MbfHFUqs/hqdefault.jpg',
		channelName: 'Taylor Swift',
		durationSeconds: 242
	},
	{
		url: 'https://www.youtube.com/watch?v=09R8_2nJtjg',
		videoId: '09R8_2nJtjg',
		title: 'Maroon 5 - Maps',
		thumbnail: 'https://img.youtube.com/vi/09R8_2nJtjg/hqdefault.jpg',
		channelName: 'Maroon 5',
		durationSeconds: 195
	},
	{
		url: 'https://www.youtube.com/watch?v=e-ORhEE9VVg',
		videoId: 'e-ORhEE9VVg',
		title: 'Taylor Swift - Blank Space',
		thumbnail: 'https://img.youtube.com/vi/e-ORhEE9VVg/hqdefault.jpg',
		channelName: 'Taylor Swift',
		durationSeconds: 272
	},
	{
		url: 'https://www.youtube.com/watch?v=nfWlot6h_JM',
		videoId: 'nfWlot6h_JM',
		title: 'Taylor Swift - Shake It Off (Lyrics)',
		thumbnail: 'https://img.youtube.com/vi/nfWlot6h_JM/hqdefault.jpg',
		channelName: 'Taylor Swift',
		durationSeconds: 219
	},
	{
		url: 'https://www.youtube.com/watch?v=QK8mJJJvaes',
		videoId: 'QK8mJJJvaes',
		title: 'Sam Smith - Stay With Me',
		thumbnail: 'https://img.youtube.com/vi/QK8mJJJvaes/hqdefault.jpg',
		channelName: 'Sam Smith',
		durationSeconds: 172
	},
	{
		url: 'https://www.youtube.com/watch?v=HCjNJDNzw8Y',
		videoId: 'HCjNJDNzw8Y',
		title: 'Justin Timberlake - Mirrors',
		thumbnail: 'https://img.youtube.com/vi/HCjNJDNzw8Y/hqdefault.jpg',
		channelName: 'Justin Timberlake',
		durationSeconds: 483
	},
	{
		url: 'https://www.youtube.com/watch?v=IcrbM1l_BoI',
		videoId: 'IcrbM1l_BoI',
		title: 'Coldplay - Something Just Like This',
		thumbnail: 'https://img.youtube.com/vi/IcrbM1l_BoI/hqdefault.jpg',
		channelName: 'Coldplay',
		durationSeconds: 247
	},
	{
		url: 'https://www.youtube.com/watch?v=DyDfgMOUjCI',
		videoId: 'DyDfgMOUjCI',
		title: 'Billie Eilish - bad guy',
		thumbnail: 'https://img.youtube.com/vi/DyDfgMOUjCI/hqdefault.jpg',
		channelName: 'Billie Eilish',
		durationSeconds: 194
	},
	{
		url: 'https://www.youtube.com/watch?v=ZbZSe6N_BXs',
		videoId: 'ZbZSe6N_BXs',
		title: 'Pharrell Williams - Happy',
		thumbnail: 'https://img.youtube.com/vi/ZbZSe6N_BXs/hqdefault.jpg',
		channelName: 'Pharrell Williams',
		durationSeconds: 233
	},
	{
		url: 'https://www.youtube.com/watch?v=nfs8NYg7yQM',
		videoId: 'nfs8NYg7yQM',
		title: 'Charlie Puth - Attention',
		thumbnail: 'https://img.youtube.com/vi/nfs8NYg7yQM/hqdefault.jpg',
		channelName: 'Charlie Puth',
		durationSeconds: 211
	}
];

/**
 * Pick `count` random tracks not in the `excludeVideoIds` set.
 * Returns up to `count` tracks (fewer if not enough available).
 */
export function pickRandomTracks(count: number, excludeVideoIds: Set<string> = new Set()): TestTrack[] {
	const available = TEST_TRACKS.filter((t) => !excludeVideoIds.has(t.videoId));
	const shuffled = available.sort(() => Math.random() - 0.5);
	return shuffled.slice(0, count);
}
