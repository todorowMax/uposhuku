ALTER TABLE `requests` ADD `renewed_at` integer;--> statement-breakpoint
ALTER TABLE `requests` ADD `renewal_asked_at` integer;--> statement-breakpoint
ALTER TABLE `requests` ADD `close_reason` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `status` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
-- Строк життя наявних запитів іде від публікації або від правки, якщо вона пізніша; усі відгуки стають «new».
UPDATE `requests` SET `renewed_at` = MAX(`created_at`, COALESCE(`edited_at`, 0));
