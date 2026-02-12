import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
export type DesignMode = "default" | "modern";

interface ThemeContextType {
  theme: Theme;
  designMode: DesignMode;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setDesignMode: (mode: DesignMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [designMode, setDesignModeState] = useState<DesignMode>("default");

  useEffect(() => {
    const savedTheme = localStorage.getItem("app-theme") as Theme;
    if (savedTheme) {
      setThemeState(savedTheme);
      document.body.classList.toggle("light-theme", savedTheme === "light");
    }

    const savedDesign = localStorage.getItem("app-design-mode") as DesignMode;
    if (savedDesign) {
      setDesignModeState(savedDesign);
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("app-theme", newTheme);
    document.body.classList.toggle("light-theme", newTheme === "light");
  };

  const setDesignMode = (newMode: DesignMode) => {
    setDesignModeState(newMode);
    localStorage.setItem("app-design-mode", newMode);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider
      value={{ theme, designMode, toggleTheme, setTheme, setDesignMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
