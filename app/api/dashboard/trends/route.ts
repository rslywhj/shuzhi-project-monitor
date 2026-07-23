import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { getRequestIdentity, unauthorized } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type SnapshotProject = {
  status: "green" | "yellow" | "red";
  planProgress: number;
  actualProgress: number;
};

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    const rows = await getDb()
      .select()
      .from(snapshots)
      .where(eq(snapshots.status, "locked"))
      .orderBy(desc(snapshots.lockedAt), desc(snapshots.version))
      .limit(100);
    const latestByWeek = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByWeek.has(row.weekKey)) latestByWeek.set(row.weekKey, row);
    }
    const points = [...latestByWeek.values()]
      .slice(0, 12)
      .reverse()
      .map((snapshot) => {
        const payload = JSON.parse(snapshot.payloadJson) as {
          projects?: SnapshotProject[];
        };
        const projects = payload.projects ?? [];
        const total = projects.length || 1;
        return {
          weekKey: snapshot.weekKey,
          version: snapshot.version,
          green: projects.filter((project) => project.status === "green").length,
          yellow: projects.filter((project) => project.status === "yellow").length,
          red: projects.filter((project) => project.status === "red").length,
          planProgress: Number(
            (
              projects.reduce(
                (sum, project) => sum + project.planProgress,
                0,
              ) / total
            ).toFixed(1),
          ),
          actualProgress: Number(
            (
              projects.reduce(
                (sum, project) => sum + project.actualProgress,
                0,
              ) / total
            ).toFixed(1),
          ),
          completeness: snapshot.completeness,
        };
      });
    return Response.json({ trends: points });
  } catch (error) {
    return apiError(error);
  }
}
