import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  milestoneTemplates,
  milestones,
  projects,
  users,
} from "@/db/schema";
import { ApiRequestError, apiError } from "@/lib/api-utils";
import { recalculateProjectHealth } from "@/lib/health";
import type {
  OfficialMilestoneProgressInput,
  OfficialMilestoneTemplateInput,
  OfficialProgressImportPayload,
  OfficialProjectCatalogInput,
} from "@/lib/official-progress-import";
import { ensureSeeded } from "@/lib/seed";
import {
  canManagePortfolio,
  forbidden,
  getRequestIdentity,
  unauthorized,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const UNASSIGNED_EMAIL = "unassigned@projects.internal";
const UNASSIGNED_NAME = "待分配";

function clean(value: unknown, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoDate(value: unknown) {
  const source = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return null;
  const parsed = new Date(`${source}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === source
    ? source
    : null;
}

function normalizeTemplates(input: unknown): OfficialMilestoneTemplateInput[] {
  if (!Array.isArray(input) || input.length !== 36) {
    throw new ApiRequestError("节点标准必须完整包含36个节点。");
  }
  const rows = input.map((source, index) => {
    const row = source as Partial<OfficialMilestoneTemplateInput>;
    const sequence = Number(row.sequence);
    const name = clean(row.name, 160);
    const sourceCode = clean(row.sourceCode, 20);
    const code = `N${String(index + 1).padStart(2, "0")}`;
    if (sequence !== index + 1 || !name || !/^\d+\.\d+$/.test(sourceCode)) {
      throw new ApiRequestError(`第${index + 1}个节点序号、编码或名称不正确。`);
    }
    return {
      rowNumber: Number(row.rowNumber) || index + 5,
      code,
      sourceCode,
      name,
      sequence,
      stage: clean(row.stage, 80),
      defaultWeight: index < 35 ? 2.78 : 2.7,
      critical: Boolean(row.critical),
      coreWork: clean(row.coreWork),
      deliverable: clean(row.deliverable),
      predecessor: clean(row.predecessor, 500),
      riskPoint: clean(row.riskPoint),
    };
  });
  if (Math.abs(rows.reduce((sum, row) => sum + row.defaultWeight, 0) - 100) > 0.01) {
    throw new ApiRequestError("节点默认权重合计不为100%。");
  }
  return rows;
}

function normalizeProjects(input: unknown): OfficialProjectCatalogInput[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) {
    throw new ApiRequestError("项目清单应包含1–100个项目。");
  }
  const seenSequence = new Set<number>();
  const seenName = new Set<string>();
  return input.map((source, index) => {
    const row = source as Partial<OfficialProjectCatalogInput>;
    const sourceSequence = Number(row.sourceSequence);
    const name = clean(row.name, 200);
    if (!Number.isInteger(sourceSequence) || sourceSequence < 1 || sourceSequence > 999 || !name) {
      throw new ApiRequestError(`项目清单第${index + 2}行的发文序号或系统名称不正确。`);
    }
    if (seenSequence.has(sourceSequence) || seenName.has(name.normalize("NFKC").toLowerCase())) {
      throw new ApiRequestError(`项目清单存在重复项：${name}。`);
    }
    seenSequence.add(sourceSequence);
    seenName.add(name.normalize("NFKC").toLowerCase());
    return {
      rowNumber: Number(row.rowNumber) || index + 2,
      sourceSequence,
      name,
      org: clean(row.org, 120) || "待完善",
      sourceStage: clean(row.sourceStage, 80),
    };
  });
}

function normalizeProgress(
  input: OfficialProgressImportPayload["progress"],
  templates: OfficialMilestoneTemplateInput[],
) {
  const systemName = clean(input?.systemName, 200);
  if (!systemName) throw new ApiRequestError("首个工作表顶部的系统名称不能为空。");
  if (!Array.isArray(input?.milestones) || input.milestones.length !== 36) {
    throw new ApiRequestError("项目进度明细必须完整包含36个节点。");
  }
  const scheduleWarnings: Array<{
    sequence: number;
    name: string;
    plannedStart: string;
    plannedFinish: string;
    message: string;
  }> = [];
  const milestones = input.milestones.map((source, index) => {
    const row = source as Partial<OfficialMilestoneProgressInput>;
    if (Number(row.sequence) !== index + 1) {
      throw new ApiRequestError(`项目进度第${index + 1}个节点序号不连续。`);
    }
    const plannedStart = isoDate(row.plannedStart);
    const plannedFinish = isoDate(row.plannedFinish);
    if ((plannedStart && !plannedFinish) || (!plannedStart && plannedFinish)) {
      throw new ApiRequestError(`${templates[index].name}的计划开始日和完成日必须同时填写。`);
    }
    if (plannedStart && plannedFinish && plannedFinish < plannedStart) {
      scheduleWarnings.push({
        sequence: index + 1,
        name: templates[index].name,
        plannedStart,
        plannedFinish,
        message: "计划完成日早于开始日，已按Excel原值保留，请在基线治理中核验。",
      });
    }
    const completion = Number(row.completion);
    if (!Number.isFinite(completion) || completion < 0 || completion > 100) {
      throw new ApiRequestError(`${templates[index].name}的完成率应为0–100。`);
    }
    const executionStatus = ["not_started", "in_progress", "paused", "completed"].includes(
      String(row.executionStatus),
    )
      ? (row.executionStatus as OfficialMilestoneProgressInput["executionStatus"])
      : completion >= 100
        ? "completed"
        : completion > 0
          ? "in_progress"
          : "not_started";
    const actualFinish = isoDate(row.actualFinish);
    if (executionStatus === "completed" && (!actualFinish || completion < 100)) {
      throw new ApiRequestError(`${templates[index].name}已完成时必须填写实际完成日且完成率为100%。`);
    }
    return {
      rowNumber: Number(row.rowNumber) || index + 5,
      sequence: index + 1,
      sourceCode: templates[index].sourceCode,
      name: templates[index].name,
      executor: clean(row.executor, 120),
      plannedStart,
      plannedFinish,
      actualFinish,
      executionStatus,
      completion: Number(completion.toFixed(2)),
      completionNote: clean(row.completionNote),
      coordinationNote: clean(row.coordinationNote),
    };
  });
  return {
    systemName,
    ownerName: clean(input.ownerName, 120),
    businessOwnerOrg: clean(input.businessOwnerOrg, 120),
    businessLiaison: clean(input.businessLiaison, 120),
    projectLevel: clean(input.projectLevel, 80),
    updatedDate: isoDate(input.updatedDate),
    milestones,
    scheduleWarnings,
  };
}

function daysBetween(left: string, right: string) {
  return Math.round(
    (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) /
      86_400_000,
  );
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return unauthorized();
    if (!canManagePortfolio(identity)) return forbidden();
    await ensureSeeded();

    const payload = (await request.json()) as OfficialProgressImportPayload;
    const mode = payload.mode === "commit" ? "commit" : "preview";
    const templates = normalizeTemplates(payload.templates);
    const catalog = normalizeProjects(payload.projects);
    const progress = normalizeProgress(payload.progress, templates);
    if (
      !catalog.some(
        (row) =>
          row.name.normalize("NFKC").toLowerCase() ===
          progress.systemName.normalize("NFKC").toLowerCase(),
      )
    ) {
      throw new ApiRequestError("首个工作表的系统名称未出现在第二个工作表项目清单中。");
    }
    const db = getDb();
    const [existingTemplates, existingProjects, userRows] = await Promise.all([
      db.select().from(milestoneTemplates).orderBy(asc(milestoneTemplates.sequence)),
      db.select().from(projects).orderBy(asc(projects.code)),
      db.select().from(users),
    ]);
    const existingByName = new Map(
      existingProjects.map((project) => [project.name.normalize("NFKC").toLowerCase(), project]),
    );
    const existingTemplateByCode = new Map(existingTemplates.map((row) => [row.code, row]));
    const progressProject = existingByName.get(progress.systemName.normalize("NFKC").toLowerCase());
    const existingProgressMilestones = progressProject
      ? await db.select().from(milestones).where(eq(milestones.projectId, progressProject.id))
      : [];
    const existingMilestoneBySequence = new Map(
      existingProgressMilestones.map((row) => [row.sequence, row]),
    );
    const baselineConflicts = progress.milestones.flatMap((row) => {
      const existing = existingMilestoneBySequence.get(row.sequence);
      if (
        !existing ||
        !existing.scheduleConfirmed ||
        !row.plannedStart ||
        !row.plannedFinish ||
        (existing.plannedStart === row.plannedStart && existing.plannedFinish === row.plannedFinish)
      ) {
        return [];
      }
      return [{
        sequence: row.sequence,
        name: row.name,
        current: `${existing.plannedStart} 至 ${existing.plannedFinish}`,
        workbook: `${row.plannedStart} 至 ${row.plannedFinish}`,
      }];
    });
    const ownerAccount = userRows.find(
      (row) => row.active && row.role === "manager" && row.displayName === progress.ownerName,
    );
    const templateChangeCount = templates.filter((row) => {
      const existing = existingTemplateByCode.get(row.code);
      return !existing || existing.name !== row.name || existing.stage !== row.stage || existing.coreWork !== row.coreWork;
    }).length;
    const createCount = catalog.filter(
      (row) => !existingByName.has(row.name.normalize("NFKC").toLowerCase()),
    ).length;
    const summary = {
      templateCount: templates.length,
      templateChangeCount,
      projectCount: catalog.length,
      projectCreateCount: createCount,
      projectUpdateCount: catalog.length - createCount,
      progressProjectName: progress.systemName,
      progressScheduledCount: progress.milestones.filter((row) => row.plannedStart && row.plannedFinish).length,
      progressCompletedCount: progress.milestones.filter((row) => row.executionStatus === "completed").length,
      ownerMatched: Boolean(ownerAccount),
      baselineConflictCount: baselineConflicts.length,
    };
    if (mode === "preview") {
      return Response.json({
        valid: true,
        mode,
        summary,
        baselineConflicts,
        scheduleWarnings: progress.scheduleWarnings,
        projectPreview: catalog.slice(0, 20),
      });
    }

    const importId = crypto.randomUUID();
    const sourceFileName = clean(payload.sourceFileName, 240) || "统建项目三级进度计划.xlsx";
    const importedAt = new Date().toISOString();
    const templateValues = templates.map((row) => ({ ...row, createdBy: identity.email }));
    const projectValues = catalog.map((row) => ({
      id: `TJ-${String(row.sourceSequence).padStart(3, "0")}`,
      code: `TJ-${String(row.sourceSequence).padStart(3, "0")}`,
      ...row,
    }));
    const progressValues = progress.milestones.map((row, index) => {
      const template = templates[index];
      const scheduleConfirmed = Boolean(row.plannedStart && row.plannedFinish);
      const plannedStart = row.plannedStart ?? "9999-12-31";
      const plannedFinish = row.plannedFinish ?? "9999-12-31";
      const effectiveFinish = row.actualFinish ?? (scheduleConfirmed ? plannedFinish : null);
      const deviationDays = scheduleConfirmed && effectiveFinish
        ? daysBetween(plannedFinish, effectiveFinish)
        : 0;
      return {
        ...row,
        code: template.code,
        weight: template.defaultWeight,
        critical: template.critical,
        plannedStart,
        plannedFinish,
        scheduleConfirmed,
        forecastFinish:
          row.executionStatus === "completed" || !scheduleConfirmed ? null : plannedFinish,
        actualStart:
          row.executionStatus === "not_started" || !scheduleConfirmed ? null : plannedStart,
        deviationDays,
        reason: [row.completionNote, row.coordinationNote].filter(Boolean).join("；"),
      };
    });
    const baselineJson = JSON.stringify(
      progressValues.map((row) => ({
        templateCode: row.code,
        name: row.name,
        sequence: row.sequence,
        plannedStart: row.plannedStart,
        plannedFinish: row.plannedFinish,
        scheduleConfirmed: row.scheduleConfirmed,
        weight: row.weight,
        critical: row.critical,
        applicable: true,
      })),
    );
    const client = db.$client;
    await client.batch([
      client
        .prepare(
          `INSERT OR IGNORE INTO users (email, display_name, role, active)
           VALUES (?, ?, 'manager', 0)`,
        )
        .bind(UNASSIGNED_EMAIL, UNASSIGNED_NAME),
      client
        .prepare(
          `UPDATE milestone_templates
           SET active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE code NOT IN (SELECT json_extract(value, '$.code') FROM json_each(?))`,
        )
        .bind(JSON.stringify(templateValues)),
      client
        .prepare(
          `INSERT INTO milestone_templates
            (code, name, sequence, default_weight, critical, active, description,
             source_code, stage, core_work, deliverable, predecessor, risk_point, created_by)
           SELECT
             json_extract(value, '$.code'), json_extract(value, '$.name'),
             json_extract(value, '$.sequence'), json_extract(value, '$.defaultWeight'),
             json_extract(value, '$.critical'), 1, json_extract(value, '$.coreWork'),
             json_extract(value, '$.sourceCode'), json_extract(value, '$.stage'),
             json_extract(value, '$.coreWork'), json_extract(value, '$.deliverable'),
             json_extract(value, '$.predecessor'), json_extract(value, '$.riskPoint'),
             json_extract(value, '$.createdBy')
           FROM json_each(?)
           WHERE 1 = 1
           ON CONFLICT(code) DO UPDATE SET
             name = excluded.name, sequence = excluded.sequence,
             default_weight = excluded.default_weight, critical = excluded.critical,
             active = 1, description = excluded.description,
             source_code = excluded.source_code, stage = excluded.stage,
             core_work = excluded.core_work, deliverable = excluded.deliverable,
             predecessor = excluded.predecessor, risk_point = excluded.risk_point,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(JSON.stringify(templateValues)),
      client
        .prepare(
          `UPDATE projects
           SET source_sequence = json_extract(source.value, '$.sourceSequence'),
               source_stage = json_extract(source.value, '$.sourceStage'),
               org = json_extract(source.value, '$.org'),
               updated_at = CURRENT_TIMESTAMP
           FROM json_each(?) AS source
           WHERE projects.name = json_extract(source.value, '$.name')`,
        )
        .bind(JSON.stringify(projectValues)),
      client
        .prepare(
          `INSERT INTO projects
            (id, code, name, owner_email, owner_name, org, type, risk_level,
             source_sequence, source_stage)
           SELECT
             json_extract(source.value, '$.id'), json_extract(source.value, '$.code'),
             json_extract(source.value, '$.name'), ?, ?, json_extract(source.value, '$.org'),
             '统建系统', 'low', json_extract(source.value, '$.sourceSequence'),
             json_extract(source.value, '$.sourceStage')
           FROM json_each(?) AS source
           WHERE NOT EXISTS (
             SELECT 1 FROM projects WHERE projects.name = json_extract(source.value, '$.name')
           )`,
        )
        .bind(UNASSIGNED_EMAIL, UNASSIGNED_NAME, JSON.stringify(projectValues)),
      client
        .prepare(
          `UPDATE projects
           SET owner_email = ?, owner_name = ?, source_updated_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE name = ?`,
        )
        .bind(
          ownerAccount?.email ?? progressProject?.ownerEmail ?? UNASSIGNED_EMAIL,
          ownerAccount?.displayName ?? progressProject?.ownerName ?? UNASSIGNED_NAME,
          progress.updatedDate,
          progress.systemName,
        ),
      client
        .prepare(
          `INSERT INTO milestones
            (project_id, template_id, name, sequence, weight, critical, custom,
             applicable, planned_start, planned_finish, forecast_finish, actual_finish,
             execution_status, actual_start, schedule_confirmed, completion, status,
             deviation_days, reason, source_executor, source_completion_note,
             source_coordination_note, execution_updated_at, execution_updated_by)
           SELECT
             project.id, template.id, json_extract(source.value, '$.name'),
             json_extract(source.value, '$.sequence'), json_extract(source.value, '$.weight'),
             json_extract(source.value, '$.critical'), 0, 1,
             json_extract(source.value, '$.plannedStart'), json_extract(source.value, '$.plannedFinish'),
             json_extract(source.value, '$.forecastFinish'), json_extract(source.value, '$.actualFinish'),
             json_extract(source.value, '$.executionStatus'), json_extract(source.value, '$.actualStart'),
             json_extract(source.value, '$.scheduleConfirmed'), json_extract(source.value, '$.completion'),
             'green', json_extract(source.value, '$.deviationDays'), json_extract(source.value, '$.reason'),
             json_extract(source.value, '$.executor'), json_extract(source.value, '$.completionNote'),
             json_extract(source.value, '$.coordinationNote'), ?, ?
           FROM json_each(?) AS source
           JOIN projects AS project ON project.name = ?
           JOIN milestone_templates AS template ON template.code = json_extract(source.value, '$.code')
           WHERE 1 = 1
           ON CONFLICT(project_id, sequence) DO UPDATE SET
             template_id = excluded.template_id, name = excluded.name, weight = excluded.weight,
             critical = excluded.critical, custom = 0, applicable = 1,
             planned_start = CASE
               WHEN milestones.schedule_confirmed = 0 AND excluded.schedule_confirmed = 1
               THEN excluded.planned_start ELSE milestones.planned_start END,
             planned_finish = CASE
               WHEN milestones.schedule_confirmed = 0 AND excluded.schedule_confirmed = 1
               THEN excluded.planned_finish ELSE milestones.planned_finish END,
             schedule_confirmed = CASE
               WHEN milestones.schedule_confirmed = 1 THEN 1 ELSE excluded.schedule_confirmed END,
             forecast_finish = excluded.forecast_finish,
             actual_finish = excluded.actual_finish,
             execution_status = excluded.execution_status,
             actual_start = COALESCE(milestones.actual_start, excluded.actual_start),
             completion = excluded.completion, deviation_days = excluded.deviation_days,
             reason = excluded.reason, source_executor = excluded.source_executor,
             source_completion_note = excluded.source_completion_note,
             source_coordination_note = excluded.source_coordination_note,
             execution_updated_at = excluded.execution_updated_at,
             execution_updated_by = excluded.execution_updated_by,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(importedAt, identity.email, JSON.stringify(progressValues), progress.systemName),
      client
        .prepare(
          `INSERT OR IGNORE INTO baseline_versions
            (project_id, version, kind, milestone_json, created_by)
           SELECT id, 1, 'original', ?, ? FROM projects WHERE name = ?`,
        )
        .bind(baselineJson, identity.email, progress.systemName),
      client
        .prepare(
          `INSERT INTO audit_logs (actor_email, action, entity_type, entity_id, detail_json)
           VALUES (?, 'project.progress_excel_import', 'project_portfolio', ?, ?)`,
        )
        .bind(
          identity.email,
          importId,
          JSON.stringify({
            sourceFileName,
            templateCount: templates.length,
            projectCount: catalog.length,
            progressProjectName: progress.systemName,
            updatedDate: progress.updatedDate,
            baselineConflictCount: baselineConflicts.length,
          }),
        ),
    ]);
    const [committedProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, progress.systemName))
      .limit(1);
    if (committedProject) await recalculateProjectHealth(committedProject.id);
    return Response.json({
      valid: true,
      mode,
      importId,
      summary,
      baselineConflicts,
      scheduleWarnings: progress.scheduleWarnings,
      created: createCount,
      updated: catalog.length - createCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "导入期间发生项目编码或节点序号冲突，未完成同步。" },
        { status: 409 },
      );
    }
    return apiError(error);
  }
}
