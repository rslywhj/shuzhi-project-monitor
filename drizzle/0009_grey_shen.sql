CREATE TABLE `portfolio_health_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_key` text NOT NULL,
	`as_of_date` text NOT NULL,
	`evaluation_week_key` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`project_count` integer DEFAULT 0 NOT NULL,
	`changed_project_count` integer DEFAULT 0 NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_health_runs_key_idx` ON `portfolio_health_runs` (`run_key`);--> statement-breakpoint
CREATE INDEX `portfolio_health_runs_status_idx` ON `portfolio_health_runs` (`status`,`started_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `health_calculated_at` text;