CREATE TABLE `channel_posts` (
	`request_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` integer,
	`status` text NOT NULL,
	`posted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_posts_status_idx` ON `channel_posts` (`status`,`posted_at`);--> statement-breakpoint
CREATE TABLE `notification_log` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_log_user_idx` ON `notification_log` (`user_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`prefs` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `telegram_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_link_tokens_user_idx` ON `telegram_link_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`active` integer DEFAULT true NOT NULL,
	`linked_at` integer NOT NULL,
	`blocked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_id_unique` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `requests` ADD `channel_opt_in` integer DEFAULT true NOT NULL;