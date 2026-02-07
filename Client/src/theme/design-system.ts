import { css } from "@emotion/react";

export const colors = {
    // Dark Backgrounds (Slate/Zinc based for depth)
    background: {
        primary: "#020617", // Slate 950
        secondary: "#0f172a", // Slate 900
        tertiary: "#1e293b", // Slate 800
        overlay: "rgba(2, 6, 23, 0.8)",
        glass: "rgba(15, 23, 42, 0.6)",
    },
    surface: {
        primary: "#1e293b", // Slate 800
        secondary: "#334155", // Slate 700
        highlight: "#475569", // Slate 600
    },
    // Text Colors
    text: {
        primary: "#f8fafc", // Slate 50
        secondary: "#94a3b8", // Slate 400
        tertiary: "#64748b", // Slate 500
        inverse: "#0f172a",
    },
    // Brand Accents (Violet/Indigo)
    primary: {
        DEFAULT: "#6366f1", // Indigo 500
        hover: "#4f46e5", // Indigo 600
        active: "#4338ca", // Indigo 700
        subtle: "rgba(99, 102, 241, 0.1)",
        main: "#6366f1", // Alias for DEFAULT
    },
    // Functional Colors
    status: {
        success: "#22c55e", // Green 500
        error: "#ef4444", // Red 500
        warning: "#f59e0b", // Amber 500
        info: "#3b82f6", // Blue 500
    },
    border: {
        subtle: "rgba(255, 255, 255, 0.08)",
        highlight: "rgba(255, 255, 255, 0.15)",
    },
};

export const spacing = {
    0: "0px",
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
};

export const radii = {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    "2xl": "24px",
    "3xl": "32px",
    full: "9999px",
};

export const shadows = {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
    glow: "0 0 20px rgba(99, 102, 241, 0.3)",
};

export const typography = {
    fontFamily: {
        sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
  background: ${colors.background.glass};
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid ${colors.border.subtle};
`;

export const flexCenter = css`
  display: flex;
  align-items: center;
  justify-content: center;
`;
