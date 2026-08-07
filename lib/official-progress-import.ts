import { officialMilestoneStandard } from "@/lib/official-progress-standard";

export type OfficialWorkbookSheet = {
  sheet: string;
  data: unknown[][];
};

export type OfficialMilestoneTemplateInput = {
  rowNumber: number;
  code: string;
  sourceCode: string;
  name: string;
  sequence: number;
  stage: string;
  defaultWeight: number;
  critical: boolean;
  coreWork: string;
  deliverable: string;
  predecessor: string;
  riskPoint: string;
};

export type OfficialProjectCatalogInput = {
  rowNumber: number;
  sourceSequence: number;
  name: string;
  org: string;
  sourceStage: string;
};

export type OfficialMilestoneProgressInput = {
  rowNumber: number;
  sequence: number;
  sourceCode: string;
  name: string;
  executor: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualFinish: string | null;
  executionStatus: "not_started" | "in_progress" | "paused" | "completed";
  completion: number;
  completionNote: string;
  coordinationNote: string;
};

export type OfficialProjectProgressInput = {
  systemName: string;
  ownerName: string;
  businessOwnerOrg: string;
  businessLiaison: string;
  projectLevel: string;
  updatedDate: string | null;
  milestones: OfficialMilestoneProgressInput[];
};

export type OfficialProgressImportPayload = {
  mode: "preview" | "commit";
  sourceFileName: string;
  templates: OfficialMilestoneTemplateInput[];
  projects: OfficialProjectCatalogInput[];
  progress: OfficialProjectProgressInput;
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalized(value: unknown) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ");
}

function excelSerialToIso(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(value) * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function officialExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const source = text(value);
  if (!source) return null;
  if (/^\d{8}$/.test(source)) {
    const result = `${source.slice(0, 4)}-${source.slice(4, 6)}-${source.slice(6, 8)}`;
    return officialExcelDate(result);
  }
  const normalizedDate = source.replace(/[/.]/g, "-");
  const match = normalizedDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result
    ? result
    : null;
}

function completionPercent(value: unknown) {
  if (typeof value === "number") {
    const percent = value <= 1 ? value * 100 : value;
    return Math.min(100, Math.max(0, Number(percent.toFixed(2))));
  }
  const source = text(value).replace(/%$/, "");
  if (!source) return 0;
  const number = Number(source);
  if (!Number.isFinite(number)) return 0;
  const percent = text(value).endsWith("%") ? number : number <= 1 ? number * 100 : number;
  return Math.min(100, Math.max(0, Number(percent.toFixed(2))));
}

function executionStatus(value: unknown, completion: number) {
  const source = normalized(value).toLowerCase();
  if (completion >= 100 || ["已完成", "完成", "completed"].includes(source)) return "completed" as const;
  if (["暂停", "已暂停", "paused"].includes(source)) return "paused" as const;
  if (completion > 0 || ["进行中", "已启动", "in progress", "in_progress"].includes(source)) {
    return "in_progress" as const;
  }
  return "not_started" as const;
}

function findSheet(sheets: OfficialWorkbookSheet[], namePart: string) {
  return sheets.find((row) => normalized(row.sheet).includes(namePart));
}

function metadataValue(rows: unknown[][], label: string) {
  for (const row of rows.slice(0, 4)) {
    const index = row.findIndex((cell) => normalized(cell) === label);
    if (index >= 0) return row[index + 1];
  }
  return null;
}

export function parseOfficialProgressWorkbook(
  sheets: OfficialWorkbookSheet[],
  sourceFileName: string,
): Omit<OfficialProgressImportPayload, "mode"> {
  const standardSheet = findSheet(sheets, "标准化关键节点跟踪表") ?? sheets[0];
  const projectSheet = findSheet(sheets, "统建系统清单") ?? sheets[1];
  if (!standardSheet || !projectSheet) {
    throw new Error("工作簿必须包含节点跟踪表和统建系统清单。");
  }

  const standardHeaderIndex = standardSheet.data.findIndex(
    (row) => normalized(row[0]) === "序号" && normalized(row[2]) === "里程碑节点",
  );
  if (standardHeaderIndex < 0) throw new Error("首个工作表未找到“序号 / 里程碑节点”表头。");
  let stage = "";
  const milestoneRows = standardSheet.data
    .slice(standardHeaderIndex + 1)
    .filter((row) => Number(row[0]) >= 1 && Number(row[0]) <= 36)
    .slice(0, 36);
  if (milestoneRows.length !== 36) {
    throw new Error(`首个工作表应包含36个节点，当前识别到${milestoneRows.length}个。`);
  }
  const templates: OfficialMilestoneTemplateInput[] = milestoneRows.map((row, index) => {
    const sequence = Number(row[0]);
    if (sequence !== index + 1) throw new Error(`节点序号应连续，第${standardHeaderIndex + index + 2}行应为${index + 1}。`);
    stage = normalized(row[1]) || stage;
    const sourceLabel = normalized(row[2]);
    const critical = sourceLabel.startsWith("★");
    const name = sourceLabel.replace(/^★\s*/, "");
    const sourceCode = name.match(/^\d+\.\d+/)?.[0] ?? "";
    if (!name || !sourceCode) throw new Error(`第${standardHeaderIndex + index + 2}行节点编码或名称不完整。`);
    const official = officialMilestoneStandard[index];
    return {
      rowNumber: standardHeaderIndex + index + 2,
      code: `N${String(sequence).padStart(2, "0")}`,
      sourceCode,
      name,
      sequence,
      stage,
      defaultWeight: official?.defaultWeight ?? (sequence < 36 ? 2.78 : 2.7),
      critical,
      coreWork: normalized(row[3]),
      deliverable: normalized(row[4]),
      predecessor: normalized(row[5]),
      riskPoint: normalized(row[6]),
    };
  });

  const progressMilestones: OfficialMilestoneProgressInput[] = milestoneRows.map((row, index) => {
    const completion = completionPercent(row[12]);
    return {
      rowNumber: standardHeaderIndex + index + 2,
      sequence: Number(row[0]),
      sourceCode: templates[index].sourceCode,
      name: templates[index].name,
      executor: normalized(row[7]),
      plannedStart: officialExcelDate(row[8]),
      plannedFinish: officialExcelDate(row[9]),
      actualFinish: officialExcelDate(row[10]),
      executionStatus: executionStatus(row[11], completion),
      completion,
      completionNote: normalized(row[13]),
      coordinationNote: normalized(row[14]),
    };
  });

  const projectHeaderIndex = projectSheet.data.findIndex(
    (row) => normalized(row[0]) === "发文序号" && normalized(row[1]).includes("子系统"),
  );
  if (projectHeaderIndex < 0) throw new Error("第二个工作表未找到统建系统清单表头。");
  const projects = projectSheet.data
    .slice(projectHeaderIndex + 1)
    .filter((row) => Number(row[0]) > 0 && normalized(row[1]))
    .map((row, index) => ({
      rowNumber: projectHeaderIndex + index + 2,
      sourceSequence: Number(row[0]),
      name: normalized(row[1]),
      org: normalized(row[2]),
      sourceStage: normalized(row[3]),
    }));
  if (!projects.length) throw new Error("第二个工作表未识别到项目清单。");

  return {
    sourceFileName,
    templates,
    projects,
    progress: {
      systemName: normalized(metadataValue(standardSheet.data, "系统名称")),
      ownerName: normalized(metadataValue(standardSheet.data, "项目经理")),
      businessOwnerOrg: normalized(metadataValue(standardSheet.data, "业务归口部门")),
      businessLiaison: normalized(metadataValue(standardSheet.data, "业务接口人")),
      projectLevel: normalized(metadataValue(standardSheet.data, "项目等级")),
      updatedDate: officialExcelDate(metadataValue(standardSheet.data, "更新时间")),
      milestones: progressMilestones,
    },
  };
}
