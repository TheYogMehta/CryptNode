import { css } from "@emotion/react";

export const colors = {
  background: {
    primary: "var(--bg-primary)",
    secondary: "var(--bg-secondary)",
    tertiary: "var(--bg-tertiary)",
    overlay: "var(--bg-overlay)",
    glass: "var(--bg-glass)",
  },
  surface: {
    primary: "var(--surface-primary)",
    secondary: "var(--surface-secondary)",
    highlight: "var(--surface-highlight)",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    tertiary: "var(--text-tertiary)",
    inverse: "var(--text-inverse)",
  },
  primary: {
    DEFAULT: "var(--brand-primary)",
    hover: "var(--brand-hover)",
    active: "var(--brand-active)",
    subtle: "var(--brand-subtle)",
    main: "var(--brand-primary)",
  },
  status: {
    success: "var(--status-success)",
    error: "var(--status-error)",
    warning: "var(--status-warning)",
    info: "var(--status-info)",
  },
  border: {
    subtle: "var(--border-subtle)",
    highlight: "var(--border-highlight)",
  },
};

export const spacing = {
  0: "var(--space-0)",
  1: "var(--space-1)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
};

export const radii = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  "3xl": "var(--radius-3xl)",
  full: "var(--radius-full)",
};

export const shadows = {
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
  "2xl": "var(--shadow-2xl)",
  glass: "var(--shadow-glass)",
  glow: "var(--shadow-glow)",
};

export const typography = {
  fontFamily: {
    sans: "var(--font-sans)",
  },
  fontSize: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const glassEffect = css`
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
`;

export const flexCenter = css`
  display: flex;
  align-items: center;
  justify-content: center;
`;
