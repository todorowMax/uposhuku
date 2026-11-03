CREATE TABLE `placement_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`modified_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `placement_invoices_invoice_idx` ON `placement_invoices` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `placement_invoices_user_idx` ON `placement_invoices` (`user_id`);