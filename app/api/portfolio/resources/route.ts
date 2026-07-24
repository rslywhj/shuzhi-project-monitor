import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  milestones,
  projects,
  resourceAllocations,
  resources,
} from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { shanghaiDateIso } from "@/lib/date-time";
import {
  buildResourceCapacity,
  resourceCapacityCsv,
  type ResourceCapacityFilters,
  type ResourceType,
} from "@/lib/resource-capacity";
import {
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

function filters(url: URL): ResourceCapacityFilters {
  const resourceType = url.searchParams.get("resourceType")?.trim();
  const status = url.searchParams.get("status")?.trim();
  return {
    resourceOrg: url.searchParams.get("resourceOrg")?.trim() || undefined,
    resourceType:
      resourceType && resourceTypes.has(resourceType)
        ? (resourceType as ResourceType)
        : undefined,
    projectOrg: url.searchParams.get("projectOrg")?.trim() || undefined,
    projectType: url.searchParams.get("projectType")?.trim() || undefined,
    status:
      status === "warning" || status === "conflict"
        ? status
        : undefined,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const db = getDb();
    const [resourceRows, allocationRows, projectRows, milestoneRows] =
      await Promise.all([
        db
          .select()
          .from(resources)
          .orderBy(asc(resources.org), asc(resources.name)),
        db
          .select()
          .from(resourceAllocations)
          .orderBy(
            asc(resourceAllocations.startDate),
            asc(resourceAllocations.resourceId),
          ),
        db.select().from(projects).orderBy(asc(projects.code)),
        db
          .select()
          .from(milestones)
          .orderBy(asc(milestones.projectId), asc(milestones.sequence)),
      ]);
    const url = new URL(request.url);
    const requestedWeeks = Number(url.searchParams.get("weeks") ?? 12);
    const weeks = Number.isFinite(requestedWeeks)
      ? Math.min(26, Math.max(4, requestedWeeks))
      : 12;
    const asOfDate = shanghaiDateIso();
    const analysis = buildResourceCapacity({
      resources: resourceRows,
      allocations: allocationRows,
      projects: projectRows,
      milestones: milestoneRows,
      asOfDate,
      weeks,
      filters: filters(url),
    });
    if (url.searchParams.get("format") === "csv") {
      return new Response(
        `\uFEFF${resourceCapacityCsv(analysis.resources)}`,
        {
          headers: {
            "cache-control": "no-store",
            "content-disposition": `attachment; filename="resource-capacity-${asOfDate}.csv"`,
            "content-type": "text/csv; charset=utf-8",
          },
        },
      );
    }
    const milestonesByProject = new Map<
      string,
      Array<{
        id: number;
        name: string;
        sequence: number;
        applicable: boolean;
      }>
    >();
    for (const milestone of milestoneRows) {
      const rows = milestonesByProject.get(milestone.projectId) ?? [];
      rows.push({
        id: milestone.id,
        name: milestone.name,
        sequence: milestone.sequence,
        applicable: milestone.applicable,
      });
      milestonesByProject.set(milestone.projectId, rows);
    }
    return Response.json({
      ...analysis,
      resourceCatalog: resourceRows,
      projectCatalog: projectRows
        .filter((project) => project.lifecycleStatus === "active")
        .map((project) => ({
          id: project.id,
          code: project.code,
          name: project.name,
          ownerEmail: project.ownerEmail,
          ownerName: project.ownerName,
          org: project.org,
          type: project.type,
          milestones: (
            milestonesByProject.get(project.id) ?? []
          ).filter((milestone) => milestone.applicable),
        })),
      filters: filters(url),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
