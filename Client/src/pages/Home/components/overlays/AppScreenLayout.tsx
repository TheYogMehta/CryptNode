import React from "react";
import styled from "@emotion/styled";
import {
  colors,
  shadows,
} from "../../../../theme/design-system";
import { AppScreen, AppScreenCenter } from "./Overlay.styles";

const Shell = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const StagePanel = styled.div<{
  $stageWidth?: string;
  $panelless?: boolean;
}>`
  width: ${({ $stageWidth }) => $stageWidth || "min(100%, 520px)"};
  max-width: 100%;
  margin: 0 auto;
  background: ${({ $panelless }) =>
    $panelless ? "transparent" : colors.surface.primary};
  border: ${({ $panelless }) =>
    $panelless ? "none" : `1px solid ${colors.border.subtle}`};
  border-radius: ${({ $panelless }) => ($panelless ? "0" : "28px")};
  overflow: ${({ $panelless }) => ($panelless ? "visible" : "hidden")};
  box-shadow: ${({ $panelless }) => ($panelless ? "none" : shadows.xl)};
`;

interface AppScreenLayoutProps {
  children: React.ReactNode;
  stageWidth?: string;
  panelless?: boolean;
}

export const AppScreenLayout: React.FC<AppScreenLayoutProps> = ({
  children,
  stageWidth,
  panelless = false,
}) => {
  return (
    <AppScreen>
      <AppScreenCenter>
        <Shell>
          <StagePanel $stageWidth={stageWidth} $panelless={panelless}>
            {children}
          </StagePanel>
        </Shell>
      </AppScreenCenter>
    </AppScreen>
  );
};
