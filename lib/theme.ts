export const THEME_STORAGE_KEY = "shuzhi-color-scheme-v1";
export const FONT_SCALE_STORAGE_KEY = "shuzhi-font-scale-v1";
export const DEFAULT_FONT_SCALE = 1.1;
export const FONT_SCALE_OPTIONS = [1, 1.1, 1.2, 1.3, 1.4] as const;

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type FontScale = (typeof FONT_SCALE_OPTIONS)[number];

export function normalizeFontScale(value: unknown): FontScale {
  const numeric = Number(value);
  return FONT_SCALE_OPTIONS.includes(numeric as FontScale)
    ? (numeric as FontScale)
    : DEFAULT_FONT_SCALE;
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
