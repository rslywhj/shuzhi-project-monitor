import { and, desc, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  notifications,
  projects,
  snapshots,
  users,
  weeklyReports,
} from "@/db/schema";
import {
  portfolioAutomationWindow,
  type PortfolioAutomationWindow,
} from "@/lib/reporting-period";
import {
  lockPortfolioSnapshot,
  type SnapshotLockResult,
} from "@/lib/snapshot-service";
import { ensureSeeded } from "@/lib/seed";
import {
  processDueExternalDeliveries,
  queueExternalNotifications,
} from "@/lib/notification-delivery";

const AUTOMATION_ACTOR = "system:portfolio-automation";
const NOTIFICATION_BATCH_SIZE = 5;

type AutomationTrigger = "cron" | "request";

function chunks<T>(rows: T[], size = NOTIFICATION_BATCH_SIZE) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

export type PortfolioAutomationResult = {
  trigger: AutomationTrigger;
  window: PortfolioAutomationWindow;
  reminderCount: number;
  overdueNoticeCount: number;
  redEscalationCount: number;
  externalProcessed: number;
  externalSent: number;
  externalFailed: number;
  lockOutcome: SnapshotLockResult["outcome"] | "not_due";
};

async function latestSnapshot(weekKey: string) {
  const db = getDb();
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.weekKey, weekKey))
    .orderBy(desc(snapshots.version))
    .limit(1);
  return snapshot;
}

async function createReportNotices(
  weekKey: string,
  phase: "reminder" | "overdue",
) {
  const db = getDb();
  const [projectRows, reportRows] = await Promise.all([
    db.select().from(projects),
    db
      .select({ projectId: weeklyReports.projectId })
      .from(weeklyReports)
      .where(
        and(
          eq(weeklyReports.weekKey, weekKey),
          ne(weeklyReports.status, "draft"),
        ),
      ),
  ]);
  const submittedProjectIds = new Set(
    reportRows.map((report) => report.projectId),
  );
  const missingProjects = projectRows.filter(
    (project) => !submittedProjectIds.has(project.id),
  );
  if (!missingProjects.length) return 0;
  const rows = missingProjects.map((project) => ({
    recipientEmail: project.ownerEmail,
    projectId: project.id,
    type: "report_reminder" as const,
    severity:
      phase === "overdue" ? ("critical" as const) : ("warning" as const),
    title:
      phase === "overdue"
        ? `周报逾期：${project.name}`
        : `自动催报：${project.name}`,
    message:
      phase === "overdue"
        ? `${project.name}未在${weekKey}周五17:00前提交正式周报，该周期快照已锁定。请联系PMO说明原因并申请重新打开。`
        : `${project.name}尚未完成${weekKey}周报，请在本周五17:00自动锁数前提交正式进度。`,
    actionView:
      phase === "overdue" ? ("project" as const) : ("report" as const),
    referenceKey: `${weekKey}:auto-${phase}`,
    status: "unread" as const,
    createdBy: AUTOMATION_ACTOR,
  }));
  const created: Array<{ id: number }> = [];
  for (const batch of chunks(rows)) {
    created.push(
      ...(await db
        .insert(notifications)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: notifications.id })),
    );
  }
  if (created.length) {
    await db.insert(auditLogs).values({
      actorEmail: AUTOMATION_ACTOR,
      action:
        phase === "overdue"
          ? "automation.report_overdue"
          : "automation.report_reminder",
      entityType: "reporting_period",
      entityId: weekKey,
      detailJson: JSON.stringify({ created: created.length }),
    });
  }
  await queueExternalNotifications(
    missingProjects.map((project) => ({
      projectId: project.id,
      eventType: "report_reminder" as const,
      referenceKey: `${weekKey}:auto-${phase}`,
      title:
        phase === "overdue"
          ? `周报逾期：${project.name}`
          : `自动催报：${project.name}`,
      message:
        phase === "overdue"
          ? `${project.name}未在${weekKey}周五17:00前提交正式周报，该周期快照已锁定。请联系PMO说明原因并申请重新打开。`
          : `${project.name}尚未完成${weekKey}周报，请在本周五17:00自动锁数前提交正式进度。`,
      severity:
        phase === "overdue"
          ? ("critical" as const)
          : ("warning" as const),
    })),
    AUTOMATION_ACTOR,
  );
  return created.length;
}

async function createRedEscalations(weekKey: string) {
  const db = getDb();
  const [redProjects, governanceRecipients] = await Promise.all([
    db.select().from(projects).where(eq(projects.status, "red")),
    db
      .select({ email: users.email })
      .from(users)
      .where(
        and(
          eq(users.active, true),
          or(
            eq(users.role, "executive"),
            eq(users.role, "pmo"),
            eq(users.role, "admin"),
          ),
        ),
      ),
  ]);
  const rows = redProjects.flatMap((project) =>
    [
      ...new Set([
        project.ownerEmail,
        ...governanceRecipients.map((recipient) => recipient.email),
      ]),
    ].map((recipientEmail) => ({
      recipientEmail,
      projectId: project.id,
      type: "red_escalation" as const,
      severity: "critical" as const,
      title: `自动红灯升级：${project.name}`,
      message: `${project.name}在${weekKey}锁定口径下为红色，请立即核实关键节点、风险与纠偏措施并更新处置结论。`,
      actionView: "project" as const,
      referenceKey: weekKey,
      status: "unread" as const,
      createdBy: AUTOMATION_ACTOR,
    })),
  );
  if (!rows.length) return 0;
  const created: Array<{ id: number }> = [];
  for (const batch of chunks(rows)) {
    created.push(
      ...(await db
        .insert(notifications)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: notifications.id })),
    );
  }
  if (created.length) {
    await db.insert(auditLogs).values({
      actorEmail: AUTOMATION_ACTOR,
      action: "automation.red_escalation",
      entityType: "reporting_period",
      entityId: weekKey,
      detailJson: JSON.stringify({
        projectCount: redProjects.length,
        created: created.length,
      }),
    });
  }
  await queueExternalNotifications(
    redProjects.map((project) => ({
      projectId: project.id,
      eventType: "red_escalation" as const,
      referenceKey: weekKey,
      title: `自动红灯升级：${project.name}`,
      message: `${project.name}在${weekKey}锁定口径下为红色，请立即核实关键节点、风险与纠偏措施并更新处置结论。`,
      severity: "critical" as const,
    })),
    AUTOMATION_ACTOR,
  );
  return created.length;
}

export async function runPortfolioAutomation(
  now = new Date(),
  trigger: AutomationTrigger = "request",
): Promise<PortfolioAutomationResult> {
  await ensureSeeded();
  const window = portfolioAutomationWindow(now);
  let reminderCount = 0;
  let overdueNoticeCount = 0;
  let redEscalationCount = 0;
  let externalProcessed = 0;
  let externalSent = 0;
  let externalFailed = 0;
  let lockOutcome: PortfolioAutomationResult["lockOutcome"] = "not_due";

  if (window.advanceReminderWeekKey) {
    const currentSnapshot = await latestSnapshot(
      window.advanceReminderWeekKey,
    );
    if (currentSnapshot?.status !== "locked") {
      reminderCount = await createReportNotices(
        window.advanceReminderWeekKey,
        "reminder",
      );
    }
  }

  if (window.dueLockWeekKey) {
    const result = await lockPortfolioSnapshot({
      weekKey: window.dueLockWeekKey,
      actorEmail: AUTOMATION_ACTOR,
      source: "automation",
      capturedAt: now,
    });
    lockOutcome = result.outcome;
    if (result.outcome !== "reopened") {
      [overdueNoticeCount, redEscalationCount] = await Promise.all([
        createReportNotices(window.dueLockWeekKey, "overdue"),
        createRedEscalations(window.dueLockWeekKey),
      ]);
    }
  }
  const externalDelivery = await processDueExternalDeliveries(20);
  externalProcessed = externalDelivery.processed;
  externalSent = externalDelivery.sent;
  externalFailed = externalDelivery.failed;

  return {
    trigger,
    window,
    reminderCount,
    overdueNoticeCount,
    redEscalationCount,
    externalProcessed,
    externalSent,
    externalFailed,
    lockOutcome,
  };
}
