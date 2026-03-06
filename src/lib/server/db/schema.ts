import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const parties = sqliteTable('parties', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description'),
	date: text('date').notNull(),
	time: text('time'),
	endTime: text('end_time'),
	location: text('location'),
	locationUrl: text('location_url'),
	createdBy: text('created_by').notNull(),
	creatorEmail: text('creator_email').notNull(),
	maxDepth: integer('max_depth'),
	maxAttendees: integer('max_attendees').notNull(),
	maxInvitesPerGuest: integer('max_invites_per_guest'),
	songsPerGuest: integer('songs_per_guest').notNull().default(1),
	songsRequiredToRsvp: integer('songs_required_to_rsvp'),
	songAttribution: text('song_attribution').notNull().default('hidden'),
	customInviteSubject: text('custom_invite_subject'),
	customInviteMessage: text('custom_invite_message'),
	nowPlayingSongId: integer('now_playing_song_id'),
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
		shareToken: text('share_token', { length: 21 }),
		depth: integer('depth').notNull().default(0),
		acceptedAt: text('accepted_at'),
		declinedAt: text('declined_at'),
		createdAt: text('created_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [
		uniqueIndex('attendees_invite_token_idx').on(table.inviteToken),
		uniqueIndex('attendees_share_token_idx').on(table.shareToken),
		uniqueIndex('attendees_party_email_idx').on(table.partyId, table.email)
	]
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
		comment: text('comment'),
		durationSeconds: integer('duration_seconds').notNull(),
		position: integer('position').notNull(),
		addedAt: text('added_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [uniqueIndex('songs_party_youtube_idx').on(table.partyId, table.youtubeId)]
);

export const songLikes = sqliteTable(
	'song_likes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		songId: integer('song_id')
			.notNull()
			.references(() => songs.id),
		attendeeId: integer('attendee_id')
			.notNull()
			.references(() => attendees.id),
		createdAt: text('created_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [uniqueIndex('song_likes_song_attendee_idx').on(table.songId, table.attendeeId)]
);

export const emailQueue = sqliteTable(
	'email_queue',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		to: text('to').notNull(),
		subject: text('subject').notNull(),
		html: text('html').notNull(),
		type: text('type').notNull(),
		status: text('status').notNull().default('pending'),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		replyTo: text('reply_to'),
		createdAt: text('created_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		sentAt: text('sent_at')
	},
	(table) => [index('idx_email_queue_status').on(table.status)]
);

export const emailSends = sqliteTable(
	'email_sends',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		recipientEmail: text('recipient_email').notNull(),
		emailType: text('email_type').notNull(),
		sentAt: text('sent_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [index('idx_email_sends_recipient').on(table.recipientEmail)]
);
