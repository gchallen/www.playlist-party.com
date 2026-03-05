ALTER TABLE `attendees` ADD `share_token` text(21);--> statement-breakpoint
CREATE UNIQUE INDEX `attendees_share_token_idx` ON `attendees` (`share_token`);