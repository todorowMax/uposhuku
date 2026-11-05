CREATE TABLE `deal_release_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_release_codes_stage_idx` ON `deal_release_codes` (`user_id`,`deal_id`,`stage_id`);--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `tax_id_mask` text;--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `fop_name` text;--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `consent_at` integer;--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `account_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `payout_accounts` ADD `checked_at` integer;