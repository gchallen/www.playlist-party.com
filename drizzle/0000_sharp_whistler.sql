CREATE TABLE `attendees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` integer,
	`invite_token` text(21) NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`accepted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendees_invite_token_unique` ON `attendees` (`invite_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendees_invite_token_idx` ON `attendees` (`invite_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendees_party_email_idx` ON `attendees` (`party_id`,`email`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`date` text NOT NULL,
	`time` text,
	`end_time` text,
	`location` text,
	`created_by` text NOT NULL,
	`creator_email` text NOT NULL,
	`max_depth` integer,
	`max_attendees` integer NOT NULL,
	`max_invites_per_guest` integer,
	`song_attribution` text DEFAULT 'hidden' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`added_by` integer NOT NULL,
	`youtube_id` text NOT NULL,
	`youtube_title` text NOT NULL,
	`youtube_thumbnail` text NOT NULL,
	`youtube_channel_name` text,
	`duration_seconds` integer NOT NULL,
	`position` integer NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_party_youtube_idx` ON `songs` (`party_id`,`youtube_id`);