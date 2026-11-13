CREATE TABLE `legal_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`doc` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`source` text NOT NULL,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_acceptances_user_doc_version_idx` ON `legal_acceptances` (`user_id`,`doc`,`version`);