ALTER TABLE `email_sends` ADD `sender_ip` text;--> statement-breakpoint
CREATE INDEX `idx_email_sends_ip` ON `email_sends` (`sender_ip`);