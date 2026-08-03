"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type PlanStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "delayed"
  | "cancelled";

type PlanTask = {
  id: number;
  projectId: string;
  weekKey: string;
  taskDescription: string;
  owner: string;
  participants: string;
  plannedStart: string;
  plannedFinish: string;
  workdays: number;
  actualFinish: string | null;
  status: PlanStatus;
  tracking: string;
  remark: string;
  sequence: number;
  updatedAt: string;
};

type RollingWeek = {
  weekKey: string;
  label: "本周" | "下周";
  startDate: string;
  endDate: string;
  dateLabel: string;
};

type ProjectOption = {
  id: string;
  name: string;
  owner: string;
  lifecycleStatus?: "active" | "completed" | "archived";
};

type TaskDraft = Omit<
  PlanTask,
  "id" | "projectId" | "updatedAt"
>;

const statusCopy: Record<PlanStatus, string> = {
  pending: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  delayed: "延期",
  cancelled: "已取消",
};

function initialDraft(week: RollingWeek, owner: string, sequence: number): TaskDraft {
  return {
    weekKey: week.weekKey,
    taskDescription: "",
    owner,
    participants: "",
    plannedStart: week.startDate,
    plannedFinish: week.endDate,
    workdays: 5,
    actualFinish: null,
    status: "pending",
    tracking: "",
    remark: "",
    sequence,
  };
}

export default function BiweeklyPlan({
  header,
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenProject,
}: {
  header: ReactNode;
  projects: ProjectOption[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [weeks, setWeeks] = useState<RollingWeek[]>([]);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const currentProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const projectId = currentProject?.id ?? "";

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/biweekly-plans`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        weeks?: RollingWeek[];
        tasks?: PlanTask[];
        canWrite?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "双周滚动计划读取失败");
      setWeeks(result.weeks ?? []);
      setTasks(result.tasks ?? []);
      setCanWrite(Boolean(result.canWrite));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "双周滚动计划读取失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const grouped = useMemo(
    () =>
      weeks.map((week) => ({
        week,
        tasks: tasks
          .filter((task) => task.weekKey === week.weekKey)
          .sort((left, right) => left.sequence - right.sequence || left.id - right.id),
      })),
    [tasks, weeks],
  );
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const delayedCount = tasks.filter((task) => task.status === "delayed").length;
  const currentWeek = weeks[0];

  function openCreate(week: RollingWeek) {
    setEditingId(null);
    setDraft(
      initialDraft(
        week,
        currentProject?.owner ?? "",
        tasks.filter((task) => task.weekKey === week.weekKey).length + 1,
      ),
    );
    setError("");
    setMessage("");
  }

  function openEdit(task: PlanTask) {
    setEditingId(task.id);
    setDraft({
      weekKey: task.weekKey,
      taskDescription: task.taskDescription,
      owner: task.owner,
      participants: task.participants,
      plannedStart: task.plannedStart,
      plannedFinish: task.plannedFinish,
      workdays: task.workdays,
      actualFinish: task.actualFinish,
      status: task.status,
      tracking: task.tracking,
      remark: task.remark,
      sequence: task.sequence,
    });
    setError("");
    setMessage("");
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !projectId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId
          ? `/api/biweekly-plan-tasks/${editingId}`
          : `/api/projects/${encodeURIComponent(projectId)}/biweekly-plans`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "任务保存失败");
      setDraft(null);
      setEditingId(null);
      setMessage(editingId ? "任务已更新。" : "任务已加入双周滚动计划。");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "任务保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(task: PlanTask) {
    if (!window.confirm(`确认删除“${task.taskDescription}”吗？`)) return;
    const response = await fetch(`/api/biweekly-plan-tasks/${task.id}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error || "任务删除失败");
      return;
    }
    setMessage("任务已删除。");
    await load();
  }

  return (
    <>
      {header}
      <div className="page-content biweekly-page">
        <section className="biweekly-hero">
          <div>
            <span className="page-kicker">BIWEEKLY ROLLING PLAN</span>
            <h2>双周滚动计划</h2>
            <p>以 UTC+8 自然周为口径，连续维护本周执行情况和下周工作安排。</p>
          </div>
          <label className="biweekly-project-select">
            项目
            <select value={projectId} onChange={(event) => onSelectProject(event.target.value)}>
              {projects
                .filter((project) => (project.lifecycleStatus ?? "active") !== "archived")
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.id} · {project.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="outline-button" onClick={() => onOpenProject(projectId)}>
            项目详情
          </button>
        </section>

        <section className="biweekly-summary">
          <article><small>双周任务</small><strong>{tasks.length}</strong><span>当前滚动窗口</span></article>
          <article><small>本周完成率</small><strong>{currentWeek ? Math.round((tasks.filter((task) => task.weekKey === currentWeek.weekKey && task.status === "completed").length / Math.max(1, tasks.filter((task) => task.weekKey === currentWeek.weekKey).length)) * 100) : 0}%</strong><span>按任务数统计</span></article>
          <article className="success"><small>已完成</small><strong>{completedCount}</strong><span>含提前完成</span></article>
          <article className="danger"><small>延期任务</small><strong>{delayedCount}</strong><span>需补充跟踪情况</span></article>
        </section>

        {message && <div className="form-success">✓ {message}</div>}
        {error && <div className="form-error">{error}</div>}
        {loading ? (
          <section className="content-card"><div className="empty-state">正在加载双周滚动计划…</div></section>
        ) : (
          grouped.map(({ week, tasks: weekTasks }) => (
            <section className="content-card biweekly-section" key={week.weekKey}>
              <header>
                <div><span>{week.label}</span><h3>{week.label}计划及完成情况</h3><p>{week.weekKey} · {week.dateLabel}</p></div>
                {canWrite && <button className="primary-button" onClick={() => openCreate(week)}>＋ 新增任务</button>}
              </header>
              <div className="biweekly-table-wrap">
                <table className="biweekly-table">
                  <thead><tr><th>序号</th><th>任务描述</th><th>负责人</th><th>相关参加人员</th><th>计划开始</th><th>计划结束</th><th>周期<br/>（工作日）</th><th>实际结束</th><th>完成状况</th><th>跟踪情况</th><th>备注</th>{canWrite && <th>操作</th>}</tr></thead>
                  <tbody>
                    {weekTasks.length ? weekTasks.map((task, index) => (
                      <tr key={task.id} className={task.status === "delayed" ? "delayed" : ""}>
                        <td>{index + 1}</td><td><strong>{task.taskDescription}</strong></td><td>{task.owner}</td><td>{task.participants || "—"}</td><td>{task.plannedStart.slice(5)}</td><td>{task.plannedFinish.slice(5)}</td><td>{task.workdays}</td><td>{task.actualFinish?.slice(5) || "—"}</td><td><span className={`plan-status ${task.status}`}>{statusCopy[task.status]}</span></td><td>{task.tracking || "—"}</td><td>{task.remark || "—"}</td>{canWrite && <td><button className="text-button" onClick={() => openEdit(task)}>编辑</button><button className="text-button danger" onClick={() => void deleteTask(task)}>删除</button></td>}
                      </tr>
                    )) : <tr><td colSpan={canWrite ? 12 : 11}><div className="empty-state">{week.label}暂无任务{canWrite ? "，可点击右上角新增。" : "。"}</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="biweekly-mobile-list">
                {weekTasks.map((task, index) => <article key={task.id} className={task.status === "delayed" ? "delayed" : ""}><header><b>{index + 1}</b><span className={`plan-status ${task.status}`}>{statusCopy[task.status]}</span></header><h4>{task.taskDescription}</h4><p>{task.owner} · {task.participants || "无参加人员"}</p><dl><div><dt>计划</dt><dd>{task.plannedStart.slice(5)}—{task.plannedFinish.slice(5)} · {task.workdays}工作日</dd></div><div><dt>跟踪</dt><dd>{task.tracking || "暂无跟踪记录"}</dd></div></dl>{canWrite && <footer><button onClick={() => openEdit(task)}>编辑</button><button onClick={() => void deleteTask(task)}>删除</button></footer>}</article>)}
              </div>
            </section>
          ))
        )}
      </div>

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <section className="create-modal biweekly-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setDraft(null)}>×</button>
            <span className="modal-kicker">{editingId ? "EDIT TASK" : "NEW TASK"}</span>
            <h2>{editingId ? "编辑滚动计划任务" : "新增滚动计划任务"}</h2>
            <p>{weeks.find((week) => week.weekKey === draft.weekKey)?.label} · {draft.weekKey}</p>
            <form onSubmit={saveTask}>
              <label className="biweekly-task-description">任务描述<textarea required value={draft.taskDescription} onChange={(event) => setDraft({ ...draft, taskDescription: event.target.value })} placeholder="说明本周或下周要交付的具体工作成果" /></label>
              <div className="modal-form-grid">
                <label>计划周期<select value={draft.weekKey} onChange={(event) => { const week = weeks.find((item) => item.weekKey === event.target.value)!; setDraft({ ...draft, weekKey: week.weekKey, plannedStart: week.startDate, plannedFinish: week.endDate }); }}>{weeks.map((week) => <option key={week.weekKey} value={week.weekKey}>{week.label} · {week.dateLabel}</option>)}</select></label>
                <label>完成状况<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlanStatus })}>{Object.entries(statusCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>负责人<input required value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} /></label>
                <label>相关参加人员<input value={draft.participants} onChange={(event) => setDraft({ ...draft, participants: event.target.value })} placeholder="多人以顿号或逗号分隔" /></label>
                <label>计划开始时间<input type="date" required value={draft.plannedStart} onChange={(event) => setDraft({ ...draft, plannedStart: event.target.value })} /></label>
                <label>计划结束时间<input type="date" required value={draft.plannedFinish} onChange={(event) => setDraft({ ...draft, plannedFinish: event.target.value })} /></label>
                <label>周期（工作日）<input type="number" min="0.1" max="31" step="0.1" required value={draft.workdays} onChange={(event) => setDraft({ ...draft, workdays: Number(event.target.value) })} /></label>
                <label>实际结束时间<input type="date" value={draft.actualFinish ?? ""} onChange={(event) => setDraft({ ...draft, actualFinish: event.target.value || null })} required={draft.status === "completed"} /></label>
              </div>
              <label>跟踪情况<textarea value={draft.tracking} onChange={(event) => setDraft({ ...draft, tracking: event.target.value })} placeholder="记录进展、卡点、协调事项和下一步动作" /></label>
              <label>备注<textarea value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></label>
              {error && <div className="form-error">{error}</div>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setDraft(null)}>取消</button><button className="primary-button" disabled={saving}>{saving ? "正在保存…" : "保存任务"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
