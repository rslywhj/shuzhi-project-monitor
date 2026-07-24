import { asc, eq, ne } from "drizzle-orm";
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

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const db = getDb();
    const [resourceRows, allocationRows] = await Promise.all([
      db.select().from(resources).orderBy(asc(resources.org), asc(resources.name)),
      db
        .select({
          resourceId: resourceAllocations.resourceId,
          status: resourceAllocations.status,
        })
        .from(resourceAllocations)
        .where(ne(resourceAllocations.status, "cancelled")),
    ]);
    const allocationCounts = new Map<number, number>();
    for (const allocation of allocationRows) {
      allocationCounts.set(
        allocation.resourceId,
        (allocationCounts.get(allocation.resourceId) ?? 0) + 1,
      );
    }
    return Response.json({
      resources: resourceRows.map((resource) => ({
        ...resource,
        activeAllocationCount: allocationCounts.get(resource.id) ?? 0,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    const payload = (await request.json()) as {
      name?: unknown;
      resourceType?: unknown;
      org?: unknown;
      capacityHoursPerWeek?: unknown;
    };
    const resourceType =
      typeof payload.resourceType === "string" &&
      resourceTypes.has(payload.resourceType)
        ? (payload.resourceType as
            | "person"
            | "team"
            | "vendor"
            | "environment")
        : null;
    if (!resourceType) {
      throw new ApiRequestError("请选择有效的资源类型。");
    }
    const name = requiredString(payload.name, "资源名称");
    const org = requiredString(payload.org, "所属组织");
    if (name.length > 80 || org.length > 80) {
      throw new ApiRequestError("资源名称和所属组织不能超过80个字符。");
    }
    const capacityHoursPerWeek = safeNumber(
      payload.capacityHoursPerWeek ?? 40,
      "每周容量",
      1,
      168,
    );
    const db = getDb();
    const [existing] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.name, name))
      .limit(1);
    if (existing) {
      const sameNameRows = await db
        .select({ id: resources.id, org: resources.org })
        .from(resources)
        .where(eq(resources.name, name));
      if (sameNameRows.some((row) => row.org === org)) {
        throw new ApiRequestError("同一组织下已存在同名资源。", 409);
      }
    }
    const now = new Date().toISOString();
    const [resource] = await db
      .insert(resources)
      .values({
        name,
        resourceType,
        org,
        capacityHoursPerWeek,
        active: true,
        createdBy: identity.email,
        updatedAt: now,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "resource.create",
      entityType: "resource",
      entityId: String(resource.id),
      detailJson: JSON.stringify({
        name,
        resourceType,
        org,
        capacityHoursPerWeek,
      }),
    });
    return Response.json({ resource }, { status: 201 });
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
