ALTER TABLE `milestones` ADD `execution_status` text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE `milestones` ADD `actual_start` text;
--> statement-breakpoint
ALTER TABLE `milestones` ADD `paused_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `milestones` ADD `execution_updated_at` text;
--> statement-breakpoint
ALTER TABLE `milestones` ADD `execution_updated_by` text;
--> statement-breakpoint
UPDATE `milestones`
SET `execution_status` = CASE
  WHEN `completion` >= 100 OR `actual_finish` IS NOT NULL THEN 'completed'
  WHEN `completion` > 0 THEN 'in_progress'
  ELSE 'not_started'
END;
--> statement-breakpoint
CREATE INDEX `milestones_project_execution_idx`
ON `milestones` (`project_id`, `execution_status`);
--> statement-breakpoint
ALTER TABLE `weekly_reports` ADD `primary_milestone_id` integer REFERENCES `milestones`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `weekly_reports` ADD `milestone_updates_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE INDEX `weekly_reports_primary_milestone_idx`
ON `weekly_reports` (`primary_milestone_id`);
