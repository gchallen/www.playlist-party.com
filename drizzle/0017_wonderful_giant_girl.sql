ALTER TABLE `parties` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `parties` ADD `public_token` text(21);--> statement-breakpoint
ALTER TABLE `parties` ADD `public_show_host` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `public_show_guest_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `public_show_time` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `public_show_location` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `public_show_description` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `parties_public_token_idx` ON `parties` (`public_token`);