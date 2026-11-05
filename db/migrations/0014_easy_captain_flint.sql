CREATE TABLE `admin_totp_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_counter` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `reject_reason` text;