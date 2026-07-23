import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type SnapshotProject = {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  org: string;
  type: string;
  score: number;
  status: "green" | "yellow" | "red";
  planProgress: number;
  actualProgress: number;
};

type SnapshotMilestone = {
  id: number;
  projectId: string;
  name: string;
  sequence: number;
  status: "green" | "yellow" | "red" | "na";
  completion: number;
  deviationDays: number;
  critical: boolean;
};

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const url = new URL(request.url);
    const org = url.searchParams.get("org")?.trim();
    const status = url.searchParams.get("status")?.trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? 10) || 10),
    );

    const [snapshot] = await getDb()
      .select()
      .from(snapshots)
      .where(eq(snapshots.status, "locked"))
      .orderBy(desc(snapshots.lockedAt), desc(snapshots.version))
      .limit(1);
    if (!snapshot) {
      return Response.json({
        snapshot: null,
        projects: [],
        total: 0,
        page,
        pageSize,
      });
    }
    const payload = JSON.parse(snapshot.payloadJson) as {
      projects?: SnapshotProject[];
      milestones?: SnapshotMilestone[];
    };
    const milestoneMap = new Map<string, SnapshotMilestone[]>();
    for (const milestone of payload.milestones ?? []) {
      const rows = milestoneMap.get(milestone.projectId) ?? [];
      rows.push(milestone);
      milestoneMap.set(milestone.projectId, rows);
    }
    const filtered = (payload.projects ?? []).filter(
      (project) =>
        (!org || project.org === org) &&
        (!status || project.status === status),
    );
    const rows = filtered
      .slice((page - 1) * pageSize, page * pageSize)
      .map((project) => ({
        id: project.id,
        code: project.code,
        name: project.name,
        owner: project.ownerName,
        org: project.org,
        type: project.type,
        score: project.score,
        status: project.status,
        planProgress: project.planProgress,
        actualProgress: project.actualProgress,
        milestones: (milestoneMap.get(project.id) ?? []).sort(
          (a, b) => a.sequence - b.sequence,
        ),
      }));
    return Response.json({
      snapshot: {
        id: snapshot.id,
        weekKey: snapshot.weekKey,
        version: snapshot.version,
        completeness: snapshot.completeness,
        lockedAt: snapshot.lockedAt,
      },
      projects: rows,
      total: filtered.length,
      page,
      pageSize,
    });
  } catch (error) {
    return apiError(error);
  }
}
