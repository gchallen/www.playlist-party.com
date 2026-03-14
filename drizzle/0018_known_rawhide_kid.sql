ALTER TABLE `attendees` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `parties` ADD `invite_mode` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `application_prompt` text;