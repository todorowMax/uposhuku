ALTER TABLE `messages` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `context_id` text;