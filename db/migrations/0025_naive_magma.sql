CREATE TABLE `phone_blocks` (
	`phone_hash` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `telegram_link_tokens` ADD `purpose` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_mask` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` integer;--> statement-breakpoint
CREATE INDEX `users_phone_hash_idx` ON `users` (`phone_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_live_idx` ON `users` (`phone_hash`) WHERE "users"."deleted_at" is null and "users"."phone_hash" is not null;