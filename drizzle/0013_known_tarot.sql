CREATE TABLE `error_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`error_id` text NOT NULL,
	`status` integer NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
