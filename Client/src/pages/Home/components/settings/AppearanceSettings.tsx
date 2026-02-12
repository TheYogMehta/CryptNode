import React from "react";
import { useTheme } from "../../../../theme/ThemeContext";
import { Moon, Sun, Layout, Smartphone } from "lucide-react";
import {
  Container,
  Section,
  SectionTitle,
  OptionGrid,
  OptionCard,
  Label,
} from "./AppearanceSettings.styles";

export const AppearanceSettings: React.FC = () => {
  const { theme, setTheme, designMode, setDesignMode } = useTheme();

  return (
    <Container>
      <Section>
        <SectionTitle>Color Theme</SectionTitle>
        <OptionGrid>
          <OptionCard
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            <Moon size={24} />
            <Label>Dark Mode</Label>
          </OptionCard>
          <OptionCard
            active={theme === "light"}
            onClick={() => setTheme("light")}
          >
            <Sun size={24} />
            <Label>Light Mode</Label>
          </OptionCard>
        </OptionGrid>
      </Section>

      <Section>
        <SectionTitle>Interface Design</SectionTitle>
        <OptionGrid>
          <OptionCard
            active={designMode === "default"}
            onClick={() => setDesignMode("default")}
          >
            <Layout size={24} />
            <Label>Classic</Label>
          </OptionCard>
          <OptionCard
            active={designMode === "modern"}
            onClick={() => setDesignMode("modern")}
          >
            <Smartphone size={24} />
            <Label>Modern</Label>
          </OptionCard>
        </OptionGrid>
      </Section>
    </Container>
  );
};
