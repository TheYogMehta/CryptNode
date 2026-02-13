import React from "react";
import { useTheme } from "../../../../theme/ThemeContext";
import {
  Moon,
  Sun,
  MessageSquareText,
  AlignLeft,
} from "lucide-react";
import {
  Container,
  Section,
  SectionTitle,
  OptionGrid,
  OptionCard,
  Label,
} from "./AppearanceSettings.styles";

export const AppearanceSettings: React.FC = () => {
  const { theme, setTheme, messageLayout, setMessageLayout } = useTheme();

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
            active={messageLayout === "bubble"}
            onClick={() => setMessageLayout("bubble")}
          >
            <MessageSquareText size={24} />
            <Label>Classic</Label>
          </OptionCard>
          <OptionCard
            active={messageLayout === "modern"}
            onClick={() => setMessageLayout("modern")}
          >
            <AlignLeft size={24} />
            <Label>Modern</Label>
          </OptionCard>
        </OptionGrid>
      </Section>
    </Container>
  );
};
