CREATE TABLE `deal_requisites` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`cipher` text NOT NULL,
	`mask` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payout_requisites` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cipher` text NOT NULL,
	`mask` text NOT NULL,
	`pending_cipher` text,
	`pending_mask` text,
	`pending_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `requisite_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`reader_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `requisite_reads_deal_idx` ON `requisite_reads` (`deal_id`,`created_at`);