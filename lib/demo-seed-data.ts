export const DEMO_MILESTONE_CADENCE_DAYS = 50;

export type DemoProjectSeed = {
  id: string;
  name: string;
  owner: string;
  org: string;
  type: string;
  startOffset: number;
  completeThrough: number;
  partialCompletion: number;
  forecastDelay: number;
  actualDelay: number;
  riskLevel: "low" | "medium" | "high";
  lifecycleStatus?: "active" | "completed" | "archived";
  naSequences?: number[];
  currentBaselineVersion?: number;
};

/**
 * Demo projects deliberately use a roughly seven-week milestone cadence.
 * The wider spacing keeps the timeline realistic: a normal project has at
 * most one distinct milestone in a calendar month, while exceptional parallel
 * work is demonstrated separately through the P06 custom milestone.
 */
export const seedProjects: DemoProjectSeed[] = [
  { id: "P01", name: "司库管理系统", owner: "王嘉", org: "财务数智组", type: "核心系统", startOffset: -660, completeThrough: 12, partialCompletion: 100, forecastDelay: 0, actualDelay: 0, riskLevel: "low", lifecycleStatus: "completed" },
  { id: "P02", name: "智慧采购平台", owner: "李程", org: "供应链组", type: "业务平台", startOffset: -320, completeThrough: 5, partialCompletion: 62, forecastDelay: 14, actualDelay: 1, riskLevel: "high", currentBaselineVersion: 2 },
  { id: "P03", name: "人力资源共享平台", owner: "陈路", org: "人力数智组", type: "业务平台", startOffset: -280, completeThrough: 5, partialCompletion: 58, forecastDelay: 0, actualDelay: 0, riskLevel: "high" },
  { id: "P04", name: "合同全生命周期管理", owner: "周航", org: "法务数智组", type: "核心系统", startOffset: -205, completeThrough: 3, partialCompletion: 82, forecastDelay: 0, actualDelay: 0, riskLevel: "low", naSequences: [8] },
  { id: "P05", name: "财务共享中心二期", owner: "赵敏", org: "财务数智组", type: "核心系统", startOffset: -275, completeThrough: 4, partialCompletion: 45, forecastDelay: 18, actualDelay: 3, riskLevel: "high" },
  { id: "P06", name: "数据资产管理平台", owner: "孙悦", org: "数据治理组", type: "数据平台", startOffset: -232, completeThrough: 4, partialCompletion: 70, forecastDelay: 5, actualDelay: -1, riskLevel: "medium", naSequences: [8, 9] },
  { id: "P07", name: "经营分析驾驶舱", owner: "何清", org: "数据治理组", type: "数据平台", startOffset: -570, completeThrough: 11, partialCompletion: 45, forecastDelay: -2, actualDelay: -4, riskLevel: "low" },
  { id: "P08", name: "审计数字化平台", owner: "刘可", org: "监督数智组", type: "业务平台", startOffset: -205, completeThrough: 3, partialCompletion: 78, forecastDelay: 0, actualDelay: 0, riskLevel: "low" },
  { id: "P09", name: "主数据治理一期", owner: "林亦", org: "数据治理组", type: "数据平台", startOffset: -290, completeThrough: 5, partialCompletion: 22, forecastDelay: 2, actualDelay: 2, riskLevel: "medium", currentBaselineVersion: 2 },
  { id: "P10", name: "统一门户升级项目", owner: "高远", org: "技术平台组", type: "技术底座", startOffset: -700, completeThrough: 12, partialCompletion: 100, forecastDelay: 0, actualDelay: 4, riskLevel: "low", lifecycleStatus: "archived" },
  { id: "P11", name: "投资管理一体化平台", owner: "宋妍", org: "投资数智组", type: "业务平台", startOffset: -17, completeThrough: 0, partialCompletion: 15, forecastDelay: 0, actualDelay: 0, riskLevel: "low" },
  { id: "P12", name: "审计整改闭环平台", owner: "郑睿", org: "监督数智组", type: "业务平台", startOffset: -605, completeThrough: 12, partialCompletion: 100, forecastDelay: 0, actualDelay: 2, riskLevel: "low", lifecycleStatus: "completed" },
  { id: "P13", name: "供应商协同门户", owner: "徐宁", org: "供应链组", type: "业务平台", startOffset: -235, completeThrough: 4, partialCompletion: 75, forecastDelay: 0, actualDelay: 0, riskLevel: "low" },
  { id: "P14", name: "数据中台能力升级", owner: "叶川", org: "技术平台组", type: "技术底座", startOffset: -290, completeThrough: 5, partialCompletion: 52, forecastDelay: 6, actualDelay: 1, riskLevel: "medium" },
  { id: "P15", name: "费用报销智能审核", owner: "沈佳", org: "财务数智组", type: "核心系统", startOffset: -140, completeThrough: 2, partialCompletion: 68, forecastDelay: 0, actualDelay: 0, riskLevel: "low" },
  { id: "P16", name: "统一身份权限治理", owner: "唐宇", org: "技术平台组", type: "技术底座", startOffset: -405, completeThrough: 7, partialCompletion: 65, forecastDelay: 4, actualDelay: 0, riskLevel: "medium" },
];
