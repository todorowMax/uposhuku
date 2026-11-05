CREATE TABLE `crypto_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`tx_hash` text NOT NULL,
	`from_address` text NOT NULL,
	`to_address` text NOT NULL,
	`amount_units` text NOT NULL,
	`confirmations` integer NOT NULL,
	`block_time` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crypto_proofs_hash_idx` ON `crypto_proofs` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `crypto_proofs_deal_idx` ON `crypto_proofs` (`deal_id`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`feature` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`users` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
