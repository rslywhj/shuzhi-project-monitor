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
  DEFAULT_FONT_SCALE,
  FONT_SCALE_OPTIONS,
  FONT_SCALE_STORAGE_KEY,
  normalizeThemePreference,
  normalizeFontScale,
  resolveTheme,
  THEME_STORAGE_KEY,
  type FontScale,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  fontScale: FontScale;
  setPreference: (preference: ThemePreference) => void;
  setFontScale: (fontScale: FontScale) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] =
    useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [fontScale, setFontScale] = useState<FontScale>(DEFAULT_FONT_SCALE);
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
      if (event.key === FONT_SCALE_STORAGE_KEY) {
        setFontScale(normalizeFontScale(event.newValue));
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
        setFontScale(
          normalizeFontScale(
            window.localStorage.getItem(FONT_SCALE_STORAGE_KEY),
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
    document.documentElement.style.setProperty(
      "--ui-font-scale",
      String(fontScale),
    );
    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeMeta?.setAttribute(
      "content",
      resolvedTheme === "dark" ? "#07131f" : "#eef4f9",
    );
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(fontScale));
    } catch {
      // The active tab still keeps the selected theme when storage is blocked.
    }
  }, [fontScale, preference, ready, resolvedTheme]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, fontScale, setPreference, setFontScale }),
    [fontScale, preference, resolvedTheme],
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
  const { preference, resolvedTheme, fontScale, setPreference, setFontScale } = useTheme();
  const icon = resolvedTheme === "dark" ? "◐" : "◑";
  return (
    <details className={`theme-control display-settings theme-${surface}`}>
      <summary title={`当前${resolvedTheme === "dark" ? "深色" : "浅色"}主题，文字${Math.round(fontScale * 100)}%`}>
        <span aria-hidden="true">{icon}</span>
        <span>显示</span>
        <em>{Math.round(fontScale * 100)}%</em>
      </summary>
      <div className="display-settings-popover">
        <label>
          <span>显示主题</span>
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
        <label>
          <span>文字大小</span>
          <select
            aria-label="文字大小"
            value={fontScale}
            onChange={(event) =>
              setFontScale(normalizeFontScale(event.target.value))
            }
          >
            {FONT_SCALE_OPTIONS.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
        </label>
        <small>设置保存在当前浏览器，并同时应用于管理大屏和工作台。</small>
      </div>
    </details>
  );
}
