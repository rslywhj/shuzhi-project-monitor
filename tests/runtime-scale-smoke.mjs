import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4176";
const targetProjectCount = Number(process.env.TARGET_PROJECT_COUNT ?? 50);
const maxP95Ms = Number(process.env.MAX_BOOTSTRAP_P95_MS ?? 3000);
const maxAnalyticsP95Ms = Number(
  process.env.MAX_ANALYTICS_P95_MS ?? maxP95Ms,
);
const maxTrendP95Ms = Number(
  process.env.MAX_TREND_P95_MS ?? maxP95Ms,
);

const template = [
  ["立项启动", 5, false],
  ["需求调研", 5, false],
  ["需求确认", 8, false],
  ["方案设计", 7, false],
  ["方案评审", 10, false],
  ["开发完成", 15, true],
  ["测试验证", 10, false],
  ["联调测试", 10, false],
  ["试运行", 5, false],
  ["用户验收", 10, true],
  ["上线切换", 10, true],
  ["结项移交", 5, false],
];

function isoDate(monthOffset, day) {
  const date = new Date(Date.UTC(2026, 7 + monthOffset, day));
  return date.toISOString().slice(0, 10);
}

function projectPayload(index) {
  return {
    code: `QA-SCALE-${String(index).padStart(3, "0")}`,
    name: `规模回归项目 ${String(index).padStart(2, "0")}`,
    ownerEmail: `scale-${String(index).padStart(3, "0")}@projects.internal`,
    ownerName: `回归经理${index}`,
    org: `规模验证组${(index % 5) + 1}`,
    type: index % 2 ? "业务平台" : "核心系统",
    riskLevel: index % 9 === 0 ? "high" : index % 4 === 0 ? "medium" : "low",
    milestones: template.map(([name, weight, critical], milestoneIndex) => ({
      name,
      sequence: milestoneIndex + 1,
      weight,
      critical,
      applicable: true,
      plannedStart: isoDate(milestoneIndex, 1),
      plannedFinish: isoDate(milestoneIndex, 20),
    })),
  };
}

async function readJson(path, init) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const elapsedMs = performance.now() - startedAt;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} 返回了非 JSON 响应：${text.slice(0, 200)}`);
  }
  return { response, body, text, elapsedMs };
}

async function bootstrap() {
  const result = await readJson("/api/bootstrap", { cache: "no-store" });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result;
}

const initial = await bootstrap();
const securityConfig = await readJson("/api/security-config", {
  cache: "no-store",
});
assert.equal(
  securityConfig.response.status,
  200,
  JSON.stringify(securityConfig.body),
);
const minimumPasswordLength = Number(
  securityConfig.body.passwordPolicy?.minPasswordLength ?? 12,
);
const scalePassword =
  "ScaleDemo2026!" +
  "x".repeat(Math.max(0, minimumPasswordLength - "ScaleDemo2026!".length));
let projectCount = initial.body.projects.length;
let candidateIndex = 1;

while (projectCount < targetProjectCount && candidateIndex <= 100) {
  const payload = projectPayload(candidateIndex);
  candidateIndex += 1;
  if (initial.body.projects.some((project) => project.id === payload.code)) {
    continue;
  }
  const provisionedOwner = await readJson("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: payload.ownerEmail,
      displayName: payload.ownerName,
      role: "manager",
      password: scalePassword,
    }),
  });
  assert(
    provisionedOwner.response.status === 201 ||
      provisionedOwner.response.status === 409,
    JSON.stringify(provisionedOwner.body),
  );
  const created = await readJson("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  projectCount += 1;
}

const samples = [];
let latest;
for (let index = 0; index < 5; index += 1) {
  latest = await bootstrap();
  samples.push(latest.elapsedMs);
}

assert(latest, "未取得规模回归数据");
assert(
  latest.body.projects.length >= targetProjectCount,
  `项目数不足：${latest.body.projects.length}/${targetProjectCount}`,
);
const scaleProjects = latest.body.projects.filter((project) =>
  project.id.startsWith("QA-SCALE-"),
);
assert(scaleProjects.length > 0, "未生成规模回归项目");
const activeTemplates = latest.body.milestoneTemplates.filter(
  (milestoneTemplate) => milestoneTemplate.active,
);
assert(
  activeTemplates.length >= 12,
  `启用的标准节点少于12个：${activeTemplates.length}`,
);
assert(
  scaleProjects.every(
    (project) =>
      project.cells.length === activeTemplates.length &&
      activeTemplates.every((milestoneTemplate) =>
        project.milestones.some(
          (milestone) =>
            milestone.templateId === milestoneTemplate.id ||
            milestone.name === milestoneTemplate.name,
        ),
      ),
  ),
  "规模回归项目未完整覆盖当前启用标准节点",
);
const sortedSamples = [...samples].sort((left, right) => left - right);
const p95Ms = sortedSamples[Math.ceil(sortedSamples.length * 0.95) - 1];
assert(
  p95Ms <= maxP95Ms,
  `bootstrap P95 ${p95Ms.toFixed(1)}ms 超过阈值 ${maxP95Ms}ms`,
);

const analyticsSamples = [];
let analytics;
for (let index = 0; index < 5; index += 1) {
  analytics = await readJson("/api/portfolio/analytics", {
    cache: "no-store",
  });
  assert.equal(
    analytics.response.status,
    200,
    JSON.stringify(analytics.body),
  );
  analyticsSamples.push(analytics.elapsedMs);
}
assert(analytics, "未取得组合分析数据");
assert.equal(
  analytics.body.summary.projectCount,
  latest.body.projects.length,
  "组合分析未覆盖全部项目",
);
assert(
  analytics.body.bottlenecks.length >= 12,
  `组合分析标准节点不足：${analytics.body.bottlenecks.length}`,
);
const sortedAnalyticsSamples = [...analyticsSamples].sort(
  (left, right) => left - right,
);
const analyticsP95Ms =
  sortedAnalyticsSamples[
    Math.ceil(sortedAnalyticsSamples.length * 0.95) - 1
  ];
assert(
  analyticsP95Ms <= maxAnalyticsP95Ms,
  `analytics P95 ${analyticsP95Ms.toFixed(1)}ms 超过阈值 ${maxAnalyticsP95Ms}ms`,
);

const trendSamples = [];
let trends;
for (let index = 0; index < 5; index += 1) {
  trends = await readJson("/api/portfolio/analytics/trends?weeks=12", {
    cache: "no-store",
  });
  assert.equal(trends.response.status, 200, JSON.stringify(trends.body));
  assert(Array.isArray(trends.body.points), "跨周期趋势未返回points数组");
  assert(
    Array.isArray(trends.body.chronicBottlenecks),
    "跨周期趋势未返回持续瓶颈数组",
  );
  trendSamples.push(trends.elapsedMs);
}
const sortedTrendSamples = [...trendSamples].sort(
  (left, right) => left - right,
);
const trendP95Ms =
  sortedTrendSamples[Math.ceil(sortedTrendSamples.length * 0.95) - 1];
assert(
  trendP95Ms <= maxTrendP95Ms,
  `trends P95 ${trendP95Ms.toFixed(1)}ms 超过阈值 ${maxTrendP95Ms}ms`,
);

console.log(
  JSON.stringify(
    {
      baseUrl,
      projectCount: latest.body.projects.length,
      scaleProjectCount: scaleProjects.length,
      activeMatrixColumns: activeTemplates.length,
      milestoneRowsPerScaleProject: [
        Math.min(
          ...scaleProjects.map((project) => project.milestones.length),
        ),
        Math.max(
          ...scaleProjects.map((project) => project.milestones.length),
        ),
      ],
      bootstrapBytes: Buffer.byteLength(latest.text),
      samplesMs: samples.map((value) => Number(value.toFixed(1))),
      p95Ms: Number(p95Ms.toFixed(1)),
      thresholdMs: maxP95Ms,
      analyticsBytes: Buffer.byteLength(analytics.text),
      analyticsSamplesMs: analyticsSamples.map((value) =>
        Number(value.toFixed(1)),
      ),
      analyticsP95Ms: Number(analyticsP95Ms.toFixed(1)),
      analyticsThresholdMs: maxAnalyticsP95Ms,
      trendWeeks: trends.body.points.length,
      trendBytes: Buffer.byteLength(trends.text),
      trendSamplesMs: trendSamples.map((value) => Number(value.toFixed(1))),
      trendP95Ms: Number(trendP95Ms.toFixed(1)),
      trendThresholdMs: maxTrendP95Ms,
    },
    null,
    2,
  ),
);
