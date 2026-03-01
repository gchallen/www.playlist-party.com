CREATE TABLE `attendees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`name` text,
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
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`date` text NOT NULL,
	`time` text,
	`location` text,
	`created_by` text NOT NULL,
	`party_code` text(6) NOT NULL,
	`max_depth` integer,
	`max_invites_per_person` integer,
	`max_attendees` integer NOT NULL,
	`admin_token` text NOT NULL,
	`revealed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parties_party_code_unique` ON `parties` (`party_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `parties_admin_token_unique` ON `parties` (`admin_token`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` integer NOT NULL,
	`added_by` integer NOT NULL,
	`youtube_id` text NOT NULL,
	`youtube_title` text NOT NULL,
	`youtube_thumbnail` text NOT NULL,
	`youtube_channel_name` text,
	`duration_seconds` integer,
	`position` integer NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_party_youtube_idx` ON `songs` (`party_id`,`youtube_id`);