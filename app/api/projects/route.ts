import { getDb } from "@/db";
import {
  auditLogs,
  baselineVersions,
  milestoneTemplates,
  milestones,
  projects,
} from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredEmail,
  requiredIsoDate,
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

type MilestoneInput = {
  name?: string;
  sequence?: number;
  weight?: number;
  critical?: boolean;
  applicable?: boolean;
  plannedStart?: string;
  plannedFinish?: string;
};

type ProjectPayload = {
  code?: string;
  name?: string;
  ownerEmail?: string;
  ownerName?: string;
  org?: string;
  type?: string;
  riskLevel?: "low" | "medium" | "high";
  milestones?: MilestoneInput[];
};

function parseMilestones(payload: ProjectPayload) {
  const rows = payload.milestones ?? [];
  if (rows.length < 2) {
    throw new ApiRequestError("至少需要配置两个项目节点。");
  }
  const sequences = new Set<number>();
  const parsed = rows.map((row, index) => {
    const sequence = safeNumber(row.sequence ?? index + 1, "节点序号", 1, 100);
    if (!Number.isInteger(sequence) || sequences.has(sequence)) {
      throw new ApiRequestError("节点序号必须为不重复的整数。");
    }
    sequences.add(sequence);
    const plannedStart = requiredIsoDate(
      row.plannedStart,
      `第${index + 1}个节点计划开始日`,
    );
    const plannedFinish = requiredIsoDate(
      row.plannedFinish,
      `第${index + 1}个节点计划完成日`,
    );
    if (plannedFinish < plannedStart) {
      throw new ApiRequestError(`第${index + 1}个节点计划完成日不能早于开始日。`);
    }
    return {
      name: requiredString(row.name, `第${index + 1}个节点名称`),
      sequence,
      weight: safeNumber(row.weight, `第${index + 1}个节点权重`, 0.1, 100),
      critical: Boolean(row.critical),
      applicable: row.applicable !== false,
      plannedStart,
      plannedFinish,
    };
  });
  const totalWeight = parsed.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new ApiRequestError(`节点权重合计必须为100%，当前为${totalWeight}%。`);
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as ProjectPayload;
    const code = requiredString(payload.code, "项目编码").toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      return Response.json(
        { error: "项目编码只能包含2–20位大写字母、数字或连字符。" },
        { status: 400 },
      );
    }
    const parsedMilestones = parseMilestones(payload);
    if (
      payload.riskLevel &&
      !["low", "medium", "high"].includes(payload.riskLevel)
    ) {
      throw new ApiRequestError("初始风险等级无效。");
    }
    const db = getDb();

    const project = {
      id: code,
      code,
      name: requiredString(payload.name, "项目名称"),
      ownerEmail: requiredEmail(payload.ownerEmail, "项目经理邮箱"),
      ownerName: requiredString(payload.ownerName, "项目经理姓名"),
      org: requiredString(payload.org, "所属组织"),
      type: requiredString(payload.type, "项目类型"),
      riskLevel: payload.riskLevel ?? ("low" as const),
    };
    const templateRows = await db.select().from(milestoneTemplates);
    const templateByName = new Map(
      templateRows.map((row) => [row.name, row.id]),
    );
    const milestoneValues = parsedMilestones.map((row) => ({
      ...row,
      projectId: project.id,
      templateId: templateByName.get(row.name) ?? null,
      custom: !templateByName.has(row.name),
      forecastFinish: row.plannedFinish,
      status: row.applicable ? ("green" as const) : ("na" as const),
    }));
    const milestoneChunks = Array.from(
      { length: Math.ceil(milestoneValues.length / 4) },
      (_, index) => milestoneValues.slice(index * 4, index * 4 + 4),
    );
    await db.batch([
      db.insert(projects).values(project),
      ...milestoneChunks.map((rows) => db.insert(milestones).values(rows)),
      db.insert(baselineVersions).values({
        projectId: project.id,
        version: 1,
        kind: "original",
        milestoneJson: JSON.stringify(
          milestoneValues.map((row) => ({
            templateId: row.templateId,
            name: row.name,
            sequence: row.sequence,
            plannedStart: row.plannedStart,
            plannedFinish: row.plannedFinish,
            weight: row.weight,
            critical: row.critical,
            applicable: row.applicable,
          })),
        ),
        createdBy: identity.email,
      }),
      db.insert(auditLogs).values({
        actorEmail: identity.email,
        action: "project.create",
        entityType: "project",
        entityId: project.id,
        detailJson: JSON.stringify({
          name: project.name,
          ownerEmail: project.ownerEmail,
          milestoneCount: parsedMilestones.length,
        }),
      }),
    ]);

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint")) {
      return Response.json({ error: "项目编码已经存在。" }, { status: 409 });
    }
    return apiError(error);
  }
}
