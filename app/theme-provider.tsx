"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_STORAGE_KEY,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
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
  const scaleLabel = `${fontScale.toFixed(1)}×`;
  const scaleProgress =
    ((fontScale - MIN_FONT_SCALE) / (MAX_FONT_SCALE - MIN_FONT_SCALE)) * 100;
  return (
    <details className={`theme-control display-settings theme-${surface}`}>
      <summary title={`当前${resolvedTheme === "dark" ? "深色" : "浅色"}主题，文字${scaleLabel}`}>
        <span aria-hidden="true">{icon}</span>
        <span>显示</span>
        <em>{scaleLabel}</em>
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
        <label className="display-font-scale-field">
          <span>文字大小 <b>{scaleLabel}</b></span>
          <input
            type="range"
            aria-label="文字大小"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step={FONT_SCALE_STEP}
            value={fontScale}
            style={{ "--font-scale-progress": `${scaleProgress}%` } as CSSProperties}
            onInput={(event) =>
              setFontScale(normalizeFontScale(event.currentTarget.value))
            }
          />
          <span className="font-scale-range-labels" aria-hidden="true">
            <i>1×</i><i>1.5×</i><i>2×</i>
          </span>
        </label>
        <small>拖动进度条即可实时缩放文字，设置会同时应用于管理大屏和工作台。</small>
      </div>
    </details>
  );
}
