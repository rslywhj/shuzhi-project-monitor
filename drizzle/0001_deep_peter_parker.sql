CREATE TABLE `risks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '进度' NOT NULL,
	`level` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`description` text NOT NULL,
	`mitigation` text DEFAULT '' NOT NULL,
	`owner` text NOT NULL,
	`due_date` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `risks_project_status_idx` ON `risks` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `risks_level_idx` ON `risks` (`level`);--> statement-breakpoint
INSERT INTO `risks` (
	`project_id`,
	`title`,
	`category`,
	`level`,
	`status`,
	`description`,
	`mitigation`,
	`owner`,
	`created_by`
)
SELECT
	`id`,
	'项目综合风险',
	'综合',
	`risk_level`,
	'monitoring',
	'由既有项目风险等级迁移生成，请项目经理补充详细风险说明。',
	'按周跟踪风险变化并落实纠偏措施。',
	`owner_name`,
	'system-migration'
FROM `projects`
WHERE `risk_level` IN ('medium', 'high');--> statement-breakpoint
ALTER TABLE `corrective_actions` ADD `risk_id` integer REFERENCES risks(id);--> statement-breakpoint
ALTER TABLE `corrective_actions` ADD `progress` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `corrective_actions` ADD `updated_at` text DEFAULT '1970-01-01 00:00:00' NOT NULL;--> statement-breakpoint
UPDATE `corrective_actions` SET `updated_at` = `created_at`;
