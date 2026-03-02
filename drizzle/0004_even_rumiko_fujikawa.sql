CREATE TABLE `email_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_email` text NOT NULL,
	`email_type` text NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_sends_recipient` ON `email_sends` (`recipient_email`);