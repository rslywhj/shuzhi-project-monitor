import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  notifications,
  projects,
  users,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredWeekKey,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ReminderKind = "report_reminder" | "red_escalation";

function chunks<T>(rows: T[], size = 5) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();
    const payload = (await request.json()) as {
      projectIds?: string[];
      weekKey?: string;
      kind?: ReminderKind;
    };
    const kind = payload.kind;
    if (kind !== "report_reminder" && kind !== "red_escalation") {
      throw new ApiRequestError("催报类型无效。");
    }
    const weekKey = requiredWeekKey(payload.weekKey, "催报周期");
    const projectIds = [
      ...new Set(
        (Array.isArray(payload.projectIds) ? payload.projectIds : [])
          .map((item) => String(item).trim())
          .filter(Boolean),
      ),
    ];
    if (!projectIds.length || projectIds.length > 50) {
      throw new ApiRequestError("每次请选择1至50个项目。");
    }
    const db = getDb();
    const projectRows = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, projectIds));
    if (projectRows.length !== projectIds.length) {
      throw new ApiRequestError("部分催报项目不存在，请刷新后重试。");
    }
    if (
      kind === "red_escalation" &&
      projectRows.some((project) => project.status !== "red")
    ) {
      throw new ApiRequestError("红灯升级只能针对当前红色项目。");
    }
    const governanceRecipients =
      kind === "red_escalation"
        ? await db
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
            )
        : [];
    const recipientRows = projectRows.flatMap((project) => {
      const recipients =
        kind === "report_reminder"
          ? [project.ownerEmail]
          : [
              project.ownerEmail,
              ...governanceRecipients.map((row) => row.email),
            ];
      return [...new Set(recipients)].map((recipientEmail) => ({
        recipientEmail,
        projectId: project.id,
        type: kind,
        severity: kind === "red_escalation" ? ("critical" as const) : ("warning" as const),
        title:
          kind === "red_escalation"
            ? `红灯升级：${project.name}`
            : `周报催报：${project.name}`,
        message:
          kind === "red_escalation"
            ? `${project.name}当前综合状态为红色，请立即核实关键节点、风险与纠偏措施并更新处置结论。`
            : `${project.name}尚未完成${weekKey}周报，请在本周五17:00锁数前提交正式进度。`,
        actionView: kind === "red_escalation" ? ("project" as const) : ("report" as const),
        referenceKey: weekKey,
        status: "unread" as const,
        createdBy: identity.email,
        createdAt: sql`CURRENT_TIMESTAMP`,
        readAt: null,
      }));
    });
    for (const batch of chunks(recipientRows)) {
      await db
        .insert(notifications)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            notifications.recipientEmail,
            notifications.projectId,
            notifications.type,
            notifications.referenceKey,
          ],
          set: {
            severity:
              kind === "red_escalation" ? "critical" : "warning",
            title: sql`excluded.title`,
            message: sql`excluded.message`,
            actionView: sql`excluded.action_view`,
            status: "unread",
            createdBy: identity.email,
            createdAt: sql`CURRENT_TIMESTAMP`,
            readAt: null,
          },
        });
    }
    const auditRows = projectRows.map((project) => ({
        actorEmail: identity.email,
        action:
          kind === "red_escalation"
            ? "notification.escalate_red"
            : "notification.remind_report",
        entityType: "project",
        entityId: project.id,
        detailJson: JSON.stringify({
          weekKey,
          recipientCount: recipientRows.filter(
            (row) => row.projectId === project.id,
          ).length,
        }),
      }));
    for (const batch of chunks(auditRows, 10)) {
      await db.insert(auditLogs).values(batch);
    }
    return Response.json(
      {
        sent: recipientRows.length,
        projects: projectRows.length,
        kind,
        weekKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
