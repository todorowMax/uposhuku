ALTER TABLE `conversations` ADD `customer_read_at` integer;--> statement-breakpoint
ALTER TABLE `conversations` ADD `performer_read_at` integer;--> statement-breakpoint
-- Старі розмови вважаємо прочитаними: обидві мітки стають часом останньої зміни.
UPDATE `conversations` SET `customer_read_at` = `updated_at`, `performer_read_at` = `updated_at`;
