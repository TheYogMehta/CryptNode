import React from "react";
import styled from "@emotion/styled";
import { Inbox } from "lucide-react";
import { InputField } from "./Overlay.styles";
import { Button } from "../../../../components/ui/Button";
import ChatClient from "../../../../services/core/ChatClient";
import {
  getOutboundRequestHistory,
  getPendingRequests,
  type OutboundRequestHistoryEntry,
  type OutboundRequestStatus,
} from "../../../../services/storage/sqliteService";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../../../theme/design-system";

interface ConnectionSetupProps {
  targetEmail: string;
  setTargetEmail: (val: string) => void;
  onConnect: () => void;
  isJoining: boolean;
}

interface PendingRequestEntry {
  email: string;
  name: string;
  avatar: string;
  publicKey: string;
  publicKeys: string[];
  senderHash: string;
}

const Page = styled.section`
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(circle at top right, ${colors.primary.subtle} 0%, transparent 34%),
    ${colors.background.secondary};
`;

const PageInner = styled.div`
  min-height: 100%;
  padding: clamp(20px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 3vw, 32px);

  @media (max-width: 768px) {
    padding:
      ${spacing[4]}
      ${spacing[4]}
      max(${spacing[6]}, env(safe-area-inset-bottom))
      ${spacing[4]};
    gap: ${spacing[4]};
  }
`;

const HeroGrid = styled.div`
  width: 100%;
  display: flex;
`;

const Surface = styled.div`
  border-radius: 28px;
  border: 1px solid ${colors.border.subtle};
  background:
    linear-gradient(180deg, rgba(99, 102, 241, 0.06) 0%, transparent 100%),
    ${colors.background.secondary};
  box-shadow: ${shadows.lg};
`;

const FormPanel = styled(Surface)`
  padding: clamp(22px, 2.7vw, 30px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${spacing[5]};
  width: min(760px, 100%);
  margin: 0 auto;
`;

const PanelHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  text-align: left;
`;

const PanelTitle = styled.h2`
  margin: 0;
  color: ${colors.text.primary};
  font-size: ${typography.fontSize["2xl"]};
  font-weight: ${typography.fontWeight.semibold};
`;

const PanelText = styled.p`
  margin: 0;
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.base};
  line-height: 1.65;
`;

const InputShell = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: ${colors.background.tertiary};
  overflow: hidden;

  @media (max-width: 520px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const UsernameInput = styled(InputField)`
  flex: 1;
  min-width: 0;
  min-height: 64px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: ${colors.text.primary};
  -webkit-text-fill-color: ${colors.text.primary};
  caret-color: ${colors.text.primary};
  font-size: ${typography.fontSize.lg};
  padding: 0 ${spacing[5]};

  &::placeholder {
    color: ${colors.text.tertiary};
  }
`;

const DomainSuffix = styled.div`
  padding: 0 ${spacing[5]};
  align-self: stretch;
  display: flex;
  align-items: center;
  border-left: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  white-space: nowrap;
  font-size: ${typography.fontSize.base};

  @media (max-width: 520px) {
    min-height: 48px;
    border-left: none;
    border-top: 1px solid ${colors.border.subtle};
    justify-content: flex-start;
  }
`;

const RequestsPanel = styled(Surface)`
  padding: clamp(22px, 2.7vw, 30px);
  display: flex;
  flex-direction: column;
  gap: ${spacing[5]};
`;

const RequestsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: ${spacing[4]};

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const RequestsCount = styled.div`
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  background: ${colors.background.tertiary};
  border: 1px solid ${colors.border.subtle};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

const EmptyState = styled.div`
  padding: clamp(24px, 3vw, 34px);
  border-radius: ${radii.xl};
  border: 1px dashed ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[3]};
  text-align: center;
  color: ${colors.text.secondary};
`;

const RequestCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing[4]};
  padding: ${spacing[4]};
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const RequestIdentity = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[4]};
  min-width: 0;
  flex: 1;
`;

const Avatar = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: ${colors.primary.main};
  color: ${colors.text.inverse};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.bold};
  flex-shrink: 0;
  overflow: hidden;
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RequestText = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${spacing[1]};
`;

const RequestName = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RequestEmail = styled.div`
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  word-break: break-all;
  line-height: 1.45;
`;

const RequestActions = styled.div`
  display: flex;
  gap: ${spacing[2]};
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 720px) {
    justify-content: stretch;
  }

  & > button {
    min-width: 104px;
  }

  @media (max-width: 520px) {
    & > button {
      width: 100%;
    }
  }
`;

const HistoryTableShell = styled.div`
  border-radius: ${radii.xl};
  border: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
`;

const HistoryTableScroll = styled.div`
  overflow-x: auto;
`;

const HistoryTable = styled.table`
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
`;

const HistoryHeadCell = styled.th`
  padding: ${spacing[3]} ${spacing[4]};
  text-align: left;
  color: ${colors.text.tertiary};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid ${colors.border.subtle};
  background: rgba(255, 255, 255, 0.03);
`;

const HistoryBodyRow = styled.tr`
  &:not(:last-of-type) td {
    border-bottom: 1px solid ${colors.border.subtle};
  }
`;

const HistoryCell = styled.td`
  padding: ${spacing[4]};
  color: ${colors.text.secondary};
  font-size: ${typography.fontSize.sm};
  vertical-align: middle;
`;

const HistoryUser = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  font-weight: ${typography.fontWeight.semibold};
`;

const HistoryTime = styled.div`
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
`;

const StatusBadge = styled.span<{ $status: OutboundRequestStatus }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing[1]} ${spacing[3]};
  border-radius: ${radii.full};
  border: 1px solid
    ${({ $status }) => {
    if ($status === "accepted") return "rgba(34, 197, 94, 0.35)";
    if ($status === "blocked") return "rgba(239, 68, 68, 0.4)";
    if ($status === "rejected") return "rgba(248, 113, 113, 0.35)";
    return "rgba(99, 102, 241, 0.35)";
  }};
  background:
    ${({ $status }) => {
    if ($status === "accepted") return "rgba(34, 197, 94, 0.12)";
    if ($status === "blocked") return "rgba(239, 68, 68, 0.14)";
    if ($status === "rejected") return "rgba(248, 113, 113, 0.12)";
    return "rgba(99, 102, 241, 0.14)";
  }};
  color:
    ${({ $status }) => {
    if ($status === "accepted") return "#86efac";
    if ($status === "blocked") return "#fca5a5";
    if ($status === "rejected") return "#fda4af";
    return "#a5b4fc";
  }};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.semibold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const formatHistoryName = (email: string) => {
  const [username] = email.split("@");
  return username || "Unknown user";
};

const formatHistoryStatus = (status: OutboundRequestStatus) => {
  if (status === "accepted") return "Accepted";
  if (status === "blocked") return "Blocked";
  if (status === "rejected") return "Rejected";
  return "Pending";
};

const formatHistoryTimestamp = (timestamp: number) => {
  if (!timestamp) return "Awaiting update";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => {
  const [pending, setPending] = React.useState<PendingRequestEntry[]>([]);
  const [history, setHistory] = React.useState<OutboundRequestHistoryEntry[]>([]);

  React.useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [pendingRequests, requestHistory] = await Promise.all([
          getPendingRequests(),
          getOutboundRequestHistory(),
        ]);

        if (!mounted) return;

        setPending(pendingRequests as PendingRequestEntry[]);
        setHistory(requestHistory);
      } catch (err) {
        console.error("Failed to load connection setup data", err);
      }
    };

    const handleNew = () => {
      if (!mounted) return;
      loadData();
    };

    ChatClient.on("inbound_request", handleNew);
    ChatClient.on("pending_requests_changed", handleNew);
    ChatClient.on("request_history_changed", handleNew);

    loadData();

    return () => {
      mounted = false;
      ChatClient.off("inbound_request", handleNew);
      ChatClient.off("pending_requests_changed", handleNew);
      ChatClient.off("request_history_changed", handleNew);
    };
  }, []);

  const removePending = (req: PendingRequestEntry) => {
    setPending((prev) =>
      prev.filter(
        (item) =>
          item.email !== req.email && item.senderHash !== req.senderHash,
      ),
    );
  };

  return (
    <Page>
      <PageInner>
        <HeroGrid>
          <FormPanel>
            <PanelHeader>
              <PanelTitle>Establish Connection</PanelTitle>
              <PanelText>
                Enter your friend&apos;s username to send a secure request and open a new session.
              </PanelText>
            </PanelHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing[4] }}>
              <InputShell>
                <UsernameInput
                  type="text"
                  value={targetEmail}
                  onChange={(e) =>
                    setTargetEmail(e.target.value.replace(/@.*$/, "").trim())
                  }
                  placeholder="username"
                  onKeyDown={(e) => e.key === "Enter" && onConnect()}
                />
                <DomainSuffix>@gmail.com</DomainSuffix>
              </InputShell>

              <Button
                onClick={onConnect}
                disabled={isJoining || !targetEmail.trim()}
                variant="primary"
                size="lg"
                fullWidth
              >
                {isJoining ? "Sending Request..." : "Connect Securely"}
              </Button>
            </div>
          </FormPanel>
        </HeroGrid>

        <RequestsPanel>
          <RequestsHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <PanelTitle style={{ fontSize: typography.fontSize.xl }}>
                Pending Requests
              </PanelTitle>
              <PanelText style={{ fontSize: typography.fontSize.sm }}>
                Review incoming requests before anyone gets access to your session list.
              </PanelText>
            </div>
            <RequestsCount>
              {pending.length} pending
            </RequestsCount>
          </RequestsHeader>

          {pending.length === 0 ? (
            <EmptyState>
              <Inbox size={28} color={colors.primary.main} />
              <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                No pending requests right now
              </div>
              <div style={{ maxWidth: "46ch", lineHeight: 1.6 }}>
                When someone sends you a connection request, it will show up here.
              </div>
            </EmptyState>
          ) : (
            <RequestsList>
              {pending.map((req, i) => (
                <RequestCard key={`${req.senderHash || req.email || "request"}-${i}`}>
                  <RequestIdentity>
                    <Avatar>
                      {req.avatar ? (
                        <AvatarImage
                          src={
                            req.avatar.startsWith("data:")
                              ? req.avatar
                              : `data:image/jpeg;base64,${req.avatar}`
                          }
                          alt={req.name || "Pending request avatar"}
                        />
                      ) : (
                        (req.name?.[0] || req.email?.[0] || "?").toUpperCase()
                      )}
                    </Avatar>

                    <RequestText>
                      <RequestName>{req.name || "Unknown sender"}</RequestName>
                      <RequestEmail>{req.email || "No email available"}</RequestEmail>
                    </RequestText>
                  </RequestIdentity>

                  <RequestActions>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        ChatClient.acceptFriend(
                          req.email,
                          req.publicKeys?.length ? req.publicKeys : req.publicKey,
                          req.senderHash,
                        );
                        removePending(req);
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        ChatClient.denyFriend(req.email);
                        removePending(req);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        ChatClient.blockUser(req.email);
                        removePending(req);
                      }}
                    >
                      Block
                    </Button>
                  </RequestActions>
                </RequestCard>
              ))}
            </RequestsList>
          )}
        </RequestsPanel>

        <RequestsPanel>
          <RequestsHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
              <PanelTitle style={{ fontSize: typography.fontSize.xl }}>
                Request History
              </PanelTitle>
              <PanelText style={{ fontSize: typography.fontSize.sm }}>
                Track the connection requests you&apos;ve sent and how each user responded.
              </PanelText>
            </div>
            <RequestsCount>
              {history.length} logged
            </RequestsCount>
          </RequestsHeader>

          {history.length === 0 ? (
            <EmptyState>
              <Inbox size={28} color={colors.primary.main} />
              <div style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                No request history yet
              </div>
              <div style={{ maxWidth: "46ch", lineHeight: 1.6 }}>
                Every connection request you send will appear here with its latest status and timestamp.
              </div>
            </EmptyState>
          ) : (
            <HistoryTableShell>
              <HistoryTableScroll>
                <HistoryTable>
                  <thead>
                    <tr>
                      <HistoryHeadCell>User</HistoryHeadCell>
                      <HistoryHeadCell>Status</HistoryHeadCell>
                      <HistoryHeadCell>Sent</HistoryHeadCell>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <HistoryBodyRow key={entry.id}>
                        <HistoryCell>
                          <HistoryUser>{formatHistoryName(entry.email)}</HistoryUser>
                        </HistoryCell>
                        <HistoryCell>
                          <StatusBadge $status={entry.status}>
                            {formatHistoryStatus(entry.status)}
                          </StatusBadge>
                        </HistoryCell>
                        <HistoryCell>
                          <HistoryTime>{formatHistoryTimestamp(entry.sentAt)}</HistoryTime>
                        </HistoryCell>
                      </HistoryBodyRow>
                    ))}
                  </tbody>
                </HistoryTable>
              </HistoryTableScroll>
            </HistoryTableShell>
          )}
        </RequestsPanel>
      </PageInner>
    </Page>
  );
};
