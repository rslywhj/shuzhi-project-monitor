import { getDb } from "@/db";
import { milestoneTemplates } from "@/db/schema";
import {
  ApiRequestError,
  apiError,
  requiredIsoDate,
  requiredString,
  safeNumber,
} from "@/lib/api-utils";
import { requireProjectOwnerAccount } from "@/lib/project-owner";
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
    const ownerAccount = await requireProjectOwnerAccount(
      db,
      payload.ownerEmail,
    );

    const project = {
      id: code,
      code,
      name: requiredString(payload.name, "项目名称"),
      ownerEmail: ownerAccount.email,
      ownerName: ownerAccount.displayName,
      org: requiredString(payload.org, "所属组织"),
      type: requiredString(payload.type, "项目类型"),
      riskLevel: payload.riskLevel ?? ("low" as const),
    };
    const templateRows = await db.select().from(milestoneTemplates);
    const activeTemplateRows = templateRows
      .filter((row) => row.active)
      .sort((left, right) => left.sequence - right.sequence);
    const milestoneByName = new Map(
      parsedMilestones.map((row) => [row.name, row]),
    );
    if (
      milestoneByName.size !== parsedMilestones.length ||
      parsedMilestones.length !== activeTemplateRows.length ||
      activeTemplateRows.some((template) => !milestoneByName.has(template.name))
    ) {
      throw new ApiRequestError(
        "新建项目必须完整套用当前启用的标准节点模板，不能遗漏、重复或追加自定义节点。",
      );
    }
    const milestoneValues = activeTemplateRows.map((template) => {
      const row = milestoneByName.get(template.name)!;
      if (
        row.sequence !== template.sequence ||
        Math.abs(row.weight - template.defaultWeight) > 0.01 ||
        row.critical !== template.critical ||
        !row.applicable
      ) {
        throw new ApiRequestError(
          `${template.name}必须沿用当前模板的序号、权重、关键标识和适用状态；创建后可在节点治理中调整。`,
        );
      }
      return {
        ...row,
        projectId: project.id,
        templateId: template.id,
        custom: false,
        forecastFinish: row.plannedFinish,
        status: "green" as const,
      };
    });
    const baselineJson = JSON.stringify(
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
    );
    const client = db.$client;
    await client.batch([
      client
        .prepare(
          `INSERT INTO projects
            (id, code, name, owner_email, owner_name, org, type, risk_level)
           SELECT ?, ?, ?, email, display_name, ?, ?, ?
           FROM users
           WHERE email = ? AND active = 1 AND role = 'manager'`,
        )
        .bind(
          project.id,
          project.code,
          project.name,
          project.org,
          project.type,
          project.riskLevel,
          project.ownerEmail,
        ),
      client
        .prepare(
          `INSERT INTO milestones
            (project_id, template_id, name, sequence, weight, critical, custom,
             applicable, planned_start, planned_finish, forecast_finish, status)
           SELECT
            json_extract(value, '$.projectId'),
            json_extract(value, '$.templateId'),
            json_extract(value, '$.name'),
            json_extract(value, '$.sequence'),
            json_extract(value, '$.weight'),
            json_extract(value, '$.critical'),
            json_extract(value, '$.custom'),
            json_extract(value, '$.applicable'),
            json_extract(value, '$.plannedStart'),
            json_extract(value, '$.plannedFinish'),
            json_extract(value, '$.forecastFinish'),
            json_extract(value, '$.status')
           FROM json_each(?)`,
        )
        .bind(JSON.stringify(milestoneValues)),
      client
        .prepare(
          `INSERT INTO baseline_versions
            (project_id, version, kind, milestone_json, created_by)
           VALUES (?, 1, 'original', ?, ?)`,
        )
        .bind(project.id, baselineJson, identity.email),
      client
        .prepare(
          `INSERT INTO audit_logs
            (actor_email, action, entity_type, entity_id, detail_json)
           VALUES (?, 'project.create', 'project', ?, ?)`,
        )
        .bind(
          identity.email,
          project.id,
          JSON.stringify({
            name: project.name,
            ownerEmail: project.ownerEmail,
            milestoneCount: parsedMilestones.length,
          }),
        ),
    ]);

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint")) {
      return Response.json({ error: "项目编码已经存在。" }, { status: 409 });
    }
    if (message.includes("FOREIGN KEY constraint")) {
      return Response.json(
        {
          error: "项目经理账号状态已发生变化，请刷新账号目录后重新选择。",
        },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
