CREATE TABLE `tag_proposal_uses` (
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`context` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `user_id`, `context`, `entity_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `tag_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_proposal_uses_user_idx` ON `tag_proposal_uses` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tag_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`phrase_key` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`resolved_tag_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_proposals_key_idx` ON `tag_proposals` (`phrase_key`);--> statement-breakpoint
CREATE INDEX `tag_proposals_status_idx` ON `tag_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `tag_term_stats` (
	`term_key` text PRIMARY KEY NOT NULL,
	`sample` text NOT NULL,
	`requests` integer DEFAULT 1 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tag_term_stats_seen_idx` ON `tag_term_stats` (`last_seen`);