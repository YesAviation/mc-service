import { create } from "zustand";

export type AccentTheme = {
  id: string;
  name: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  accentSoft: string;
};

export type UiDensity = "comfortable" | "balanced" | "compact";

export const densityOptions: Array<{
  id: UiDensity;
  name: string;
  description: string;
}> = [
  {
    id: "comfortable",
    name: "Comfortable",
    description: "Larger targets with more breathing room",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Default medium density",
  },
  {
    id: "compact",
    name: "Compact",
    description: "Tighter layout for large libraries",
  },
];

export const accentThemes: AccentTheme[] = [
  {
    id: "sunset-pop",
    name: "Sunset Pop",
    accent: "#ff5f87",
    accentHover: "#ff7f9f",
    accentMuted: "#ff5f8738",
    accentSoft: "#ffb7ca",
  },
  {
    id: "glacier",
    name: "Glacier",
    accent: "#4ea8ff",
    accentHover: "#74bbff",
    accentMuted: "#4ea8ff36",
    accentSoft: "#b8dbff",
  },
  {
    id: "emerald-glow",
    name: "Emerald Glow",
    accent: "#35c98d",
    accentHover: "#57d7a3",
    accentMuted: "#35c98d36",
    accentSoft: "#b9edd8",
  },
  {
    id: "solar-gold",
    name: "Solar Gold",
    accent: "#f8b84f",
    accentHover: "#ffca76",
    accentMuted: "#f8b84f3b",
    accentSoft: "#ffe4b4",
  },
  {
    id: "electric-indigo",
    name: "Electric Indigo",
    accent: "#7f7bff",
    accentHover: "#9b97ff",
    accentMuted: "#7f7bff36",
    accentSoft: "#ceccff",
  },
];

const DEFAULT_ACCENT_ID = "glacier";
const DEFAULT_LOCALE = "en";
const DEFAULT_DENSITY: UiDensity = "balanced";
const ACCENT_STORAGE_KEY = "player_accent_theme";
const LOCALE_STORAGE_KEY = "player_locale";
const DENSITY_STORAGE_KEY = "player_ui_density";

interface UiState {
  accentThemeId: string;
  locale: string;
  density: UiDensity;
  setAccentTheme: (themeId: string) => void;
  setLocale: (locale: string) => void;
  setDensity: (density: UiDensity) => void;
  initializeUiPreferences: () => void;
}

function getAccentTheme(themeId: string): AccentTheme {
  return (
    accentThemes.find((theme) => theme.id === themeId) ??
    accentThemes.find((theme) => theme.id === DEFAULT_ACCENT_ID) ??
    accentThemes[0]
  );
}

type RgbColor = { r: number; g: number; b: number };

function hexToRgb(value: string): RgbColor | null {
  const raw = value.trim().replace("#", "");

  if (raw.length === 3) {
    const [r, g, b] = raw.split("");
    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
    };
  }

  if (raw.length === 6 || raw.length === 8) {
    const hex = raw.slice(0, 6);
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

function mixColor(base: RgbColor, target: RgbColor, targetWeight: number): RgbColor {
  const ratio = Math.min(1, Math.max(0, targetWeight));
  return {
    r: Math.round(base.r + (target.r - base.r) * ratio),
    g: Math.round(base.g + (target.g - base.g) * ratio),
    b: Math.round(base.b + (target.b - base.b) * ratio),
  };
}

function toRgba(color: RgbColor, alpha: number): string {
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clampedAlpha})`;
}

function applyAccentTheme(themeId: string) {
  if (typeof document === "undefined") {
    return;
  }

  const theme = getAccentTheme(themeId);
  const root = document.documentElement;
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-accent-hover", theme.accentHover);
  root.style.setProperty("--color-accent-muted", theme.accentMuted);
  root.style.setProperty("--color-accent-soft", theme.accentSoft);

  const accent = hexToRgb(theme.accent);
  const accentHover = hexToRgb(theme.accentHover);
  const accentSoft = hexToRgb(theme.accentSoft);

  if (accent && accentHover && accentSoft) {
    const rose: RgbColor = { r: 244, g: 63, b: 94 };
    const violet: RgbColor = { r: 139, g: 92, b: 246 };
    const cyan: RgbColor = { r: 6, g: 182, b: 212 };
    const amber: RgbColor = { r: 245, g: 158, b: 11 };
    const deepTop: RgbColor = { r: 10, g: 14, b: 22 };
    const deepBottom: RgbColor = { r: 8, g: 12, b: 19 };

    const glow1 = mixColor(accent, rose, 0.3);
    const glow2 = mixColor(accentHover, violet, 0.34);
    const glow3 = mixColor(accentSoft, cyan, 0.28);
    const glow4 = mixColor(accent, amber, 0.48);
    const overlayTop = mixColor(accent, deepTop, 0.82);
    const overlayBottom = mixColor(accentHover, deepBottom, 0.9);

    root.style.setProperty("--color-bg-glow-1", toRgba(glow1, 0.42));
    root.style.setProperty("--color-bg-glow-2", toRgba(glow2, 0.38));
    root.style.setProperty("--color-bg-glow-3", toRgba(glow3, 0.34));
    root.style.setProperty("--color-bg-glow-4", toRgba(glow4, 0.24));
    root.style.setProperty("--color-bg-overlay-top", toRgba(overlayTop, 0.44));
    root.style.setProperty("--color-bg-overlay-bottom", toRgba(overlayBottom, 0.76));
  }
}

function getDensity(value: string | null | undefined): UiDensity {
  const match = densityOptions.find((option) => option.id === value);
  return match?.id ?? DEFAULT_DENSITY;
}

function applyDensity(density: UiDensity) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.uiDensity = density;
}

export const useUiStore = create<UiState>((set) => ({
  accentThemeId: DEFAULT_ACCENT_ID,
  locale: DEFAULT_LOCALE,
  density: DEFAULT_DENSITY,

  setAccentTheme: (themeId) => {
    const theme = getAccentTheme(themeId);
    applyAccentTheme(theme.id);
    localStorage.setItem(ACCENT_STORAGE_KEY, theme.id);
    set({ accentThemeId: theme.id });
  },

  setLocale: (locale) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    set({ locale });
  },

  setDensity: (density) => {
    const nextDensity = getDensity(density);
    applyDensity(nextDensity);
    localStorage.setItem(DENSITY_STORAGE_KEY, nextDensity);
    set({ density: nextDensity });
  },

  initializeUiPreferences: () => {
    const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY) ?? DEFAULT_ACCENT_ID;
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) ?? DEFAULT_LOCALE;
    const savedDensity = getDensity(localStorage.getItem(DENSITY_STORAGE_KEY));
    const theme = getAccentTheme(savedAccent);

    applyAccentTheme(theme.id);
    applyDensity(savedDensity);
    set({ accentThemeId: theme.id, locale: savedLocale, density: savedDensity });
  },
}));

export function initializeUiPreferences() {
  useUiStore.getState().initializeUiPreferences();
}
