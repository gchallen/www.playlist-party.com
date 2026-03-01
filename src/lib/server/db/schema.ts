import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const parties = sqliteTable('parties', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description'),
	date: text('date').notNull(),
	time: text('time'),
	endTime: text('end_time'),
	location: text('location'),
	createdBy: text('created_by').notNull(),
	creatorEmail: text('creator_email').notNull(),
	partyCode: text('party_code', { length: 6 }).notNull().unique(),
	maxDepth: integer('max_depth'),
	maxAttendees: integer('max_attendees').notNull(),
	estimatedGuests: integer('estimated_guests'),
	avgSongDurationSeconds: integer('avg_song_duration_seconds'),
	adminToken: text('admin_token').notNull().unique(),
	revealedAt: text('revealed_at'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const attendees = sqliteTable(
	'attendees',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		partyId: integer('party_id')
			.notNull()
			.references(() => parties.id),
		name: text('name').notNull(),
		email: text('email').notNull(),
		invitedBy: integer('invited_by'),
		inviteToken: text('invite_token', { length: 21 }).notNull().unique(),
		depth: integer('depth').notNull().default(0),
		acceptedAt: text('accepted_at'),
		createdAt: text('created_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [uniqueIndex('attendees_invite_token_idx').on(table.inviteToken)]
);

export const songs = sqliteTable(
	'songs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		partyId: integer('party_id')
			.notNull()
			.references(() => parties.id),
		addedBy: integer('added_by')
			.notNull()
			.references(() => attendees.id),
		youtubeId: text('youtube_id').notNull(),
		youtubeTitle: text('youtube_title').notNull(),
		youtubeThumbnail: text('youtube_thumbnail').notNull(),
		youtubeChannelName: text('youtube_channel_name'),
		durationSeconds: integer('duration_seconds'),
		songType: text('song_type').notNull().default('entry'),
		position: integer('position').notNull(),
		addedAt: text('added_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [uniqueIndex('songs_party_youtube_idx').on(table.partyId, table.youtubeId)]
);
