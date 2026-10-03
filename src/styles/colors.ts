import type { Themes } from "~/constants/constants";

/**
 * Semantic palette mirrored from `src/styles/globals.css`.
 * The CSS custom properties are the source of truth for raw styling; this
 * object feeds the antd `ConfigProvider` token bridge and JS-side chart/icon
 * colors that cannot read CSS variables.
 */
export type ThemePalette = {
  /** Page background / deepest layer. */
  base: string;
  /** Slightly raised background used behind panels. */
  deep: string;
  /** Card, sidebar, header surface. */
  surface: string;
  /** Nested surface (table header, inputs, hover fills). */
  surface2: string;
  /** Highest-contrast surface (popovers, active nav). */
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  brand: string;
  brand2: string;
  brandSoft: string;
  onBrand: string;
  cyan: string;
  mint: string;
  amber: string;
  rose: string;
  up: string;
  down: string;
  upSoft: string;
  downSoft: string;
};

export const COLORS: Record<keyof typeof Themes, ThemePalette> = {
  light: {
    base: "#f4f5fa",
    deep: "#eceef6",
    surface: "#ffffff",
    surface2: "#f7f8fc",
    surface3: "#eef0f7",
    border: "#e3e6f0",
    borderStrong: "#d2d7e6",
    text: "#0c0e17",
    text2: "#545c72",
    text3: "#8a92a8",
    brand: "#5b4be0",
    brand2: "#8b7bff",
    brandSoft: "#ece9ff",
    onBrand: "#ffffff",
    cyan: "#0891b2",
    mint: "#059669",
    amber: "#d97706",
    rose: "#e11d48",
    up: "#059669",
    down: "#e11d48",
    upSoft: "#e3f7ef",
    downSoft: "#fdeaef",
  },
  dark: {
    base: "#08090e",
    deep: "#05060a",
    surface: "#10121a",
    surface2: "#161925",
    surface3: "#1e2230",
    border: "#23273380",
    borderStrong: "#333a4d",
    text: "#eef1f8",
    text2: "#9aa3b8",
    text3: "#6b7490",
    brand: "#6d5df6",
    brand2: "#8b7bff",
    brandSoft: "#1c1937",
    onBrand: "#ffffff",
    cyan: "#22d3ee",
    mint: "#2dd4a7",
    amber: "#f5a524",
    rose: "#ff5c7a",
    up: "#2dd4a7",
    down: "#ff5c7a",
    upSoft: "#0f2a24",
    downSoft: "#2d1420",
  },
  /**
   * The glass palette, mirroring the `.glass` token block in `globals.css`.
   *
   * The surface values are the CSS alpha tints composited over the brightest
   * part of the aurora, so an antd popover sitting next to a frosted panel
   * matches it instead of appearing as a pale grey box.
   *
   * They are the *resolved* colours rather than the alpha ones the CSS uses:
   * antd composites tokens itself and cannot blend against a backdrop it does
   * not know about, so a translucent value would render as a washed-out grey
   * box. Picking the equivalent colour over the darkest part of the aurora keeps
   * antd's own components in step with the CSS-rendered ones.
   */
  glass: {
    base: "#0e1020",
    deep: "#0a0b16",
    surface: "#1f1e49",
    surface2: "#262359",
    surface3: "#262651",
    border: "rgb(255 255 255 / 0.15)",
    borderStrong: "rgb(255 255 255 / 0.24)",
    text: "#f6f8ff",
    text2: "#ccd3e6",
    text3: "#a8b1cc",
    brand: "#9c8dff",
    brand2: "#b7abff",
    brandSoft: "rgb(156 141 255 / 0.24)",
    onBrand: "#ffffff",
    cyan: "#3fe3f4",
    mint: "#4ae8ba",
    amber: "#ffc266",
    rose: "#ff7d99",
    up: "#4ae8ba",
    down: "#ff7d99",
    upSoft: "rgb(74 232 186 / 0.18)",
    downSoft: "rgb(255 125 153 / 0.18)",
  },

  /**
   * The Mixer palette, mirroring the `[data-theme="mixer"]` token block.
   *
   * Resolved rather than alpha, for the same reason as glass: antd composites
   * its own tokens and cannot blend against a backdrop it cannot see, so a
   * translucent value renders as a washed grey box next to a near-opaque card.
   */
  mixer: {
    base: "#07060d",
    deep: "#040309",
    surface: "#1b1730",
    surface2: "#241f3e",
    surface3: "#2b2450",
    border: "rgb(178 152 255 / 0.18)",
    borderStrong: "rgb(178 152 255 / 0.34)",
    text: "#f7f4ff",
    text2: "#bdb4d8",
    text3: "#8379a3",
    brand: "#8b5cf6",
    brand2: "#a78bfa",
    brandSoft: "rgb(139 92 246 / 0.28)",
    onBrand: "#ffffff",
    cyan: "#22d3ee",
    mint: "#34d399",
    amber: "#fbbf24",
    rose: "#f472b6",
    up: "#34d399",
    down: "#fb7185",
    upSoft: "rgb(52 211 153 / 0.2)",
    downSoft: "rgb(251 113 133 / 0.2)",
  },
};

/**
 * Per-theme antd `ThemeConfig`. Exported separately so the provider stays
 * declarative and the visual language is reviewable in one place.
 */
export function buildAntdTheme(mode: keyof typeof Themes) {
  const c = COLORS[mode];
  // Glass is a dark scheme; it only changes how surfaces are painted.
  const isDark = mode !== "light";

  return {
    cssVar: { key: "obsidian" },
    hashed: false,
    token: {
      colorPrimary: c.brand,
      colorInfo: c.cyan,
      colorSuccess: c.mint,
      colorWarning: c.amber,
      colorError: c.down,

      colorBgBase: c.base,
      colorBgLayout: c.base,
      colorBgContainer: c.surface,
      colorBgElevated: c.surface2,
      colorBgSpotlight: c.surface3,

      colorText: c.text,
      colorTextSecondary: c.text2,
      colorTextTertiary: c.text3,
      colorTextQuaternary: c.text3,
      colorTextPlaceholder: c.text3,

      colorBorder: c.borderStrong,
      colorBorderSecondary: c.border,
      colorSplit: c.border,
      colorFillSecondary: c.surface2,
      colorFillTertiary: c.surface3,
      colorFillQuaternary: c.surface2,

      borderRadius: 12,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      borderRadiusXS: 6,
      borderRadiusXXS: 4,

      fontFamily:
        "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      fontFamilyCode:
        'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      fontSizeLG: 16,
      fontSizeHeading1: 34,
      fontSizeHeading2: 28,
      fontSizeHeading3: 22,
      fontSizeHeading4: 18,
      lineHeight: 1.55,
      controlHeight: 38,
      wireframe: false,

      motionDurationMid: "0.24s",
      motionDurationSlow: "0.38s",
      motionEaseInOut: "cubic-bezier(0.16, 1, 0.3, 1)",
      motionEaseOut: "cubic-bezier(0.16, 1, 0.3, 1)",

      boxShadow:
        "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 60px -32px rgba(0,0,0,0.6)",
      boxShadowSecondary:
        "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -20px rgba(0,0,0,0.5)",
      boxShadowTertiary: "0 8px 24px -16px rgba(0,0,0,0.45)",

      colorLink: isDark ? c.cyan : c.brand,
      colorLinkHover: isDark ? "#67e8f9" : "#4a3bd0",
    },
    components: {
      Layout: {
        headerBg: "transparent",
        headerHeight: 64,
        headerPadding: "0 20px",
        bodyBg: "transparent",
        footerBg: "transparent",
        footerPadding: "0 16px",
        siderBg: "transparent",
        triggerBg: "transparent",
      },
      Menu: {
        darkItemBg: "transparent",
        darkItemSelectedBg: "transparent",
        darkItemHoverBg: "transparent",
        darkItemColor: c.text2,
        darkItemHoverColor: c.text,
        darkItemSelectedColor: "#ffffff",
        itemBg: "transparent",
        itemSelectedBg: c.surface3,
        itemHoverBg: c.surface2,
        itemColor: c.text2,
        itemHoverColor: c.text,
        itemSelectedColor: c.text,
        itemBorderRadius: 12,
        itemMarginInline: 0,
        itemHeight: 44,
        iconSize: 18,
        activeBarWidth: 0,
      },
      Card: {
        colorBgContainer: c.surface,
        colorBorderSecondary: c.border,
        borderRadiusLG: 18,
        paddingLG: 20,
        headerBg: "transparent",
        headerFontSize: 16,
      },
      Table: {
        headerBg: c.surface2,
        headerColor: c.text2,
        headerSplitColor: "transparent",
        bodyBg: c.surface,
        rowHoverBg: c.surface2,
        borderColor: c.border,
        footerBg: c.surface2,
        cellPaddingBlock: 14,
        cellPaddingInline: 16,
        headerBorderRadius: 12,
        rowHoverBorderRadius: 12,
        expandRowBg: c.surface2,
        titleColor: c.text,
      },
      Tag: {
        defaultBg: c.surface3,
        defaultColor: c.text2,
        borderRadiusSM: 999,
        paddingInline: 10,
      },
      Segmented: {
        itemSelectedBg: c.surface,
        itemSelectedColor: c.text,
        trackBg: c.surface2,
        trackPadding: 4,
        itemColor: c.text2,
        itemHoverBg: c.surface3,
        itemHoverColor: c.text,
      },
      Select: {
        optionSelectedBg: c.surface3,
        optionActiveBg: c.surface2,
        controlItemBgHover: c.surface2,
        colorBgContainer: c.surface2,
      },
      Input: {
        colorBgContainer: c.surface2,
        activeShadow: `0 0 0 3px ${c.brand}44`,
      },
      Button: {
        primaryShadow: `0 10px 24px -14px ${c.brand}`,
        defaultShadow: "none",
        dangerShadow: "none",
        fontWeight: 600,
      },
      Tooltip: {
        colorBgSpotlight: c.surface3,
        colorTextLightSolid: c.text,
      },
      Alert: {
        withDescriptionPadding: "16px 18px",
        borderRadiusLG: 14,
      },
      Spin: {
        dotSize: isDark ? 46 : 42,
      },
      Skeleton: {
        gradientFromColor: c.surface2,
        gradientToColor: c.surface3,
        borderRadiusLG: 12,
      },
      Empty: {
        colorTextDescription: c.text3,
      },
    },
  };
}
