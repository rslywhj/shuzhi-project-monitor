import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, projects, resourceAllocations } from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import {
  allocationRelations,
  conflictsForAllocation,
  normalizedAllocationInput,
  type AllocationInput,
} from "@/lib/resource-allocation-service";
import {
  canManagePortfolio,
  canWriteProject,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";
import {
  lifecycleLockedResponse,
  projectLifecycleLocked,
} from "@/lib/project-lifecycle";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const { id } = await context.params;
    const allocationId = Number(id);
    if (!Number.isInteger(allocationId) || allocationId < 1) {
      throw new ApiRequestError("资源分配编号无效。");
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(resourceAllocations)
      .where(eq(resourceAllocations.id, allocationId))
      .limit(1);
    if (!existing) {
      return Response.json(
        { error: "未找到指定资源分配。" },
        { status: 404 },
      );
    }
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    if (!existingProject) {
      return Response.json({ error: "原资源分配所属项目不存在。" }, { status: 409 });
    }
    if (!canWriteProject(identity, existingProject.ownerEmail)) {
      return forbidden();
    }
    if (projectLifecycleLocked(existingProject)) {
      return lifecycleLockedResponse(existingProject);
    }
    const payload = (await request.json()) as AllocationInput;
    const normalized = normalizedAllocationInput(payload, existing);
    const { project } = await allocationRelations(db, normalized);
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) {
      return lifecycleLockedResponse(project);
    }
    const canGovern = canManagePortfolio(identity);
    if (!canGovern) {
      if (existing.status !== "planned") {
        throw new ApiRequestError(
          "项目经理只能调整尚未确认的资源计划。",
          403,
        );
      }
      if (normalized.status === "confirmed") {
        throw new ApiRequestError(
          "项目经理不能直接确认资源分配，请提交PMO处理。",
          403,
        );
      }
    }
    const now = new Date().toISOString();
    const proposed: typeof resourceAllocations.$inferSelect = {
      ...existing,
      ...normalized,
      updatedAt: now,
    };
    const conflicts =
      normalized.status === "cancelled"
        ? []
        : await conflictsForAllocation(db, proposed);
    if (
      normalized.status === "confirmed" &&
      conflicts.length > 0 &&
      normalized.overrideReason.length < 10
    ) {
      return Response.json(
        {
          error:
            "确认后将造成资源超配，请填写至少10个字符的超配说明。",
          conflicts,
        },
        { status: 409 },
      );
    }
    const [allocation] = await db
      .update(resourceAllocations)
      .set({
        ...normalized,
        overrideReason:
          normalized.status === "confirmed"
            ? normalized.overrideReason
            : "",
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(resourceAllocations.id, allocationId))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "resource_allocation.update",
      entityType: "resource_allocation",
      entityId: String(allocationId),
      detailJson: JSON.stringify({
        before: {
          resourceId: existing.resourceId,
          projectId: existing.projectId,
          status: existing.status,
          hoursPerWeek: existing.hoursPerWeek,
        },
        after: {
          resourceId: allocation.resourceId,
          projectId: allocation.projectId,
          status: allocation.status,
          hoursPerWeek: allocation.hoursPerWeek,
        },
        conflictCount: conflicts.length,
        overrideReason: allocation.overrideReason,
      }),
    });
    return Response.json({ allocation, conflicts });
  } catch (error) {
    return apiError(error);
  }
}
