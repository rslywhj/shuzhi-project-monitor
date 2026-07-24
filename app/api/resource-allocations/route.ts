import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  resourceAllocations,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
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

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim();
    const resourceId = Number(url.searchParams.get("resourceId"));
    const db = getDb();
    let rows = await db
      .select()
      .from(resourceAllocations)
      .orderBy(desc(resourceAllocations.updatedAt));
    if (projectId) {
      rows = rows.filter((allocation) => allocation.projectId === projectId);
    }
    if (Number.isInteger(resourceId) && resourceId > 0) {
      rows = rows.filter(
        (allocation) => allocation.resourceId === resourceId,
      );
    }
    return Response.json({ allocations: rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const payload = (await request.json()) as AllocationInput;
    const normalized = normalizedAllocationInput(payload);
    const status = canManagePortfolio(identity)
      ? normalized.status === "cancelled"
        ? "planned"
        : normalized.status
      : "planned";
    const db = getDb();
    const { project } = await allocationRelations(db, {
      ...normalized,
      status,
    });
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
    if (projectLifecycleLocked(project)) {
      return lifecycleLockedResponse(project);
    }
    const now = new Date().toISOString();
    const proposed: typeof resourceAllocations.$inferSelect = {
      id: 0,
      ...normalized,
      status,
      createdBy: identity.email,
      createdAt: now,
      updatedAt: now,
    };
    const conflicts = await conflictsForAllocation(db, proposed);
    if (
      status === "confirmed" &&
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
      .insert(resourceAllocations)
      .values({
        ...normalized,
        status,
        overrideReason:
          status === "confirmed" ? normalized.overrideReason : "",
        createdBy: identity.email,
        updatedAt: now,
      })
      .returning();
    await db.insert(auditLogs).values({
      actorEmail: identity.email,
      action: "resource_allocation.create",
      entityType: "resource_allocation",
      entityId: String(allocation.id),
      detailJson: JSON.stringify({
        resourceId: allocation.resourceId,
        projectId: allocation.projectId,
        milestoneId: allocation.milestoneId,
        hoursPerWeek: allocation.hoursPerWeek,
        status: allocation.status,
        conflictCount: conflicts.length,
        overrideReason: allocation.overrideReason,
      }),
    });
    return Response.json({ allocation, conflicts }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
