PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_request_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`key` text,
	`uploader_user_id` text,
	`created_at` integer,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_request_files`(`id`, `request_id`, `name`, `size`, `type`) SELECT `id`, `request_id`, `name`, `size`, `type` FROM `request_files`;--> statement-breakpoint
DROP TABLE `request_files`;--> statement-breakpoint
ALTER TABLE `__new_request_files` RENAME TO `request_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `request_files_request_idx` ON `request_files` (`request_id`);--> statement-breakpoint
CREATE INDEX `request_files_uploader_idx` ON `request_files` (`uploader_user_id`,`request_id`);