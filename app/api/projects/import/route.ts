import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { milestoneTemplates, projects, users } from "@/db/schema";
import { apiError } from "@/lib/api-utils";
import {
  projectOwnerAccountError,
  type ProjectOwnerAccount,
} from "@/lib/project-owner";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ImportMode = "preview" | "commit";

type ProjectImportInput = {
  rowNumber?: number;
  code?: unknown;
  name?: unknown;
  ownerName?: unknown;
  ownerEmail?: unknown;
  org?: unknown;
  type?: unknown;
  riskLevel?: unknown;
};

type MilestoneImportInput = {
  rowNumber?: number;
  projectCode?: unknown;
  templateCode?: unknown;
  name?: unknown;
  sequence?: unknown;
  weight?: unknown;
  critical?: unknown;
  applicable?: unknown;
  plannedStart?: unknown;
  plannedFinish?: unknown;
};

type ImportPayload = {
  mode?: ImportMode;
  projects?: ProjectImportInput[];
  milestones?: MilestoneImportInput[];
};

type ImportIssue = {
  sheet: "项目清单" | "节点计划";
  row: number;
  field: string;
  message: string;
};

type TemplateRow = typeof milestoneTemplates.$inferSelect;

type NormalizedMilestone = {
  projectId: string;
  templateId: number | null;
  name: string;
  sequence: number;
  weight: number;
  critical: boolean;
  custom: boolean;
  applicable: boolean;
  plannedStart: string;
  plannedFinish: string;
  forecastFinish: string | null;
  status: "green" | "na";
};

type NormalizedProject = {
  id: string;
  code: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  org: string;
  type: string;
  riskLevel: "low" | "medium" | "high";
  milestones: NormalizedMilestone[];
};

const MAX_PROJECTS = 100;
const MAX_MILESTONES = 2_000;

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : typeof value === "number" || typeof value === "boolean"
      ? String(value).trim()
      : "";
}

function normalizedName(value: unknown) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  const normalized = text(value).replace(/%$/, "");
  if (!normalized) return Number.NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = normalizedName(value);
  if (!normalized) return fallback;
  if (["是", "适用", "关键", "true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (
    ["否", "不适用", "普通", "false", "no", "n", "0"].includes(normalized)
  ) {
    return false;
  }
  return null;
}

function riskValue(value: unknown) {
  const normalized = normalizedName(value);
  if (["低", "低风险", "low"].includes(normalized)) return "low" as const;
  if (["中", "中风险", "medium"].includes(normalized)) {
    return "medium" as const;
  }
  if (["高", "高风险", "high"].includes(normalized)) return "high" as const;
  return null;
}

function isoDate(value: unknown) {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return null;
  const parsed = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === result
    ? result
    : null;
}

function addIssue(
  issues: ImportIssue[],
  sheet: ImportIssue["sheet"],
  row: number,
  field: string,
  message: string,
) {
  issues.push({ sheet, row, field, message });
}

function validateImport(
  payload: ImportPayload,
  templateRows: TemplateRow[],
  existingCodes: Set<string>,
  ownerAccounts: Map<string, ProjectOwnerAccount>,
) {
  const issues: ImportIssue[] = [];
  const projectInputs = Array.isArray(payload.projects) ? payload.projects : [];
  const milestoneInputs = Array.isArray(payload.milestones)
    ? payload.milestones
    : [];

  if (!projectInputs.length) {
    addIssue(issues, "项目清单", 1, "项目清单", "至少需要填写一个项目。");
  }
  if (projectInputs.length > MAX_PROJECTS) {
    addIssue(
      issues,
      "项目清单",
      1,
      "项目清单",
      `单次最多导入${MAX_PROJECTS}个项目。`,
    );
  }
  if (!milestoneInputs.length) {
    addIssue(issues, "节点计划", 1, "节点计划", "至少需要填写项目节点。");
  }
  if (milestoneInputs.length > MAX_MILESTONES) {
    addIssue(
      issues,
      "节点计划",
      1,
      "节点计划",
      `单次最多导入${MAX_MILESTONES}个节点。`,
    );
  }

  const activeTemplates = templateRows.filter((template) => template.active);
  const templateByCode = new Map(
    templateRows.map((template) => [template.code.toUpperCase(), template]),
  );
  const templateByName = new Map(
    templateRows.map((template) => [normalizedName(template.name), template]),
  );
  const projectMap = new Map<string, Omit<NormalizedProject, "milestones">>();
  const seenProjectCodes = new Set<string>();

  projectInputs.slice(0, MAX_PROJECTS).forEach((input, index) => {
    const row = Number(input.rowNumber) || index + 2;
    const code = text(input.code).toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
      addIssue(
        issues,
        "项目清单",
        row,
        "项目编码",
        "必须为2–20位大写字母、数字或连字符。",
      );
    } else if (seenProjectCodes.has(code)) {
      addIssue(issues, "项目清单", row, "项目编码", "文件内项目编码重复。");
    } else if (existingCodes.has(code)) {
      addIssue(
        issues,
        "项目清单",
        row,
        "项目编码",
        "系统中已存在该项目；批量导入仅创建新项目。",
      );
    }
    seenProjectCodes.add(code);

    const name = text(input.name);
    const ownerName = text(input.ownerName);
    const ownerEmail = text(input.ownerEmail).toLowerCase();
    const org = text(input.org);
    const type = text(input.type);
    const riskLevel = riskValue(input.riskLevel);
    for (const [field, value] of [
      ["项目名称", name],
      ["项目经理姓名", ownerName],
      ["所属组织", org],
      ["项目类型", type],
    ]) {
      if (!value) addIssue(issues, "项目清单", row, field, "不能为空。");
    }
    if (
      !ownerEmail ||
      ownerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)
    ) {
      addIssue(
        issues,
        "项目清单",
        row,
        "项目经理邮箱",
        "邮箱格式不正确。",
      );
    } else {
      const ownerAccount = ownerAccounts.get(ownerEmail);
      const accountError = projectOwnerAccountError(ownerAccount);
      if (accountError) {
        addIssue(
          issues,
          "项目清单",
          row,
          "项目经理邮箱",
          accountError,
        );
      } else if (ownerName !== ownerAccount!.displayName) {
        addIssue(
          issues,
          "项目清单",
          row,
          "项目经理姓名",
          `姓名与账号目录不一致，应填写“${ownerAccount!.displayName}”。`,
        );
      }
    }
    if (!riskLevel) {
      addIssue(
        issues,
        "项目清单",
        row,
        "初始风险",
        "请填写低、中、高或 low、medium、high。",
      );
    }
    if (
      code &&
      name &&
      ownerName &&
      ownerEmail &&
      org &&
      type &&
      riskLevel &&
      !projectOwnerAccountError(ownerAccounts.get(ownerEmail)) &&
      ownerName === ownerAccounts.get(ownerEmail)?.displayName &&
      !projectMap.has(code)
    ) {
      projectMap.set(code, {
        id: code,
        code,
        name,
        ownerEmail,
        ownerName,
        org,
        type,
        riskLevel,
      });
    }
  });

  const milestoneMap = new Map<string, NormalizedMilestone[]>();
  const sourceRowsByProject = new Map<string, number[]>();
  const firstSourceRowByProject = new Map<string, number>();
  milestoneInputs.slice(0, MAX_MILESTONES).forEach((input, index) => {
    const row = Number(input.rowNumber) || index + 2;
    const projectCode = text(input.projectCode).toUpperCase();
    if (projectCode && !firstSourceRowByProject.has(projectCode)) {
      firstSourceRowByProject.set(projectCode, row);
    }
    if (!projectMap.has(projectCode)) {
      addIssue(
        issues,
        "节点计划",
        row,
        "项目编码",
        "未在项目清单中找到对应项目。",
      );
    }
    const templateCode = text(input.templateCode).toUpperCase();
    const inputName = text(input.name);
    let template = templateCode
      ? templateByCode.get(templateCode)
      : templateByName.get(normalizedName(inputName));
    if (templateCode && !template) {
      addIssue(
        issues,
        "节点计划",
        row,
        "节点编码",
        "未找到对应的标准节点编码。",
      );
    }
    if (template && !template.active) {
      addIssue(
        issues,
        "节点计划",
        row,
        "节点编码",
        "该标准节点尚未启用，不能用于新项目导入。",
      );
      template = undefined;
    }
    const name = template?.name ?? inputName;
    if (!name) {
      addIssue(issues, "节点计划", row, "节点名称", "不能为空。");
    }
    const sequence = numberValue(input.sequence);
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) {
      addIssue(
        issues,
        "节点计划",
        row,
        "节点序号",
        "必须为1–99之间的整数。",
      );
    }
    const weight = numberValue(input.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      addIssue(
        issues,
        "节点计划",
        row,
        "权重",
        "必须为0–100之间的数字。",
      );
    }
    const critical = booleanValue(input.critical, template?.critical ?? false);
    if (critical === null) {
      addIssue(
        issues,
        "节点计划",
        row,
        "关键节点",
        "请填写是/否、关键/普通或 true/false。",
      );
    }
    const applicable = booleanValue(input.applicable, true);
    if (applicable === null) {
      addIssue(
        issues,
        "节点计划",
        row,
        "是否适用",
        "请填写是/否、适用/不适用或 true/false。",
      );
    }
    const plannedStart = isoDate(input.plannedStart);
    const plannedFinish = isoDate(input.plannedFinish);
    if (!plannedStart) {
      addIssue(
        issues,
        "节点计划",
        row,
        "计划开始日",
        "请使用YYYY-MM-DD格式。",
      );
    }
    if (!plannedFinish) {
      addIssue(
        issues,
        "节点计划",
        row,
        "计划完成日",
        "请使用YYYY-MM-DD格式。",
      );
    } else if (plannedStart && plannedFinish < plannedStart) {
      addIssue(
        issues,
        "节点计划",
        row,
        "计划完成日",
        "不能早于计划开始日。",
      );
    }

    const projectMilestones = milestoneMap.get(projectCode) ?? [];
    if (
      projectMap.has(projectCode) &&
      name &&
      Number.isInteger(sequence) &&
      sequence >= 1 &&
      sequence <= 99 &&
      Number.isFinite(weight) &&
      weight >= 0 &&
      weight <= 100 &&
      critical !== null &&
      applicable !== null &&
      plannedStart &&
      plannedFinish &&
      plannedFinish >= plannedStart
    ) {
      const sourceRows = sourceRowsByProject.get(projectCode) ?? [];
      sourceRows.push(row);
      sourceRowsByProject.set(projectCode, sourceRows);
      projectMilestones.push({
        projectId: projectCode,
        templateId: template?.id ?? null,
        name,
        sequence,
        weight,
        critical,
        custom: !template,
        applicable,
        plannedStart,
        plannedFinish,
        forecastFinish: applicable ? plannedFinish : null,
        status: applicable ? "green" : "na",
      });
      milestoneMap.set(projectCode, projectMilestones);
    }
  });

  for (const [projectCode, project] of projectMap) {
    const rows = milestoneMap.get(projectCode) ?? [];
    const sourceRows = sourceRowsByProject.get(projectCode) ?? [];
    const fallbackRow =
      firstSourceRowByProject.get(projectCode) ?? sourceRows[0] ?? 2;
    if (rows.length < 2) {
      addIssue(
        issues,
        "节点计划",
        fallbackRow,
        "项目节点",
        `${project.name}至少需要两个有效节点。`,
      );
      continue;
    }
    const sequenceSet = new Set<number>();
    const templateIdSet = new Set<number>();
    rows.forEach((row, index) => {
      const sourceRow = sourceRows[index] ?? fallbackRow;
      if (sequenceSet.has(row.sequence)) {
        addIssue(
          issues,
          "节点计划",
          sourceRow,
          "节点序号",
          `${project.name}存在重复节点序号${row.sequence}。`,
        );
      }
      sequenceSet.add(row.sequence);
      if (row.templateId) {
        if (templateIdSet.has(row.templateId)) {
          addIssue(
            issues,
            "节点计划",
            sourceRow,
            "节点编码",
            `${project.name}存在重复标准节点。`,
          );
        }
        templateIdSet.add(row.templateId);
      }
    });
    for (const template of activeTemplates) {
      if (!templateIdSet.has(template.id)) {
        addIssue(
          issues,
          "节点计划",
          fallbackRow,
          "标准节点",
          `${project.name}缺少${template.code} ${template.name}。`,
        );
      }
    }
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      addIssue(
        issues,
        "节点计划",
        fallbackRow,
        "权重",
        `${project.name}节点权重合计必须为100%，当前为${totalWeight.toFixed(1)}%。`,
      );
    }
    if (rows.filter((row) => row.applicable).length < 2) {
      addIssue(
        issues,
        "节点计划",
        fallbackRow,
        "是否适用",
        `${project.name}至少需要两个适用节点。`,
      );
    }
  }

  const normalizedProjects: NormalizedProject[] = [...projectMap.values()].map(
    (project) => ({
      ...project,
      milestones: (milestoneMap.get(project.code) ?? []).sort(
        (left, right) => left.sequence - right.sequence,
      ),
    }),
  );
  const customMilestoneCount = normalizedProjects.reduce(
    (sum, project) =>
      sum + project.milestones.filter((milestone) => milestone.custom).length,
    0,
  );
  return {
    issues,
    projects: normalizedProjects,
    summary: {
      projectCount: normalizedProjects.length,
      milestoneCount: normalizedProjects.reduce(
        (sum, project) => sum + project.milestones.length,
        0,
      ),
      standardMilestoneCount: normalizedProjects.reduce(
        (sum, project) =>
          sum +
          project.milestones.filter((milestone) => !milestone.custom).length,
        0,
      ),
      customMilestoneCount,
      activeTemplateCount: activeTemplates.length,
    },
  };
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as ImportPayload;
    const mode = payload.mode === "commit" ? "commit" : "preview";
    const db = getDb();
    const [templateRows, existingProjectRows, ownerAccountRows] =
      await Promise.all([
        db
          .select()
          .from(milestoneTemplates)
          .orderBy(asc(milestoneTemplates.sequence)),
        db.select({ code: projects.code }).from(projects),
        db
          .select({
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            active: users.active,
          })
          .from(users),
      ]);
    const validation = validateImport(
      payload,
      templateRows,
      new Set(existingProjectRows.map((project) => project.code.toUpperCase())),
      new Map(ownerAccountRows.map((account) => [account.email, account])),
    );
    if (validation.issues.length) {
      return Response.json(
        {
          valid: false,
          mode,
          summary: validation.summary,
          errors: validation.issues.slice(0, 200),
          errorCount: validation.issues.length,
        },
        { status: 422 },
      );
    }

    const previewProjects = validation.projects.map((project) => ({
      code: project.code,
      name: project.name,
      ownerName: project.ownerName,
      org: project.org,
      type: project.type,
      riskLevel: project.riskLevel,
      milestoneCount: project.milestones.length,
      customMilestoneCount: project.milestones.filter(
        (milestone) => milestone.custom,
      ).length,
      applicableMilestoneCount: project.milestones.filter(
        (milestone) => milestone.applicable,
      ).length,
      totalWeight: project.milestones.reduce(
        (sum, milestone) => sum + milestone.weight,
        0,
      ),
      plannedStart: project.milestones
        .map((milestone) => milestone.plannedStart)
        .sort()[0],
      plannedFinish: project.milestones
        .map((milestone) => milestone.plannedFinish)
        .sort()
        .at(-1),
    }));
    if (mode === "preview") {
      return Response.json({
        valid: true,
        mode,
        summary: validation.summary,
        errors: [],
        errorCount: 0,
        projects: previewProjects,
      });
    }

    const batchId = crypto.randomUUID();
    const projectValues = validation.projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      ownerEmail: project.ownerEmail,
      ownerName: project.ownerName,
      org: project.org,
      type: project.type,
      riskLevel: project.riskLevel,
    }));
    const milestoneValues = validation.projects.flatMap(
      (project) => project.milestones,
    );
    const baselineValues = validation.projects.map((project) => ({
      projectId: project.id,
      version: 1,
      kind: "original",
      milestoneJson: JSON.stringify(
        project.milestones.map((milestone) => ({
          templateId: milestone.templateId,
          name: milestone.name,
          sequence: milestone.sequence,
          plannedStart: milestone.plannedStart,
          plannedFinish: milestone.plannedFinish,
          weight: milestone.weight,
          critical: milestone.critical,
          applicable: milestone.applicable,
        })),
      ),
      createdBy: identity.email,
    }));
    const auditValues = validation.projects.map((project) => ({
      actorEmail: identity.email,
      action: "project.import",
      entityType: "project",
      entityId: project.id,
      detailJson: JSON.stringify({
        batchId,
        name: project.name,
        ownerEmail: project.ownerEmail,
        milestoneCount: project.milestones.length,
        source: "excel",
      }),
    }));

    const client = db.$client;
    await client.batch([
      client
        .prepare(
          `INSERT INTO projects
            (id, code, name, owner_email, owner_name, org, type, risk_level)
           SELECT
            json_extract(imported.value, '$.id'),
            json_extract(imported.value, '$.code'),
            json_extract(imported.value, '$.name'),
            account.email,
            account.display_name,
            json_extract(imported.value, '$.org'),
            json_extract(imported.value, '$.type'),
            json_extract(imported.value, '$.riskLevel')
           FROM json_each(?) AS imported
           JOIN users AS account
             ON account.email = json_extract(imported.value, '$.ownerEmail')
            AND account.display_name = json_extract(imported.value, '$.ownerName')
            AND account.active = 1
            AND account.role = 'manager'`,
        )
        .bind(JSON.stringify(projectValues)),
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
           SELECT
            json_extract(value, '$.projectId'),
            json_extract(value, '$.version'),
            json_extract(value, '$.kind'),
            json_extract(value, '$.milestoneJson'),
            json_extract(value, '$.createdBy')
           FROM json_each(?)`,
        )
        .bind(JSON.stringify(baselineValues)),
      client
        .prepare(
          `INSERT INTO audit_logs
            (actor_email, action, entity_type, entity_id, detail_json)
           SELECT
            json_extract(value, '$.actorEmail'),
            json_extract(value, '$.action'),
            json_extract(value, '$.entityType'),
            json_extract(value, '$.entityId'),
            json_extract(value, '$.detailJson')
           FROM json_each(?)`,
        )
        .bind(JSON.stringify(auditValues)),
    ]);

    return Response.json(
      {
        valid: true,
        mode,
        batchId,
        summary: validation.summary,
        created: validation.projects.length,
        projects: previewProjects,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        {
          error: "导入期间项目编码被占用，未写入任何项目，请重新预检。",
        },
        { status: 409 },
      );
    }
    if (message.includes("FOREIGN KEY constraint failed")) {
      return Response.json(
        {
          error:
            "导入期间项目经理账号状态发生变化，未写入任何项目，请重新预检。",
        },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
