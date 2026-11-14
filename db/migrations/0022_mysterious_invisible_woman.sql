ALTER TABLE `requests` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `requests` ADD `edit_count` integer DEFAULT 0 NOT NULL;