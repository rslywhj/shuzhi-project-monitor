CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_email`);--> statement-breakpoint
CREATE TABLE `baseline_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`version_from` integer NOT NULL,
	`version_to` integer NOT NULL,
	`reason` text NOT NULL,
	`changes_json` text NOT NULL,
	`impact` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved_by` text,
	`approved_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `baseline_changes_status_idx` ON `baseline_changes` (`status`);--> statement-breakpoint
CREATE TABLE `corrective_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`milestone_id` integer,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`recovery_date` text NOT NULL,
	`detail` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `actions_project_status_idx` ON `corrective_actions` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`weight` real NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`applicable` integer DEFAULT true NOT NULL,
	`planned_start` text NOT NULL,
	`planned_finish` text NOT NULL,
	`forecast_finish` text,
	`actual_finish` text,
	`completion` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'green' NOT NULL,
	`deviation_days` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestones_project_sequence_idx` ON `milestones` (`project_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `milestones_status_idx` ON `milestones` (`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`org` text NOT NULL,
	`type` text NOT NULL,
	`score` integer DEFAULT 100 NOT NULL,
	`status` text DEFAULT 'green' NOT NULL,
	`plan_progress` real DEFAULT 0 NOT NULL,
	`actual_progress` real DEFAULT 0 NOT NULL,
	`declared_progress` real DEFAULT 0 NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`original_baseline_version` integer DEFAULT 1 NOT NULL,
	`current_baseline_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_idx` ON `projects` (`code`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org`);--> statement-breakpoint
CREATE TABLE `rule_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`normal_yellow_days` integer DEFAULT 4 NOT NULL,
	`normal_red_days` integer DEFAULT 8 NOT NULL,
	`critical_yellow_days` integer DEFAULT 1 NOT NULL,
	`critical_red_days` integer DEFAULT 4 NOT NULL,
	`green_score` integer DEFAULT 85 NOT NULL,
	`yellow_score` integer DEFAULT 70 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_configs_version_unique` ON `rule_configs` (`version`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'locked' NOT NULL,
	`project_count` integer NOT NULL,
	`completeness` real NOT NULL,
	`payload_json` text NOT NULL,
	`locked_by` text NOT NULL,
	`locked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_week_version_idx` ON `snapshots` (`week_key`,`version`);--> statement-breakpoint
CREATE INDEX `snapshots_week_idx` ON `snapshots` (`week_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'manager' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`week_key` text NOT NULL,
	`system_progress` real NOT NULL,
	`declared_progress` real NOT NULL,
	`variance` real NOT NULL,
	`reason` text NOT NULL,
	`forecast_finish` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_by` text NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_project_week_idx` ON `weekly_reports` (`project_id`,`week_key`);--> statement-breakpoint
CREATE INDEX `weekly_reports_week_idx` ON `weekly_reports` (`week_key`);