export const COCKPIT_SORT_MODES = ["urgency", "default"] as const;

export type CockpitSortMode = (typeof COCKPIT_SORT_MODES)[number];

export const DEFAULT_COCKPIT_SORT_MODE: CockpitSortMode = "urgency";

export function normalizeCockpitSortMode(value: unknown): CockpitSortMode {
  return COCKPIT_SORT_MODES.includes(value as CockpitSortMode)
    ? (value as CockpitSortMode)
    : DEFAULT_COCKPIT_SORT_MODE;
}

export function persistCockpitSortMode(
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void },
  key: string,
  sortMode: CockpitSortMode,
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
  storage.setItem(
    key,
    JSON.stringify({ ...preferences, sortMode: normalizeCockpitSortMode(sortMode) }),
  );
}
