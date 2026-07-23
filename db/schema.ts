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
    originalBaselineVersion: integer("original_baseline_version").notNull().default(1),
    currentBaselineVersion: integer("current_baseline_version").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("projects_code_idx").on(table.code),
    index("projects_status_idx").on(table.status),
    index("projects_org_idx").on(table.org),
  ],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    weight: real("weight").notNull(),
    critical: integer("critical", { mode: "boolean" }).notNull().default(false),
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
