import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { milestoneTemplates, milestones, projects } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function normalizeMilestoneName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const db = getDb();
    const [sourceRows, templateRows] = await Promise.all([
      db
        .select({
          milestoneId: milestones.id,
          projectId: milestones.projectId,
          projectCode: projects.code,
          projectName: projects.name,
          ownerName: projects.ownerName,
          name: milestones.name,
          sequence: milestones.sequence,
          weight: milestones.weight,
          critical: milestones.critical,
          applicable: milestones.applicable,
          plannedStart: milestones.plannedStart,
          plannedFinish: milestones.plannedFinish,
        })
        .from(milestones)
        .innerJoin(projects, eq(milestones.projectId, projects.id))
        .where(
          and(
            eq(milestones.custom, true),
            isNull(milestones.templateId),
          ),
        )
        .orderBy(asc(milestones.name), asc(projects.code), asc(milestones.id)),
      db
        .select()
        .from(milestoneTemplates)
        .orderBy(asc(milestoneTemplates.sequence)),
    ]);

    const templateByName = new Map(
      templateRows.map((template) => [
        normalizeMilestoneName(template.name),
        template,
      ]),
    );
    const candidateMap = new Map<
      string,
      {
        key: string;
        name: string;
        sources: typeof sourceRows;
      }
    >();
    for (const source of sourceRows) {
      const key = normalizeMilestoneName(source.name);
      const candidate = candidateMap.get(key) ?? {
        key,
        name: source.name.trim(),
        sources: [],
      };
      candidate.sources.push(source);
      candidateMap.set(key, candidate);
    }

    const candidates = [...candidateMap.values()]
      .map((candidate) => {
        const projectIds = new Set(
          candidate.sources.map((source) => source.projectId),
        );
        const criticalCount = candidate.sources.filter(
          (source) => source.critical,
        ).length;
        const existingTemplate = templateByName.get(candidate.key);
        return {
          key: candidate.key,
          name: candidate.name,
          sourceProjectCount: projectIds.size,
          sourceMilestoneCount: candidate.sources.length,
          criticalCount,
          criticalRatio: candidate.sources.length
            ? Number(
                ((criticalCount / candidate.sources.length) * 100).toFixed(1),
              )
            : 0,
          existingTemplate: existingTemplate
            ? {
                id: existingTemplate.id,
                code: existingTemplate.code,
                name: existingTemplate.name,
                active: existingTemplate.active,
              }
            : null,
          sources: candidate.sources,
        };
      })
      .sort(
        (left, right) =>
          right.sourceProjectCount - left.sourceProjectCount ||
          left.name.localeCompare(right.name, "zh-CN"),
      );

    return Response.json({
      candidates,
      summary: {
        candidateCount: candidates.length,
        sourceProjectCount: new Set(
          sourceRows.map((source) => source.projectId),
        ).size,
        sourceMilestoneCount: sourceRows.length,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
