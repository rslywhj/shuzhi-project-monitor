import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["executive", "pmo", "manager", "admin"] })
    .notNull()
    .default("manager"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerEmail: text("owner_email").notNull(),
    ownerName: text("owner_name").notNull(),
    org: text("org").notNull(),
    type: text("type").notNull(),
    score: integer("score").notNull().default(100),
    status: text("status", { enum: ["green", "yellow", "red"] })
      .notNull()
      .default("green"),
    planProgress: real("plan_progress").notNull().default(0),
    actualProgress: real("actual_progress").notNull().default(0),
    declaredProgress: real("declared_progress").notNull().default(0),
    riskLevel: text("risk_level", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("low"),
    lifecycleStatus: text("lifecycle_status", {
      enum: ["active", "completed", "archived"],
    })
      .notNull()
      .default("active"),
    lifecycleReason: text("lifecycle_reason").notNull().default(""),
    completedAt: text("completed_at"),
    archivedAt: text("archived_at"),
    originalBaselineVersion: integer("original_baseline_version").notNull().default(1),
    currentBaselineVersion: integer("current_baseline_version").notNull().default(1),
    healthCalculatedAt: text("health_calculated_at"),
    healthExplanationJson: text("health_explanation_json").notNull().default("{}"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("projects_code_idx").on(table.code),
    index("projects_status_idx").on(table.status),
    index("projects_lifecycle_status_idx").on(table.lifecycleStatus),
    index("projects_org_idx").on(table.org),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipientEmail: text("recipient_email").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: text("type", {
      enum: [
        "report_reminder",
        "red_escalation",
        "baseline_decision",
        "system",
      ],
    }).notNull(),
    severity: text("severity", {
      enum: ["info", "warning", "critical"],
    })
      .notNull()
      .default("info"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    actionView: text("action_view", {
      enum: ["portfolio", "project", "report", "pmo", "admin"],
    }).notNull(),
    referenceKey: text("reference_key").notNull().default(""),
    status: text("status", { enum: ["unread", "read", "dismissed"] })
      .notNull()
      .default("unread"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    readAt: text("read_at"),
  },
  (table) => [
    uniqueIndex("notifications_dedup_idx").on(
      table.recipientEmail,
      table.projectId,
      table.type,
      table.referenceKey,
    ),
    index("notifications_recipient_status_idx").on(
      table.recipientEmail,
      table.status,
      table.createdAt,
    ),
    index("notifications_project_idx").on(table.projectId),
  ],
);

export const notificationChannels = sqliteTable(
  "notification_channels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    provider: text("provider", {
      enum: ["wecom", "dingtalk", "generic"],
    }).notNull(),
    webhookUrl: text("webhook_url").notNull(),
    eventTypesJson: text("event_types_json")
      .notNull()
      .default('["report_reminder","red_escalation"]'),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("notification_channels_name_idx").on(table.name),
    index("notification_channels_active_idx").on(table.active),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channelId: integer("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type", {
      enum: ["report_reminder", "red_escalation", "test"],
    }).notNull(),
    referenceKey: text("reference_key").notNull(),
    dedupKey: text("dedup_key").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity", {
      enum: ["info", "warning", "critical"],
    })
      .notNull()
      .default("info"),
    status: text("status", {
      enum: ["pending", "sending", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextAttemptAt: text("next_attempt_at"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex("notification_deliveries_dedup_idx").on(table.dedupKey),
    index("notification_deliveries_status_retry_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("notification_deliveries_channel_idx").on(
      table.channelId,
      table.createdAt,
    ),
  ],
);

export const portfolioHealthRuns = sqliteTable(
  "portfolio_health_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runKey: text("run_key").notNull(),
    asOfDate: text("as_of_date").notNull(),
    evaluationWeekKey: text("evaluation_week_key").notNull(),
    trigger: text("trigger", {
      enum: ["request", "cron", "manual"],
    }).notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    projectCount: integer("project_count").notNull().default(0),
    changedProjectCount: integer("changed_project_count").notNull().default(0),
    errorMessage: text("error_message").notNull().default(""),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("portfolio_health_runs_key_idx").on(table.runKey),
    index("portfolio_health_runs_status_idx").on(
      table.status,
      table.startedAt,
    ),
  ],
);

export const milestoneTemplates = sqliteTable(
  "milestone_templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    defaultWeight: real("default_weight").notNull(),
    critical: integer("critical", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    description: text("description").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("milestone_templates_code_idx").on(table.code),
    uniqueIndex("milestone_templates_sequence_idx").on(table.sequence),
  ],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    templateId: integer("template_id").references(() => milestoneTemplates.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    weight: real("weight").notNull(),
    critical: integer("critical", { mode: "boolean" }).notNull().default(false),
    custom: integer("custom", { mode: "boolean" }).notNull().default(false),
    applicable: integer("applicable", { mode: "boolean" }).notNull().default(true),
    plannedStart: text("planned_start").notNull(),
    plannedFinish: text("planned_finish").notNull(),
    forecastFinish: text("forecast_finish"),
    actualFinish: text("actual_finish"),
    completion: real("completion").notNull().default(0),
    status: text("status", { enum: ["green", "yellow", "red", "na"] })
      .notNull()
      .default("green"),
    deviationDays: integer("deviation_days").notNull().default(0),
    reason: text("reason").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("milestones_project_sequence_idx").on(table.projectId, table.sequence),
    index("milestones_status_idx").on(table.status),
  ],
);

export const weeklyReports = sqliteTable(
  "weekly_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    weekKey: text("week_key").notNull(),
    systemProgress: real("system_progress").notNull(),
    declaredProgress: real("declared_progress").notNull(),
    variance: real("variance").notNull(),
    reason: text("reason").notNull(),
    forecastFinish: text("forecast_finish"),
    draftJson: text("draft_json").notNull().default("{}"),
    status: text("status", { enum: ["draft", "submitted", "locked"] })
      .notNull()
      .default("submitted"),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("weekly_reports_project_week_idx").on(table.projectId, table.weekKey),
    index("weekly_reports_week_idx").on(table.weekKey),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    weekKey: text("week_key").notNull(),
    milestoneId: integer("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("attachments_object_key_idx").on(table.objectKey),
    index("attachments_project_week_idx").on(table.projectId, table.weekKey),
  ],
);

export const baselineVersions = sqliteTable(
  "baseline_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    kind: text("kind", { enum: ["original", "approved", "legacy"] })
      .notNull()
      .default("approved"),
    milestoneJson: text("milestone_json").notNull(),
    changeId: integer("change_id"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("baseline_versions_project_version_idx").on(
      table.projectId,
      table.version,
    ),
  ],
);

export const risks = sqliteTable(
  "risks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("进度"),
    level: text("level", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    status: text("status", { enum: ["open", "monitoring", "closed"] })
      .notNull()
      .default("open"),
    description: text("description").notNull(),
    mitigation: text("mitigation").notNull().default(""),
    owner: text("owner").notNull(),
    dueDate: text("due_date"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("risks_project_status_idx").on(table.projectId, table.status),
    index("risks_level_idx").on(table.level),
  ],
);

export const correctiveActions = sqliteTable(
  "corrective_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: integer("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    riskId: integer("risk_id").references(() => risks.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    recoveryDate: text("recovery_date").notNull(),
    detail: text("detail").notNull(),
    status: text("status", { enum: ["pending", "in_progress", "completed", "overdue"] })
      .notNull()
      .default("in_progress"),
    progress: integer("progress").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("actions_project_status_idx").on(table.projectId, table.status)],
);

export const baselineChanges = sqliteTable(
  "baseline_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionFrom: integer("version_from").notNull(),
    versionTo: integer("version_to").notNull(),
    reason: text("reason").notNull(),
    changesJson: text("changes_json").notNull(),
    impact: text("impact").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    requestedBy: text("requested_by").notNull(),
    requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    rejectedBy: text("rejected_by"),
    rejectedAt: text("rejected_at"),
    rejectionReason: text("rejection_reason").notNull().default(""),
  },
  (table) => [
    index("baseline_changes_status_idx").on(table.status),
    uniqueIndex("baseline_changes_one_pending_project_idx")
      .on(table.projectId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekKey: text("week_key").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status", { enum: ["locked", "reopened"] }).notNull().default("locked"),
    projectCount: integer("project_count").notNull(),
    completeness: real("completeness").notNull(),
    payloadJson: text("payload_json").notNull(),
    lockedBy: text("locked_by").notNull(),
    lockedAt: text("locked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    reopenEventId: text("reopen_event_id"),
    reopenedBy: text("reopened_by"),
    reopenedAt: text("reopened_at"),
    reopenReason: text("reopen_reason"),
  },
  (table) => [
    uniqueIndex("snapshots_week_version_idx").on(table.weekKey, table.version),
    index("snapshots_week_idx").on(table.weekKey),
  ],
);

export const ruleConfigs = sqliteTable("rule_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: integer("version").notNull().unique(),
  normalYellowDays: integer("normal_yellow_days").notNull().default(4),
  normalRedDays: integer("normal_red_days").notNull().default(8),
  criticalYellowDays: integer("critical_yellow_days").notNull().default(1),
  criticalRedDays: integer("critical_red_days").notNull().default(4),
  greenScore: integer("green_score").notNull().default(85),
  yellowScore: integer("yellow_score").notNull().default(70),
  progressYellowGap: integer("progress_yellow_gap").notNull().default(5),
  progressRedGap: integer("progress_red_gap").notNull().default(10),
  progressYellowPenalty: integer("progress_yellow_penalty").notNull().default(10),
  progressRedPenalty: integer("progress_red_penalty").notNull().default(20),
  normalYellowPenalty: integer("normal_yellow_penalty").notNull().default(3),
  normalRedPenalty: integer("normal_red_penalty").notNull().default(8),
  criticalYellowPenalty: integer("critical_yellow_penalty").notNull().default(8),
  criticalRedPenalty: integer("critical_red_penalty").notNull().default(20),
  schedulePenaltyCap: integer("schedule_penalty_cap").notNull().default(60),
  mediumRiskPenalty: integer("medium_risk_penalty").notNull().default(5),
  highRiskPenalty: integer("high_risk_penalty").notNull().default(15),
  riskPenaltyCap: integer("risk_penalty_cap").notNull().default(25),
  overdueActionPenalty: integer("overdue_action_penalty").notNull().default(5),
  actionPenaltyCap: integer("action_penalty_cap").notNull().default(15),
  missingReportPenalty: integer("missing_report_penalty").notNull().default(10),
  consecutiveMissingPenalty: integer("consecutive_missing_penalty")
    .notNull()
    .default(15),
  vetoCriticalRed: integer("veto_critical_red", { mode: "boolean" })
    .notNull()
    .default(true),
  vetoHighRiskOverdue: integer("veto_high_risk_overdue", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  vetoConsecutiveMissing: integer("veto_consecutive_missing", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_entity_idx").on(table.entityType, table.entityId),
    index("audit_actor_idx").on(table.actorEmail),
  ],
);
