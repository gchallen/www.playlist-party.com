CREATE TABLE `song_likes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`song_id` integer NOT NULL,
	`attendee_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_likes_song_attendee_idx` ON `song_likes` (`song_id`,`attendee_id`);--> statement-breakpoint
ALTER TABLE `parties` ADD `now_playing_song_id` integer;