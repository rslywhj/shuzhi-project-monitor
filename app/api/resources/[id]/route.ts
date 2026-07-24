import { and, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  resourceAllocations,
  resources,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { shanghaiDateIso } from "@/lib/date-time";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const resourceTypes = new Set([
  "person",
  "team",
  "vendor",
  "environment",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const { id } = await context.params;
    const resourceId = Number(id);
    if (!Number.isInteger(resourceId) || resourceId < 1) {
      throw new ApiRequestError("资源编号无效。");
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "未找到指定资源。" }, { status: 404 });
    }
    const payload = (await request.json()) as {
      name?: unknown;
      resourceType?: unknown;
      org?: unknown;
      capacityHoursPerWeek?: unknown;
      active?: unknown;
    };
    if (
      payload.resourceType !== undefined &&
      (typeof payload.resourceType !== "string" ||
        !resourceTypes.has(payload.resourceType))
    ) {
      throw new ApiRequestError("资源类型无效。");
    }
    if (payload.active === false && existing.active) {
      const today = shanghaiDateIso();
      const [activeAllocation] = await db
        .select({ id: resourceAllocations.id })
        .from(resourceAllocations)
        .where(
          and(
            eq(resourceAllocations.resourceId, resourceId),
            ne(resourceAllocations.status, "cancelled"),
            gte(resourceAllocations.endDate, today),
          ),
        )
        .limit(1);
      if (activeAllocation) {
        throw new ApiRequestError(
          "该资源仍有当前或未来分配，请先取消相关分配后再停用。",
          409,
        );
      }
    }
    const changes = {
      ...(payload.name !== undefined
        ? { name: requiredString(payload.name, "资源名称") }
        : {}),
      ...(payload.resourceType !== undefined
        ? {
            resourceType: payload.resourceType as
              | "person"
              | "team"
              | "vendor"
              | "environment",
          }
        : {}),
      ...(payload.org !== undefined
        ? { org: requiredString(payload.org, "所属组织") }
        : {}),
      ...(payload.capacityHoursPerWeek !== undefined
        ? {
            capacityHoursPerWeek: safeNumber(
              payload.capacityHoursPerWeek,
              "每周容量",
              1,
              168,
            ),
          }
        : {}),
      ...(typeof payload.active === "boolean"
        ? { active: payload.active }
        : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    const [resource] = await db
      .update(resources)
      .set(changes)
      .where(eq(resources.id, resourceId))
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "resource.update",
      entityType: "resource",
      entityId: String(resourceId),
      detailJson: JSON.stringify(payload),
    });
    return Response.json({ resource });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "同一组织下已存在同名资源。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
