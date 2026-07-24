"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Identity = {
  email: string;
  displayName: string;
  role: "executive" | "pmo" | "manager" | "admin";
};
type ResourceType = "person" | "team" | "vendor" | "environment";
type AllocationStatus = "planned" | "confirmed" | "cancelled";
type CapacityStatus = "idle" | "healthy" | "warning" | "conflict";
type ResourceCatalog = {
  id: number;
  name: string;
  resourceType: ResourceType;
  org: string;
  capacityHoursPerWeek: number;
  active: boolean;
};
type ProjectCatalog = {
  id: string;
  code: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  org: string;
  type: string;
  milestones: Array<{
    id: number;
    name: string;
    sequence: number;
    applicable: boolean;
  }>;
};
type Allocation = {
  id: number;
  resourceId: number;
  resourceName: string;
  resourceOrg: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectOrg: string;
  milestoneId: number | null;
  milestoneName: string | null;
  role: string;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  status: AllocationStatus;
  note: string;
  overrideReason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
type WeekAllocation = {
  id: number;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectOrg: string;
  milestoneName: string | null;
  role: string;
  status: Exclude<AllocationStatus, "cancelled">;
  hours: number;
  startDate: string;
  endDate: string;
  note: string;
};
type WeekCapacity = {
  weekKey: string;
  startDate: string;
  endDate: string;
  label: string;
  capacityHours: number;
  plannedHours: number;
  confirmedHours: number;
  totalHours: number;
  utilization: number;
  status: CapacityStatus;
  allocations: WeekAllocation[];
};
type ResourceCapacity = ResourceCatalog & {
  peakUtilization: number;
  conflictWeekCount: number;
  warningWeekCount: number;
  weeks: WeekCapacity[];
};
type Conflict = {
  resourceId: number;
  resourceName: string;
  resourceType: ResourceType;
  resourceOrg: string;
  weekKey: string;
  weekStart: string;
  capacityHours: number;
  allocatedHours: number;
  overallocatedHours: number;
  utilization: number;
  allocations: WeekAllocation[];
};
type ResourceData = {
  range: {
    asOfDate: string;
    startDate: string;
    endDate: string;
    weeks: number;
    columns: Array<{
      weekKey: string;
      startDate: string;
      endDate: string;
      label: string;
    }>;
  };
  summary: {
    resourceCount: number;
    allocationCount: number;
    conflictResourceCount: number;
    conflictWeekCount: number;
    warningResourceCount: number;
    peakUtilization: number;
  };
  resources: ResourceCapacity[];
  conflicts: Conflict[];
  allocations: Allocation[];
  resourceCatalog: ResourceCatalog[];
  projectCatalog: ProjectCatalog[];
  filterOptions: {
    resourceOrgs: string[];
    resourceTypes: ResourceType[];
    projectOrgs: string[];
    projectTypes: string[];
  };
  generatedAt: string;
};
type Filters = {
  weeks: string;
  resourceOrg: string;
  resourceType: string;
  projectOrg: string;
  projectType: string;
  status: string;
};
type ResourceDraft = {
  id: number | null;
  name: string;
  resourceType: ResourceType;
  org: string;
  capacityHoursPerWeek: number;
  active: boolean;
};
type AllocationDraft = {
  id: number | null;
  resourceId: string;
  projectId: string;
  milestoneId: string;
  role: string;
  startDate: string;
  endDate: string;
  hoursPerWeek: number;
  status: "planned" | "confirmed";
  note: string;
  overrideReason: string;
};
type PreviewResult = {
  overCapacity: boolean;
  requiresOverride: boolean;
  conflicts: Conflict[];
  error?: string;
};

const resourceTypeNames = {
  person: "人员",
  team: "团队",
  vendor: "供应商",
  environment: "环境/工具",
} as const;
const allocationStatusNames = {
  planned: "计划中",
  confirmed: "已确认",
  cancelled: "已取消",
} as const;
const capacityStatusNames = {
  idle: "空闲",
  healthy: "正常",
  warning: "接近满载",
  conflict: "超配冲突",
} as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function emptyResourceDraft(): ResourceDraft {
  return {
    id: null,
    name: "",
    resourceType: "person",
    org: "",
    capacityHoursPerWeek: 40,
    active: true,
  };
}

function emptyAllocationDraft(): AllocationDraft {
  const startDate = today();
  return {
    id: null,
    resourceId: "",
    projectId: "",
    milestoneId: "",
    role: "",
    startDate,
    endDate: addDays(startDate, 28),
    hoursPerWeek: 20,
    status: "planned",
    note: "",
    overrideReason: "",
  };
}

export default function ResourcePlanning({
  identity,
  header,
  onOpenProject,
}: {
  identity: Identity | null;
  header: React.ReactNode;
  onOpenProject: (projectId: string) => void;
}) {
  const [data, setData] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<Filters>({
    weeks: "12",
    resourceOrg: "",
    resourceType: "",
    projectOrg: "",
    projectType: "",
    status: "",
  });
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft | null>(
    null,
  );
  const [allocationDraft, setAllocationDraft] =
    useState<AllocationDraft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [working, setWorking] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    resource: ResourceCapacity;
    week: WeekCapacity;
  } | null>(null);
  const canGovern =
    identity?.role === "pmo" || identity?.role === "admin";
  const canPlan =
    canGovern || identity?.role === "manager";
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/portfolio/resources${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as ResourceData & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "资源容量数据加载失败");
      }
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "资源容量数据加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const availableProjects = useMemo(() => {
    const rows = data?.projectCatalog ?? [];
    return identity?.role === "manager"
      ? rows.filter((project) => project.ownerEmail === identity.email)
      : rows;
  }, [data?.projectCatalog, identity]);
  const selectedProject = data?.projectCatalog.find(
    (project) => project.id === allocationDraft?.projectId,
  );
  const exportUrl = `/api/portfolio/resources?${[
    queryString,
    "format=csv",
  ]
    .filter(Boolean)
    .join("&")}`;

  function updateFilter(name: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function openResource(resource?: ResourceCatalog) {
    setMessage("");
    setResourceDraft(
      resource
        ? {
            id: resource.id,
            name: resource.name,
            resourceType: resource.resourceType,
            org: resource.org,
            capacityHoursPerWeek: resource.capacityHoursPerWeek,
            active: resource.active,
          }
        : emptyResourceDraft(),
    );
  }

  function openAllocation(allocation?: Allocation, status?: "confirmed") {
    setMessage("");
    setPreview(null);
    setAllocationDraft(
      allocation
        ? {
            id: allocation.id,
            resourceId: String(allocation.resourceId),
            projectId: allocation.projectId,
            milestoneId: allocation.milestoneId
              ? String(allocation.milestoneId)
              : "",
            role: allocation.role,
            startDate: allocation.startDate,
            endDate: allocation.endDate,
            hoursPerWeek: allocation.hoursPerWeek,
            status: status ?? (allocation.status === "confirmed" ? "confirmed" : "planned"),
            note: allocation.note,
            overrideReason: allocation.overrideReason,
          }
        : emptyAllocationDraft(),
    );
  }

  function allocationPayload(draft: AllocationDraft) {
    return {
      resourceId: Number(draft.resourceId),
      projectId: draft.projectId,
      milestoneId: draft.milestoneId ? Number(draft.milestoneId) : null,
      role: draft.role,
      startDate: draft.startDate,
      endDate: draft.endDate,
      hoursPerWeek: draft.hoursPerWeek,
      status: draft.status,
      note: draft.note,
      overrideReason: draft.overrideReason,
    };
  }

  async function saveResource(event: React.FormEvent) {
    event.preventDefault();
    if (!resourceDraft) return;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(
        resourceDraft.id
          ? `/api/resources/${resourceDraft.id}`
          : "/api/resources",
        {
          method: resourceDraft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(resourceDraft),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "资源保存失败");
      }
      setResourceDraft(null);
      setMessage(resourceDraft.id ? "资源信息已更新。" : "资源已加入资源池。");
      await loadData();
    } catch (saveError) {
      setMessage(
        saveError instanceof Error ? saveError.message : "资源保存失败",
      );
    } finally {
      setWorking(false);
    }
  }

  async function previewAllocation() {
    if (!allocationDraft) return null;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/resource-allocations/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(allocationPayload(allocationDraft)),
      });
      const result = (await response.json()) as PreviewResult;
      if (!response.ok) {
        throw new Error(result.error || "容量预检失败");
      }
      setPreview(result);
      return result;
    } catch (previewError) {
      setMessage(
        previewError instanceof Error
          ? previewError.message
          : "容量预检失败",
      );
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function saveAllocation(event: React.FormEvent) {
    event.preventDefault();
    if (!allocationDraft) return;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(
        allocationDraft.id
          ? `/api/resource-allocations/${allocationDraft.id}`
          : "/api/resource-allocations",
        {
          method: allocationDraft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(allocationPayload(allocationDraft)),
        },
      );
      const result = (await response.json()) as PreviewResult & {
        error?: string;
      };
      if (!response.ok) {
        if (result.conflicts) setPreview(result);
        throw new Error(result.error || "资源分配保存失败");
      }
      setAllocationDraft(null);
      setPreview(null);
      setMessage("资源分配已保存并重新计算容量。");
      await loadData();
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "资源分配保存失败",
      );
    } finally {
      setWorking(false);
    }
  }

  async function cancelAllocation(allocation: Allocation) {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/resource-allocations/${allocation.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "取消分配失败");
      }
      setMessage("资源分配已取消。");
      await loadData();
    } catch (cancelError) {
      setMessage(
        cancelError instanceof Error
          ? cancelError.message
          : "取消分配失败",
      );
    } finally {
      setWorking(false);
    }
  }

  function canEditAllocation(allocation: Allocation) {
    if (canGovern) return allocation.status !== "cancelled";
    const project = data?.projectCatalog.find(
      (item) => item.id === allocation.projectId,
    );
    return (
      allocation.status === "planned" &&
      identity?.role === "manager" &&
      project?.ownerEmail === identity.email
    );
  }

  return (
    <div className="workspace-page resource-page">
      {header}
      <div className="page-content">
        <section className="content-card resource-filter-bar">
          <div>
            <span className="analytics-kicker">RESOURCE CAPACITY</span>
            <h2>跨项目资源容量与冲突</h2>
            <p>
              按周汇总已确认与计划中投入，提前发现人员、团队、供应商和环境超配
            </p>
          </div>
          <div className="resource-actions">
            {canGovern && (
              <button className="outline-button" onClick={() => openResource()}>
                + 新增资源
              </button>
            )}
            {canPlan && (
              <button className="primary-button" onClick={() => openAllocation()}>
                + 新增分配
              </button>
            )}
            <a className="outline-button resource-export" href={exportUrl}>
              导出容量报表
            </a>
          </div>
        </section>

        <section className="content-card resource-filter-controls">
          <select
            aria-label="观察周期"
            value={filters.weeks}
            onChange={(event) => updateFilter("weeks", event.target.value)}
          >
            <option value="8">未来8周</option>
            <option value="12">未来12周</option>
            <option value="16">未来16周</option>
            <option value="26">未来26周</option>
          </select>
          <select
            aria-label="资源组织"
            value={filters.resourceOrg}
            onChange={(event) =>
              updateFilter("resourceOrg", event.target.value)
            }
          >
            <option value="">全部资源组织</option>
            {(data?.filterOptions.resourceOrgs ?? []).map((org) => (
              <option key={org}>{org}</option>
            ))}
          </select>
          <select
            aria-label="资源类型"
            value={filters.resourceType}
            onChange={(event) =>
              updateFilter("resourceType", event.target.value)
            }
          >
            <option value="">全部资源类型</option>
            {(data?.filterOptions.resourceTypes ?? []).map((type) => (
              <option key={type} value={type}>
                {resourceTypeNames[type]}
              </option>
            ))}
          </select>
          <select
            aria-label="项目组织"
            value={filters.projectOrg}
            onChange={(event) =>
              updateFilter("projectOrg", event.target.value)
            }
          >
            <option value="">全部项目组织</option>
            {(data?.filterOptions.projectOrgs ?? []).map((org) => (
              <option key={org}>{org}</option>
            ))}
          </select>
          <select
            aria-label="冲突状态"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">全部负载状态</option>
            <option value="conflict">仅超配冲突</option>
            <option value="warning">仅接近满载</option>
          </select>
          <button
            className="text-button"
            disabled={!Object.values(filters).some((value) => value && value !== "12")}
            onClick={() =>
              setFilters({
                weeks: "12",
                resourceOrg: "",
                resourceType: "",
                projectOrg: "",
                projectType: "",
                status: "",
              })
            }
          >
            重置筛选
          </button>
        </section>

        {error && (
          <div className="analytics-error" role="alert">
            <span>!</span>
            <div>
              <strong>暂时无法取得资源容量数据</strong>
              <p>{error}</p>
            </div>
            <button className="outline-button" onClick={() => void loadData()}>
              重新加载
            </button>
          </div>
        )}
        {message && (
          <div
            className={
              message.includes("失败") ||
              message.includes("不能") ||
              message.includes("请选择") ||
              message.includes("超配")
                ? "form-error"
                : "success-message"
            }
          >
            {message}
          </div>
        )}

        {loading && !data ? (
          <div className="analytics-loading">正在计算跨项目资源负载…</div>
        ) : (
          <>
            <div className="resource-summary">
              <article>
                <small>纳入容量分析</small>
                <strong>{data?.summary.resourceCount ?? 0}</strong>
                <span>个启用资源</span>
              </article>
              <article className={(data?.summary.conflictResourceCount ?? 0) > 0 ? "red" : ""}>
                <small>超配资源</small>
                <strong>{data?.summary.conflictResourceCount ?? 0}</strong>
                <span>{data?.summary.conflictWeekCount ?? 0} 个资源周冲突</span>
              </article>
              <article className={(data?.summary.warningResourceCount ?? 0) > 0 ? "yellow" : ""}>
                <small>接近满载</small>
                <strong>{data?.summary.warningResourceCount ?? 0}</strong>
                <span>利用率达到 85%</span>
              </article>
              <article>
                <small>计划与确认分配</small>
                <strong>{data?.summary.allocationCount ?? 0}</strong>
                <span>条有效资源分配</span>
              </article>
              <article className={(data?.summary.peakUtilization ?? 0) > 100 ? "red" : ""}>
                <small>峰值利用率</small>
                <strong>
                  {data?.summary.peakUtilization ?? 0}
                  <em>%</em>
                </strong>
                <span>观察窗口内单周峰值</span>
              </article>
            </div>

            <section className="content-card resource-heatmap-card">
              <div className="card-title">
                <div>
                  <h2>资源 × 周容量热力图</h2>
                  <p>
                    单元格同时计入计划中与已确认投入；点击查看构成
                  </p>
                </div>
                <div className="capacity-legend">
                  <span className="idle">— 空闲</span>
                  <span className="healthy">● 正常</span>
                  <span className="warning">▲ ≥85%</span>
                  <span className="conflict">■ &gt;100%</span>
                </div>
              </div>
              <div className="resource-heatmap-scroll">
                <div
                  className="resource-heatmap"
                  style={{
                    "--resource-weeks": data?.range.weeks ?? 12,
                  } as React.CSSProperties}
                >
                  <div className="resource-heatmap-head">
                    <span>资源 / 周容量</span>
                    {(data?.range.columns ?? []).map((week) => (
                      <span key={week.weekKey}>
                        <b>{week.weekKey.slice(-3)}</b>
                        <small>{week.label}</small>
                      </span>
                    ))}
                  </div>
                  {(data?.resources ?? []).map((resource) => (
                    <div className="resource-heatmap-row" key={resource.id}>
                      <button
                        className="resource-identity"
                        onClick={() => canGovern && openResource(resource)}
                      >
                        <span className={`resource-type ${resource.resourceType}`}>
                          {resourceTypeNames[resource.resourceType][0]}
                        </span>
                        <span>
                          <strong>{resource.name}</strong>
                          <small>
                            {resource.org} · {resource.capacityHoursPerWeek}h/周
                          </small>
                        </span>
                      </button>
                      {resource.weeks.map((week) => (
                        <button
                          className={`capacity-cell ${week.status}`}
                          key={`${resource.id}-${week.weekKey}`}
                          aria-label={`${resource.name} ${week.weekKey} ${capacityStatusNames[week.status]} 利用率${week.utilization}%`}
                          onClick={() => setSelectedCell({ resource, week })}
                        >
                          <strong>
                            {week.status === "idle" ? "—" : `${week.utilization}%`}
                          </strong>
                          <small>
                            {week.totalHours}/{week.capacityHours}h
                          </small>
                        </button>
                      ))}
                    </div>
                  ))}
                  {!data?.resources.length && (
                    <div className="resource-empty">
                      当前筛选条件下暂无启用资源
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="resource-detail-grid">
              <section className="content-card resource-conflict-card">
                <div className="card-title">
                  <div>
                    <h2>超配冲突排行</h2>
                    <p>按利用率和超配工时排序</p>
                  </div>
                  <span className="count-badge">
                    {data?.conflicts.length ?? 0} 项
                  </span>
                </div>
                <div className="resource-conflict-list">
                  {(data?.conflicts ?? []).slice(0, 10).map((conflict, index) => (
                    <article key={`${conflict.resourceId}-${conflict.weekKey}`}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <span>
                        <strong>{conflict.resourceName}</strong>
                        <small>
                          {conflict.resourceOrg} · {conflict.weekKey}
                        </small>
                      </span>
                      <span>
                        {[...new Set(conflict.allocations.map((item) => item.projectName))]
                          .slice(0, 2)
                          .join("、")}
                      </span>
                      <b>{conflict.utilization}%</b>
                      <em>超 {conflict.overallocatedHours}h</em>
                    </article>
                  ))}
                  {!data?.conflicts.length && (
                    <div className="analytics-empty">当前窗口无超配冲突</div>
                  )}
                </div>
              </section>

              <section className="content-card resource-pool-card">
                <div className="card-title">
                  <div>
                    <h2>资源池</h2>
                    <p>容量、类型与启停状态</p>
                  </div>
                  {canGovern && (
                    <button className="text-button" onClick={() => openResource()}>
                      新增
                    </button>
                  )}
                </div>
                <div className="resource-pool-list">
                  {(data?.resourceCatalog ?? []).slice(0, 14).map((resource) => (
                    <button
                      key={resource.id}
                      disabled={!canGovern}
                      onClick={() => openResource(resource)}
                    >
                      <span className={`resource-type ${resource.resourceType}`}>
                        {resourceTypeNames[resource.resourceType][0]}
                      </span>
                      <span>
                        <strong>{resource.name}</strong>
                        <small>{resource.org}</small>
                      </span>
                      <b>{resource.capacityHoursPerWeek}h/周</b>
                      <em className={resource.active ? "active" : "inactive"}>
                        {resource.active ? "启用" : "停用"}
                      </em>
                    </button>
                  ))}
                  {!data?.resourceCatalog.length && (
                    <div className="analytics-empty">尚未建立资源池</div>
                  )}
                </div>
              </section>
            </div>

            <section className="content-card allocation-ledger">
              <div className="card-title">
                <div>
                  <h2>资源分配台账</h2>
                  <p>
                    项目经理提交计划，PMO确认；超配确认必须留存说明
                  </p>
                </div>
                {canPlan && (
                  <button className="primary-button" onClick={() => openAllocation()}>
                    新增分配
                  </button>
                )}
              </div>
              <div className="allocation-head">
                <span>资源</span>
                <span>项目 / 节点</span>
                <span>承担角色</span>
                <span>日期范围</span>
                <span>每周投入</span>
                <span>状态</span>
                <span />
              </div>
              <div className="allocation-list">
                {(data?.allocations ?? []).slice(0, 40).map((allocation) => (
                  <div key={allocation.id}>
                    <span>
                      <strong>{allocation.resourceName}</strong>
                      <small>{allocation.resourceOrg}</small>
                    </span>
                    <button onClick={() => onOpenProject(allocation.projectId)}>
                      <strong>
                        {allocation.projectCode} · {allocation.projectName}
                      </strong>
                      <small>{allocation.milestoneName ?? "项目级分配"}</small>
                    </button>
                    <span>{allocation.role}</span>
                    <span>
                      {allocation.startDate}
                      <small>至 {allocation.endDate}</small>
                    </span>
                    <b>{allocation.hoursPerWeek}h</b>
                    <em className={allocation.status}>
                      {allocationStatusNames[allocation.status]}
                    </em>
                    <span className="allocation-row-actions">
                      {canGovern && allocation.status === "planned" && (
                        <button onClick={() => openAllocation(allocation, "confirmed")}>
                          确认
                        </button>
                      )}
                      {canEditAllocation(allocation) && (
                        <button onClick={() => openAllocation(allocation)}>
                          编辑
                        </button>
                      )}
                      {canEditAllocation(allocation) && (
                        <button
                          className="danger"
                          disabled={working}
                          onClick={() => void cancelAllocation(allocation)}
                        >
                          取消
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {!data?.allocations.length && (
                  <div className="analytics-empty">当前窗口暂无资源分配</div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {selectedCell && (
        <div className="modal-backdrop" onClick={() => setSelectedCell(null)}>
          <section className="create-modal capacity-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCell(null)}>
              ×
            </button>
            <span className="modal-kicker">CAPACITY DETAIL</span>
            <h2>{selectedCell.resource.name}</h2>
            <p>
              {selectedCell.week.weekKey} · 利用率 {selectedCell.week.utilization}% ·{" "}
              {selectedCell.week.totalHours}/{selectedCell.week.capacityHours}h
            </p>
            <div className="capacity-composition">
              <div>
                <span>已确认</span>
                <strong>{selectedCell.week.confirmedHours}h</strong>
              </div>
              <div>
                <span>计划中</span>
                <strong>{selectedCell.week.plannedHours}h</strong>
              </div>
              <div>
                <span>剩余/超配</span>
                <strong>
                  {selectedCell.week.capacityHours - selectedCell.week.totalHours}h
                </strong>
              </div>
            </div>
            <div className="capacity-allocation-list">
              {selectedCell.week.allocations.map((allocation) => (
                <button
                  key={allocation.id}
                  onClick={() => onOpenProject(allocation.projectId)}
                >
                  <span>
                    <strong>
                      {allocation.projectCode} · {allocation.projectName}
                    </strong>
                    <small>
                      {allocation.milestoneName ?? "项目级"} · {allocation.role}
                    </small>
                  </span>
                  <b>{allocation.hours}h</b>
                  <em>{allocationStatusNames[allocation.status]}</em>
                </button>
              ))}
              {!selectedCell.week.allocations.length && <p>本周无分配</p>}
            </div>
          </section>
        </div>
      )}

      {resourceDraft && (
        <div className="modal-backdrop" onClick={() => setResourceDraft(null)}>
          <section className="create-modal resource-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setResourceDraft(null)}>
              ×
            </button>
            <span className="modal-kicker">RESOURCE POOL</span>
            <h2>{resourceDraft.id ? "编辑资源" : "新增资源"}</h2>
            <p>定义共享资源及其每周可投入容量。</p>
            <form onSubmit={saveResource}>
              <div className="modal-form-grid">
                <label>
                  资源名称
                  <input
                    required
                    value={resourceDraft.name}
                    onChange={(event) =>
                      setResourceDraft((draft) =>
                        draft ? { ...draft, name: event.target.value } : draft,
                      )
                    }
                  />
                </label>
                <label>
                  资源类型
                  <select
                    value={resourceDraft.resourceType}
                    onChange={(event) =>
                      setResourceDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              resourceType: event.target.value as ResourceType,
                            }
                          : draft,
                      )
                    }
                  >
                    {Object.entries(resourceTypeNames).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  所属组织
                  <input
                    required
                    value={resourceDraft.org}
                    onChange={(event) =>
                      setResourceDraft((draft) =>
                        draft ? { ...draft, org: event.target.value } : draft,
                      )
                    }
                  />
                </label>
                <label>
                  每周容量（小时）
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="0.5"
                    required
                    value={resourceDraft.capacityHoursPerWeek}
                    onChange={(event) =>
                      setResourceDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              capacityHoursPerWeek: Number(event.target.value),
                            }
                          : draft,
                      )
                    }
                  />
                </label>
              </div>
              {resourceDraft.id && (
                <label className="template-check">
                  <input
                    type="checkbox"
                    checked={resourceDraft.active}
                    onChange={(event) =>
                      setResourceDraft((draft) =>
                        draft
                          ? { ...draft, active: event.target.checked }
                          : draft,
                      )
                    }
                  />
                  <span>资源启用</span>
                </label>
              )}
              <div className="modal-actions">
                <button type="button" className="outline-button" onClick={() => setResourceDraft(null)}>
                  取消
                </button>
                <button className="primary-button" disabled={working}>
                  {working ? "保存中…" : "保存资源"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {allocationDraft && (
        <div className="modal-backdrop" onClick={() => setAllocationDraft(null)}>
          <section className="create-modal allocation-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAllocationDraft(null)}>
              ×
            </button>
            <span className="modal-kicker">RESOURCE ALLOCATION</span>
            <h2>{allocationDraft.id ? "调整资源分配" : "新增资源分配"}</h2>
            <p>保存前可预检整个日期范围内的周容量冲突。</p>
            <form onSubmit={saveAllocation}>
              <div className="modal-form-grid">
                <label>
                  资源
                  <select
                    required
                    value={allocationDraft.resourceId}
                    onChange={(event) => {
                      setPreview(null);
                      setAllocationDraft((draft) =>
                        draft ? { ...draft, resourceId: event.target.value } : draft,
                      );
                    }}
                  >
                    <option value="">请选择资源</option>
                    {(data?.resourceCatalog ?? [])
                      .filter((resource) => resource.active)
                      .map((resource) => (
                        <option value={resource.id} key={resource.id}>
                          {resource.org} · {resource.name}（{resource.capacityHoursPerWeek}h）
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  项目
                  <select
                    required
                    value={allocationDraft.projectId}
                    onChange={(event) => {
                      setPreview(null);
                      setAllocationDraft((draft) =>
                        draft
                          ? { ...draft, projectId: event.target.value, milestoneId: "" }
                          : draft,
                      );
                    }}
                  >
                    <option value="">请选择项目</option>
                    {availableProjects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  关联节点
                  <select
                    value={allocationDraft.milestoneId}
                    onChange={(event) =>
                      setAllocationDraft((draft) =>
                        draft ? { ...draft, milestoneId: event.target.value } : draft,
                      )
                    }
                  >
                    <option value="">项目级分配</option>
                    {(selectedProject?.milestones ?? []).map((milestone) => (
                      <option value={milestone.id} key={milestone.id}>
                        {milestone.sequence}. {milestone.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  承担角色
                  <input
                    required
                    placeholder="如：架构师、测试团队、UAT环境"
                    value={allocationDraft.role}
                    onChange={(event) =>
                      setAllocationDraft((draft) =>
                        draft ? { ...draft, role: event.target.value } : draft,
                      )
                    }
                  />
                </label>
                <label>
                  开始日期
                  <input
                    type="date"
                    required
                    value={allocationDraft.startDate}
                    onChange={(event) => {
                      setPreview(null);
                      setAllocationDraft((draft) =>
                        draft ? { ...draft, startDate: event.target.value } : draft,
                      );
                    }}
                  />
                </label>
                <label>
                  结束日期
                  <input
                    type="date"
                    required
                    value={allocationDraft.endDate}
                    onChange={(event) => {
                      setPreview(null);
                      setAllocationDraft((draft) =>
                        draft ? { ...draft, endDate: event.target.value } : draft,
                      );
                    }}
                  />
                </label>
                <label>
                  每周投入（小时）
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="0.5"
                    required
                    value={allocationDraft.hoursPerWeek}
                    onChange={(event) => {
                      setPreview(null);
                      setAllocationDraft((draft) =>
                        draft
                          ? { ...draft, hoursPerWeek: Number(event.target.value) }
                          : draft,
                      );
                    }}
                  />
                </label>
                {canGovern && (
                  <label>
                    分配状态
                    <select
                      value={allocationDraft.status}
                      onChange={(event) => {
                        setPreview(null);
                        setAllocationDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                status: event.target.value as "planned" | "confirmed",
                              }
                            : draft,
                        );
                      }}
                    >
                      <option value="planned">计划中</option>
                      <option value="confirmed">已确认</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="promotion-description">
                备注
                <textarea
                  value={allocationDraft.note}
                  onChange={(event) =>
                    setAllocationDraft((draft) =>
                      draft ? { ...draft, note: event.target.value } : draft,
                    )
                  }
                  placeholder="工作内容、交付边界或资源使用说明"
                />
              </label>
              {preview?.overCapacity && allocationDraft.status === "confirmed" && (
                <label className="promotion-description conflict-reason">
                  超配确认说明
                  <textarea
                    required
                    minLength={10}
                    value={allocationDraft.overrideReason}
                    onChange={(event) =>
                      setAllocationDraft((draft) =>
                        draft
                          ? { ...draft, overrideReason: event.target.value }
                          : draft,
                      )
                    }
                    placeholder="说明超配原因、协调结论、缓解措施和授权依据"
                  />
                </label>
              )}
              {preview && (
                <div className={`allocation-preview ${preview.overCapacity ? "conflict" : "safe"}`}>
                  <strong>
                    {preview.overCapacity
                      ? `发现 ${preview.conflicts.length} 个超配资源周`
                      : "容量预检通过"}
                  </strong>
                  <p>
                    {preview.overCapacity
                      ? preview.conflicts
                          .slice(0, 3)
                          .map(
                            (conflict) =>
                              `${conflict.weekKey} ${conflict.utilization}%（超${conflict.overallocatedHours}h）`,
                          )
                          .join("；")
                      : "当前日期范围和投入工时未使该资源超过周容量。"}
                  </p>
                </div>
              )}
              <div className="modal-actions allocation-modal-actions">
                <button type="button" className="outline-button" disabled={working} onClick={() => void previewAllocation()}>
                  {working ? "计算中…" : "容量预检"}
                </button>
                <button type="button" className="outline-button" onClick={() => setAllocationDraft(null)}>
                  取消
                </button>
                <button className="primary-button" disabled={working}>
                  {working ? "保存中…" : "保存分配"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
