import styled from "@emotion/styled";
import { colors, spacing, radii } from "../../../../theme/design-system";

export const LogsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: ${spacing[4]};
  max-width: 1000px;
  margin: 0 auto;
  padding: ${spacing[2]};
`;

export const LogsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: ${spacing[3]};
  border-bottom: 1px solid ${colors.border.subtle};
`;

export const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  color: ${colors.text.primary};
`;

export const SubTitle = styled.span`
  font-size: 0.85rem;
  color: ${colors.text.secondary};
`;

export const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

export const Button = styled.button<{ variant?: "danger" | "primary" }>`
  background: ${(props) =>
    props.variant === "danger"
      ? "rgba(255, 69, 58, 0.1)"
      : "rgba(10, 132, 255, 0.1)"};
  color: ${(props) => (props.variant === "danger" ? "#ff453a" : "#0a84ff")};
  border: 1px solid
    ${(props) =>
      props.variant === "danger" ? "rgba(255, 69, 58, 0.2)" : "rgba(10, 132, 255, 0.2)"};
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background: ${(props) =>
      props.variant === "danger"
        ? "rgba(255, 69, 58, 0.2)"
        : "rgba(10, 132, 255, 0.2)"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const LogsList = styled.div`
  flex: 1;
  overflow-y: auto;
  background: ${colors.background.secondary};
  border-radius: ${radii.md};
  border: 1px solid ${colors.border.subtle};
  font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
`;

export const LogItem = styled.div<{ level: string }>`
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 3px solid
    ${(props) =>
      props.level === "error"
        ? "#ff453a"
        : props.level === "warn"
          ? "#ff9f0a"
          : "#30d158"};

  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
`;

export const LogTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

export const LogLevel = styled.span<{ level: string }>`
  text-transform: uppercase;
  font-weight: bold;
  font-size: 0.7rem;
  color: ${(props) =>
    props.level === "error"
      ? "#ff453a"
      : props.level === "warn"
        ? "#ff9f0a"
        : "#30d158"};
`;

export const LogTimestamp = styled.span`
  color: ${colors.text.tertiary};
  font-size: 0.7rem;
`;

export const LogMessage = styled.div`
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.4;
  color: ${colors.text.primary};
`;

export const LogStack = styled.pre`
  margin: 4px 0 0 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 0.75rem;
  color: #aaa;
  overflow-x: auto;
  max-height: 200px;
`;

export const NoLogs = styled.div`
  padding: ${spacing[10]};
  text-align: center;
  color: ${colors.text.tertiary};
  font-style: italic;
`;
