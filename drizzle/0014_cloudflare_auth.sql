ALTER TABLE `users` ADD `password_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_iterations` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` text;
