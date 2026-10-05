CREATE TABLE `presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`online` integer DEFAULT false NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
