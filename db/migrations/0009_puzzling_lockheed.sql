CREATE TABLE `deal_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`provider` text NOT NULL,
	`invoice_id` text NOT NULL,
	`status` text NOT NULL,
	`card` text NOT NULL,
	`amount` integer NOT NULL,
	`final_amount` integer,
	`page_url` text NOT NULL,
	`basket` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deal_payments_invoice_idx` ON `deal_payments` (`provider`,`invoice_id`);--> statement-breakpoint
CREATE INDEX `deal_payments_stage_idx` ON `deal_payments` (`deal_id`,`stage_id`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payout_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`tax_id` text,
	`receiver_id` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_accounts_user_provider_idx` ON `payout_accounts` (`user_id`,`provider`);