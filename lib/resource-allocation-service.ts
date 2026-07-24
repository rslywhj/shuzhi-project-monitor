import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  milestones,
  projects,
  resourceAllocations,
  resources,
} from "@/db/schema";
import {
  ApiRequestError,
  requiredIsoDate,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { allocationConflictPreview } from "@/lib/resource-capacity";

export type AllocationInput = {
  resourceId?: unknown;
  projectId?: unknown;
  milestoneId?: unknown;
  role?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  hoursPerWeek?: unknown;
  status?: unknown;
  note?: unknown;
  overrideReason?: unknown;
};

const statuses = new Set(["planned", "confirmed", "cancelled"]);

export function normalizedAllocationInput(
  payload: AllocationInput,
  existing?: typeof resourceAllocations.$inferSelect,
) {
  const resourceId = Number(payload.resourceId ?? existing?.resourceId);
  const rawMilestoneId =
    payload.milestoneId !== undefined
      ? payload.milestoneId
      : existing?.milestoneId ?? null;
  const milestoneIdValue =
    rawMilestoneId === "" || rawMilestoneId === null
      ? null
      : Number(rawMilestoneId);
  const statusValue = payload.status ?? existing?.status ?? "planned";
  if (!Number.isInteger(resourceId) || resourceId < 1) {
    throw new ApiRequestError("请选择有效资源。");
  }
  if (
    milestoneIdValue !== null &&
    (!Number.isInteger(milestoneIdValue) || milestoneIdValue < 1)
  ) {
    throw new ApiRequestError("关联节点编号无效。");
  }
  if (typeof statusValue !== "string" || !statuses.has(statusValue)) {
    throw new ApiRequestError("资源分配状态无效。");
  }
  const projectId = requiredString(
    payload.projectId ?? existing?.projectId,
    "项目",
  );
  const role = requiredString(
    payload.role ?? existing?.role,
    "承担角色",
  );
  const startDate = requiredIsoDate(
    payload.startDate ?? existing?.startDate,
    "开始日期",
  );
  const endDate = requiredIsoDate(
    payload.endDate ?? existing?.endDate,
    "结束日期",
  );
  if (startDate > endDate) {
    throw new ApiRequestError("结束日期不能早于开始日期。");
  }
  if (role.length > 80) {
    throw new ApiRequestError("承担角色不能超过80个字符。");
  }
  const hoursPerWeek = safeNumber(
    payload.hoursPerWeek ?? existing?.hoursPerWeek,
    "每周投入工时",
    1,
    168,
  );
  const note =
    payload.note === undefined
      ? existing?.note ?? ""
      : typeof payload.note === "string"
        ? payload.note.trim()
        : "";
  const overrideReason =
    payload.overrideReason === undefined
      ? existing?.overrideReason ?? ""
      : typeof payload.overrideReason === "string"
        ? payload.overrideReason.trim()
        : "";
  if (note.length > 500 || overrideReason.length > 500) {
    throw new ApiRequestError("备注和超配说明不能超过500个字符。");
  }
  return {
    resourceId,
    projectId,
    milestoneId: milestoneIdValue,
    role,
    startDate,
    endDate,
    hoursPerWeek,
    status: statusValue as "planned" | "confirmed" | "cancelled",
    note,
    overrideReason,
  };
}

export async function allocationRelations(
  db: ReturnType<typeof getDb>,
  allocation: ReturnType<typeof normalizedAllocationInput>,
) {
  const [[resource], [project]] = await Promise.all([
    db
      .select()
      .from(resources)
      .where(eq(resources.id, allocation.resourceId))
      .limit(1),
    db
      .select()
      .from(projects)
      .where(eq(projects.id, allocation.projectId))
      .limit(1),
  ]);
  if (!resource) {
    throw new ApiRequestError("所选资源不存在。", 404);
  }
  if (!resource.active && allocation.status !== "cancelled") {
    throw new ApiRequestError("所选资源已停用，不能新增或继续分配。", 409);
  }
  if (!project) {
    throw new ApiRequestError("所选项目不存在。", 404);
  }
  if (allocation.milestoneId) {
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, allocation.milestoneId))
      .limit(1);
    if (!milestone || milestone.projectId !== project.id) {
      throw new ApiRequestError("关联节点不存在或不属于所选项目。");
    }
  }
  return { resource, project };
}

export async function conflictsForAllocation(
  db: ReturnType<typeof getDb>,
  proposed: typeof resourceAllocations.$inferSelect,
) {
  const [resourceRows, allocationRows, projectRows, milestoneRows] =
    await Promise.all([
      db.select().from(resources),
      db.select().from(resourceAllocations),
      db.select().from(projects),
      db.select().from(milestones),
    ]);
  return allocationConflictPreview({
    resources: resourceRows,
    allocations: allocationRows,
    projects: projectRows,
    milestones: milestoneRows,
    proposed,
  });
}
