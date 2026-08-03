export const THEME_STORAGE_KEY = "shuzhi-color-scheme-v1";
export const FONT_SCALE_STORAGE_KEY = "shuzhi-font-scale-v1";
export const DEFAULT_FONT_SCALE = 1.1;
export const MIN_FONT_SCALE = 1;
export const MAX_FONT_SCALE = 2;
export const FONT_SCALE_STEP = 0.1;

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type FontScale = number;

export function normalizeFontScale(value: unknown): FontScale {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_SCALE;
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, numeric));
  return Number(clamped.toFixed(1));
}

export function normalizeThemePreference(
  value: unknown,
): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  return preference === "system"
    ? systemPrefersDark
      ? "dark"
      : "light"
    : preference;
}
