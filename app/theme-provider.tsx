"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] =
    useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [ready, setReady] = useState(false);
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event?: MediaQueryListEvent) =>
      setSystemPrefersDark(event?.matches ?? media.matches);
    const syncStoredPreference = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setPreference(normalizeThemePreference(event.newValue));
      }
    };
    const timer = window.setTimeout(() => {
      syncSystemTheme();
      try {
        setPreference(
          normalizeThemePreference(
            window.localStorage.getItem(THEME_STORAGE_KEY),
          ),
        );
      } catch {
        setPreference("system");
      }
      setReady(true);
    }, 0);
    media.addEventListener("change", syncSystemTheme);
    window.addEventListener("storage", syncStoredPreference);
    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", syncSystemTheme);
      window.removeEventListener("storage", syncStoredPreference);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeMeta?.setAttribute(
      "content",
      resolvedTheme === "dark" ? "#07131f" : "#eef4f9",
    );
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // The active tab still keeps the selected theme when storage is blocked.
    }
  }, [preference, ready, resolvedTheme]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme],
  );
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}

export function ThemeControl({
  surface,
}: {
  surface: "cockpit" | "workspace";
}) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const icon = resolvedTheme === "dark" ? "◐" : "◑";
  return (
    <label
      className={`theme-control theme-${surface}`}
      title={`当前${resolvedTheme === "dark" ? "深色" : "浅色"}主题`}
    >
      <span aria-hidden="true">{icon}</span>
      <select
        aria-label="显示主题"
        value={preference}
        onChange={(event) =>
          setPreference(event.target.value as ThemePreference)
        }
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>
  );
}
