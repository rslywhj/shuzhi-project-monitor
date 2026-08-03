CREATE TABLE `biweekly_plan_tasks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_id` text NOT NULL,
  `week_key` text NOT NULL,
  `task_description` text NOT NULL,
  `owner` text NOT NULL,
  `participants` text DEFAULT '' NOT NULL,
  `planned_start` text NOT NULL,
  `planned_finish` text NOT NULL,
  `workdays` real DEFAULT 1 NOT NULL,
  `actual_finish` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `tracking` text DEFAULT '' NOT NULL,
  `remark` text DEFAULT '' NOT NULL,
  `sequence` integer DEFAULT 1 NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `biweekly_plan_tasks_project_week_idx` ON `biweekly_plan_tasks` (`project_id`,`week_key`,`sequence`);
--> statement-breakpoint
CREATE INDEX `biweekly_plan_tasks_status_idx` ON `biweekly_plan_tasks` (`status`);
