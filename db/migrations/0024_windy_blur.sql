CREATE TABLE `fee_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`deal_id` text,
	`stage_id` text,
	`rate_bp` integer,
	`base_amount` integer,
	`invoice_id` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fee_entries_user_idx` ON `fee_entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `fee_entries_accrual_idx` ON `fee_entries` (`deal_id`,`stage_id`) WHERE "fee_entries"."kind" = 'accrual';--> statement-breakpoint
CREATE UNIQUE INDEX `fee_entries_payment_idx` ON `fee_entries` (`invoice_id`) WHERE "fee_entries"."kind" = 'payment';--> statement-breakpoint
CREATE TABLE `fee_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`modified_date` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fee_invoices_invoice_idx` ON `fee_invoices` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `fee_invoices_user_idx` ON `fee_invoices` (`user_id`);