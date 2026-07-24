import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  baselineChanges,
  milestones,
  projects,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";
import {
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    await ensureSeeded();
    const payload = (await request.json()) as {
      projectId?: string;
      reason?: string;
      impact?: string;
      changes?: Array<{
        milestoneId?: number;
        sequence?: number;
        to?: string;
      }>;
    };
    const projectId = requiredString(payload.projectId, "项目编号");
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return Response.json({ error: "未找到指定项目。" }, { status: 404 });
    }
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) return lifecycleLockedResponse(project);
    const [pending] = await db
      .select({ id: baselineChanges.id })
      .from(baselineChanges)
      .where(
        and(
          eq(baselineChanges.projectId, projectId),
          eq(baselineChanges.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      return Response.json(
        { error: "该项目已有待审批的基线变更，请先完成现有审批。" },
        { status: 409 },
      );
    }
    if (!payload.changes?.length || payload.changes.length > 20) {
      throw new ApiRequestError("基线变更必须包含1至20个节点调整。");
    }
    const milestoneRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId));
    const normalized = payload.changes.map((change, index) => {
      const milestone = milestoneRows.find(
        (row) =>
          (change.milestoneId && row.id === change.milestoneId) ||
          (change.sequence && row.sequence === change.sequence),
      );
      if (!milestone) {
        throw new ApiRequestError(`第${index + 1}项变更的节点不存在。`);
      }
      if (!milestone.applicable) {
        throw new ApiRequestError(`${milestone.name}已标记为不适用，不能调整基线。`);
      }
      const to = requiredIsoDate(change.to, `${milestone.name}新计划完成日`);
      if (to === milestone.plannedFinish) {
        throw new ApiRequestError(`${milestone.name}的新日期与当前基线相同。`);
      }
      const days = Math.round(
        (Date.parse(`${to}T00:00:00Z`) -
          Date.parse(`${milestone.plannedFinish}T00:00:00Z`)) /
          86_400_000,
      );
      return {
        milestone: milestone.name,
        milestoneId: milestone.id,
        sequence: milestone.sequence,
        from: milestone.plannedFinish,
        to,
        days,
      };
    });
    if (new Set(normalized.map((change) => change.milestoneId)).size !== normalized.length) {
      throw new ApiRequestError("同一节点不能在一次申请中重复调整。");
    }
    const [change] = await db
      .insert(baselineChanges)
      .values({
        projectId,
        versionFrom: project.currentBaselineVersion,
        versionTo: project.currentBaselineVersion + 1,
        reason: requiredString(payload.reason, "变更原因"),
        changesJson: JSON.stringify(normalized),
        impact: requiredString(payload.impact, "影响评估"),
        requestedBy: identity.email,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "baseline_change.request",
      entityType: "baseline_change",
      entityId: String(change.id),
      detailJson: JSON.stringify({
        projectId,
        versionFrom: change.versionFrom,
        versionTo: change.versionTo,
        changes: normalized,
      }),
    });
    return Response.json(
      { change: { ...change, changes: normalized } },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("baseline_changes_one_pending_project_idx") ||
        error.message.includes("UNIQUE constraint failed: baseline_changes.project_id"))
    ) {
      return Response.json(
        { error: "该项目已有待审批的基线变更，请先完成现有审批。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
