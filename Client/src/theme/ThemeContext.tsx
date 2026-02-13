import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
export type MessageLayout = "bubble" | "modern";

interface ThemeContextType {
  theme: Theme;
  messageLayout: MessageLayout;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setMessageLayout: (layout: MessageLayout) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [messageLayout, setMessageLayoutState] =
    useState<MessageLayout>("bubble");

  useEffect(() => {
    const savedTheme = localStorage.getItem("app-theme") as Theme;
    if (savedTheme) {
      setThemeState(savedTheme);
      document.body.classList.toggle("light-theme", savedTheme === "light");
    }

    const savedMessageLayoutRaw = localStorage.getItem("app-message-layout");
    const normalizedMessageLayout: MessageLayout =
      savedMessageLayoutRaw === "modern" || savedMessageLayoutRaw === "discord"
        ? "modern"
        : "bubble";
    setMessageLayoutState(normalizedMessageLayout);
    localStorage.setItem("app-message-layout", normalizedMessageLayout);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("app-theme", newTheme);
    document.body.classList.toggle("light-theme", newTheme === "light");
  };

  const setMessageLayout = (layout: MessageLayout) => {
    setMessageLayoutState(layout);
    localStorage.setItem("app-message-layout", layout);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        messageLayout,
        toggleTheme,
        setTheme,
        setMessageLayout,
      }}
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
