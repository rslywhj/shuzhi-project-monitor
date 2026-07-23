import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  milestoneTemplates,
  milestones,
  projects,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type PromoteInput = {
  candidateName?: string;
  code?: string;
  sequence?: number;
  critical?: boolean;
  description?: string;
  sourceMilestoneIds?: number[];
  syncExistingProjects?: boolean;
};

function normalizeMilestoneName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function chunks<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

function availableSequence(preferred: number, used: Set<number>) {
  if (!used.has(preferred)) return preferred;
  for (let sequence = 1; sequence <= 99; sequence += 1) {
    if (!used.has(sequence)) return sequence;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as PromoteInput;
    const candidateName = requiredString(payload.candidateName, "候选节点名称");
    const normalizedCandidateName = normalizeMilestoneName(candidateName);
    const code = requiredString(payload.code, "标准节点编码").toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]{1,19}$/.test(code)) {
      throw new ApiRequestError(
        "节点编码必须以字母开头，并包含2–20位字母、数字、下划线或连字符。",
      );
    }
    const sequence = safeNumber(payload.sequence, "标准节点序号", 1, 99);
    if (!Number.isInteger(sequence)) {
      throw new ApiRequestError("标准节点序号必须是整数。");
    }
    if (
      !Array.isArray(payload.sourceMilestoneIds) ||
      payload.sourceMilestoneIds.length === 0
    ) {
      throw new ApiRequestError("至少需要选择一个来源自定义节点。");
    }
    const sourceMilestoneIds = payload.sourceMilestoneIds.map((value) =>
      safeNumber(value, "来源节点编号", 1, 1_000_000),
    );
    if (
      sourceMilestoneIds.some((value) => !Number.isInteger(value)) ||
      new Set(sourceMilestoneIds).size !== sourceMilestoneIds.length
    ) {
      throw new ApiRequestError("来源节点编号必须是互不重复的整数。");
    }

    const db = getDb();
    const [templateRows, unresolvedRows, projectRows, allMilestoneRows] =
      await Promise.all([
        db
          .select()
          .from(milestoneTemplates)
          .orderBy(asc(milestoneTemplates.sequence)),
        db
          .select()
          .from(milestones)
          .where(
            and(
              eq(milestones.custom, true),
              isNull(milestones.templateId),
            ),
          ),
        db.select().from(projects).orderBy(asc(projects.code)),
        db
          .select()
          .from(milestones)
          .orderBy(asc(milestones.projectId), asc(milestones.sequence)),
      ]);

    const candidateRows = unresolvedRows.filter(
      (row) => normalizeMilestoneName(row.name) === normalizedCandidateName,
    );
    if (!candidateRows.length) {
      return Response.json(
        { error: "该候选节点已被处理或不再可提升，请刷新候选池。" },
        { status: 409 },
      );
    }
    const candidateIds = new Set(candidateRows.map((row) => row.id));
    if (
      sourceMilestoneIds.length !== candidateRows.length ||
      sourceMilestoneIds.some((id) => !candidateIds.has(id))
    ) {
      return Response.json(
        { error: "候选来源节点已发生变化，请刷新候选池后重新提交。" },
        { status: 409 },
      );
    }

    const existingByName = templateRows.find(
      (row) => normalizeMilestoneName(row.name) === normalizedCandidateName,
    );
    if (existingByName) {
      return Response.json(
        {
          error: `已存在同名标准节点 ${existingByName.code}，请先完成重复节点治理。`,
        },
        { status: 409 },
      );
    }
    if (templateRows.some((row) => row.code.toUpperCase() === code)) {
      return Response.json(
        { error: "标准节点编码已经存在。" },
        { status: 409 },
      );
    }
    if (templateRows.some((row) => row.sequence === sequence)) {
      return Response.json(
        { error: "标准节点序号已经存在。" },
        { status: 409 },
      );
    }

    const sourceProjectIds = candidateRows.map((row) => row.projectId);
    if (new Set(sourceProjectIds).size !== sourceProjectIds.length) {
      throw new ApiRequestError(
        "同一项目存在多个同名候选节点，请先在项目节点治理中完成去重。",
        409,
      );
    }

    const projectMilestoneMap = new Map<string, typeof allMilestoneRows>();
    for (const milestone of allMilestoneRows) {
      const rows = projectMilestoneMap.get(milestone.projectId) ?? [];
      rows.push(milestone);
      projectMilestoneMap.set(milestone.projectId, rows);
    }
    const sourceProjectIdSet = new Set(sourceProjectIds);
    const sourcePlannedStart = candidateRows
      .map((row) => row.plannedStart)
      .sort()[0];
    const sourcePlannedFinish = candidateRows
      .map((row) => row.plannedFinish)
      .sort()
      .at(-1)!;
    const syncExistingProjects = payload.syncExistingProjects !== false;
    const synchronizedRows = syncExistingProjects
      ? projectRows
          .filter((project) => !sourceProjectIdSet.has(project.id))
          .map((project) => {
            const projectMilestones = projectMilestoneMap.get(project.id) ?? [];
            const usedSequences = new Set(
              projectMilestones.map((milestone) => milestone.sequence),
            );
            const projectSequence = availableSequence(sequence, usedSequences);
            if (projectSequence === null) {
              throw new ApiRequestError(
                `${project.name}已使用全部1–99节点序号，无法同步标准节点。`,
              );
            }
            const plannedStarts = projectMilestones
              .map((milestone) => milestone.plannedStart)
              .sort();
            const plannedFinishes = projectMilestones
              .map((milestone) => milestone.plannedFinish)
              .sort();
            return {
              projectId: project.id,
              name: candidateName,
              sequence: projectSequence,
              weight: 0,
              critical: Boolean(payload.critical),
              custom: false,
              applicable: false,
              plannedStart: plannedStarts[0] ?? sourcePlannedStart,
              plannedFinish:
                plannedFinishes.at(-1) ?? sourcePlannedFinish,
              forecastFinish: null,
              actualFinish: null,
              completion: 0,
              status: "na" as const,
              deviationDays: 0,
              reason: "由PMO提升为标准节点后同步，默认标记为不适用。",
            };
          })
      : [];

    const templateIdSql = sql<number>`(
      SELECT ${milestoneTemplates.id}
      FROM ${milestoneTemplates}
      WHERE ${milestoneTemplates.code} = ${code}
      LIMIT 1
    )`;
    const sourceUpdateStatements = chunks(sourceMilestoneIds, 20).map((ids) =>
      db
        .update(milestones)
        .set({
          templateId: templateIdSql,
          custom: false,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            inArray(milestones.id, ids),
            eq(milestones.custom, true),
            isNull(milestones.templateId),
          ),
        ),
    );
    const synchronizedInsertStatements = chunks(synchronizedRows, 4).map(
      (rows) =>
        db.insert(milestones).values(
          rows.map((row) => ({
            ...row,
            templateId: templateIdSql,
          })),
        ),
    );

    await db.batch([
      db.insert(milestoneTemplates).values({
        code,
        name: candidateName,
        sequence,
        defaultWeight: 0,
        critical: Boolean(payload.critical),
        active: false,
        description: payload.description?.trim() ?? "",
        createdBy: identity.email,
      }),
      ...sourceUpdateStatements,
      ...synchronizedInsertStatements,
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "milestone_template.promote",
        entityType: "milestone_template",
        entityId: code,
        detailJson: JSON.stringify({
          candidateName,
          sourceMilestoneIds,
          sourceProjectIds,
          synchronizedProjectCount: synchronizedRows.length,
          syncExistingProjects,
          active: false,
          defaultWeight: 0,
        }),
      }),
    ]);

    const [milestoneTemplate] = await db
      .select()
      .from(milestoneTemplates)
      .where(eq(milestoneTemplates.code, code))
      .limit(1);
    return Response.json(
      {
        milestoneTemplate,
        promotedMilestones: candidateRows.length,
        sourceProjects: sourceProjectIdSet.size,
        synchronizedProjects: synchronizedRows.length,
        synchronizedMilestones: synchronizedRows.length,
        note: "标准节点草稿默认未启用且权重为0；发布前不会进入全局矩阵，也不会改变现有项目进度权重。",
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "标准节点编码、序号或项目节点序号已被占用，请刷新后重试。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
