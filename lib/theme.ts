export const THEME_STORAGE_KEY = "shuzhi-color-scheme-v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

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
