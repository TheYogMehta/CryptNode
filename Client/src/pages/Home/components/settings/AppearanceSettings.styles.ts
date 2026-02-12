import styled from "@emotion/styled";
import {
  colors,
  spacing,
  radii,
  typography,
} from "../../../../theme/design-system";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[6]};
`;

export const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[4]};
`;

export const SectionTitle = styled.h3`
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.text.primary};
  margin: 0;
`;

export const OptionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${spacing[4]};
`;

export const OptionCard = styled.button<{ active: boolean }>`
  background-color: ${(props) =>
    props.active ? colors.primary.subtle : colors.background.tertiary};
  border: 2px solid
    ${(props) => (props.active ? colors.primary.main : "transparent")};
  border-radius: ${radii.lg};
  padding: ${spacing[4]};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[3]};
  cursor: pointer;
  transition: all 0.2s;
  color: ${(props) =>
    props.active ? colors.primary.main : colors.text.secondary};

  &:hover {
    background-color: ${(props) =>
      props.active ? colors.primary.subtle : colors.background.secondary};
  }
`;

export const Label = styled.span`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
`;
