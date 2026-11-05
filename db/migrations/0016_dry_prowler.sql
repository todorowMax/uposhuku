CREATE TABLE `wallet_challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`address` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wallet_challenges_user_idx` ON `wallet_challenges` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `crypto_proofs` ADD `chain` text DEFAULT 'tron' NOT NULL;