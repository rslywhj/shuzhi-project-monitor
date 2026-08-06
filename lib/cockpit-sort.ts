export const COCKPIT_SORT_FIELDS = ["project", "health"] as const;
export const COCKPIT_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type CockpitSortField = (typeof COCKPIT_SORT_FIELDS)[number];
export type CockpitSortDirection = (typeof COCKPIT_SORT_DIRECTIONS)[number];
export type CockpitSort = {
  field: CockpitSortField;
  direction: CockpitSortDirection;
};

export const DEFAULT_COCKPIT_SORT: CockpitSort = {
  field: "health",
  direction: "asc",
};

export function normalizeCockpitSortPreference(value: unknown): CockpitSort {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const preference = value as Record<string, unknown>;
    const field = COCKPIT_SORT_FIELDS.includes(
      preference.sortField as CockpitSortField,
    )
      ? (preference.sortField as CockpitSortField)
      : null;
    const direction = COCKPIT_SORT_DIRECTIONS.includes(
      preference.sortDirection as CockpitSortDirection,
    )
      ? (preference.sortDirection as CockpitSortDirection)
      : null;
    if (field && direction) return { field, direction };

    // Migrate the former urgency/default dropdown preference.
    if (preference.sortMode === "default") {
      return { field: "project", direction: "asc" };
    }
    if (preference.sortMode === "urgency") return DEFAULT_COCKPIT_SORT;
  }
  return DEFAULT_COCKPIT_SORT;
}

export function nextCockpitSort(
  current: CockpitSort,
  field: CockpitSortField,
): CockpitSort {
  if (current.field !== field) return { field, direction: "asc" };
  return {
    field,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function compareCockpitProjects(
  left: { id?: string; name: string; score: number },
  right: { id?: string; name: string; score: number },
  sort: CockpitSort,
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  const primary =
    sort.field === "health"
      ? left.score - right.score
      : left.name.localeCompare(right.name, "zh-CN");
  return (
    primary * direction ||
    left.name.localeCompare(right.name, "zh-CN") ||
    String(left.id ?? "").localeCompare(String(right.id ?? ""))
  );
}

export function persistCockpitSort(
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  },
  key: string,
  sort: CockpitSort,
) {
  let preferences: Record<string, unknown> = {};
  try {
    const saved = storage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      preferences = parsed as Record<string, unknown>;
    }
  } catch {
    // Replace stale browser preferences with a valid object.
  }
  const { sortMode: _legacySortMode, ...currentPreferences } = preferences;
  void _legacySortMode;
  storage.setItem(
    key,
    JSON.stringify({
      ...currentPreferences,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
  );
}
