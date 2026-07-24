import { getDb } from "@/db";
import { resourceAllocations } from "@/db/schema";
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

export const dynamic = "force-dynamic";

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
    const { resource, project } = await allocationRelations(db, {
      ...normalized,
      status,
    });
    if (!canWriteProject(identity, project.ownerEmail)) return forbidden();
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
    return Response.json({
      resource: {
        id: resource.id,
        name: resource.name,
        capacityHoursPerWeek: resource.capacityHoursPerWeek,
      },
      status,
      conflicts,
      overCapacity: conflicts.length > 0,
      requiresOverride:
        status === "confirmed" && conflicts.length > 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
