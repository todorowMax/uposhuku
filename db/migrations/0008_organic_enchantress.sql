CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`action` text NOT NULL,
	`comment` text NOT NULL,
	`admin_user_id` text NOT NULL,
	`admin_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_actions_deal_idx` ON `moderation_actions` (`deal_id`,`created_at`);