import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  attachments,
  baselineChanges,
  baselineVersions,
  correctiveActions,
  milestones,
  projects,
  risks,
  weeklyReports,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();

    const { id } = await context.params;
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }

    const [reportRows, versionRows, changeRows, milestoneRows, riskRows, actionRows, attachmentRows] =
      await Promise.all([
        db
          .select()
          .from(weeklyReports)
          .where(eq(weeklyReports.projectId, id))
          .orderBy(desc(weeklyReports.weekKey))
          .limit(100),
        db
          .select()
          .from(baselineVersions)
          .where(eq(baselineVersions.projectId, id))
          .orderBy(desc(baselineVersions.version)),
        db
          .select()
          .from(baselineChanges)
          .where(eq(baselineChanges.projectId, id))
          .orderBy(desc(baselineChanges.requestedAt)),
        db
          .select({ id: milestones.id })
          .from(milestones)
          .where(eq(milestones.projectId, id)),
        db
          .select({ id: risks.id })
          .from(risks)
          .where(eq(risks.projectId, id)),
        db
          .select({ id: correctiveActions.id })
          .from(correctiveActions)
          .where(eq(correctiveActions.projectId, id)),
        db
          .select({
            id: attachments.id,
            projectId: attachments.projectId,
            weekKey: attachments.weekKey,
            milestoneId: attachments.milestoneId,
            filename: attachments.filename,
            contentType: attachments.contentType,
            sizeBytes: attachments.sizeBytes,
            uploadedBy: attachments.uploadedBy,
            createdAt: attachments.createdAt,
          })
          .from(attachments)
          .where(eq(attachments.projectId, id))
          .orderBy(desc(attachments.createdAt))
          .limit(200),
      ]);

    const projectAuditCondition = and(
      eq(auditLogs.entityType, "project"),
      eq(auditLogs.entityId, id),
    );
    const relatedConditions = [
      milestoneRows.length
        ? and(
            eq(auditLogs.entityType, "milestone"),
            inArray(
              auditLogs.entityId,
              milestoneRows.map((row) => String(row.id)),
            ),
          )
        : undefined,
      riskRows.length
        ? and(
            eq(auditLogs.entityType, "risk"),
            inArray(
              auditLogs.entityId,
              riskRows.map((row) => String(row.id)),
            ),
          )
        : undefined,
      actionRows.length
        ? and(
            eq(auditLogs.entityType, "corrective_action"),
            inArray(
              auditLogs.entityId,
              actionRows.map((row) => String(row.id)),
            ),
          )
        : undefined,
      changeRows.length
        ? and(
            eq(auditLogs.entityType, "baseline_change"),
            inArray(
              auditLogs.entityId,
              changeRows.map((row) => String(row.id)),
            ),
          )
        : undefined,
      attachmentRows.length
        ? and(
            eq(auditLogs.entityType, "attachment"),
            inArray(
              auditLogs.entityId,
              attachmentRows.map((row) => String(row.id)),
            ),
          )
        : undefined,
    ].filter((condition) => condition !== undefined);
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(or(projectAuditCondition, ...relatedConditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);

    return Response.json({
      weeklyReports: reportRows.map((row) => ({
        ...row,
        draft: parseJson(row.draftJson),
        draftJson: undefined,
      })),
      baselineVersions: versionRows.map((row) => ({
        ...row,
        milestones: parseJson(row.milestoneJson),
        milestoneJson: undefined,
      })),
      baselineChanges: changeRows.map((row) => ({
        ...row,
        changes: parseJson(row.changesJson),
        changesJson: undefined,
      })),
      attachments: attachmentRows,
      auditLogs: auditRows.map((row) => ({
        ...row,
        detail: parseJson(row.detailJson),
        detailJson: undefined,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
