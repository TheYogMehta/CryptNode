import React, { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  LogsContainer,
  LogsHeader,
  TitleContainer,
  Title,
  SubTitle,
  ActionButtons,
  Button,
  LogsList,
  LogItem,
  LogTop,
  LogLevel,
  LogTimestamp,
  LogMessage,
  LogStack,
  NoLogs,
} from "./LogSettings.styles";
import { logger, LogEntry } from "../../../../services/core/LoggerService";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

export const LogSettings: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(logger.getLogs());
  const logsListRef = useRef<HTMLDivElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const handleLogsUpdate = (newLogs: LogEntry[]) => {
      setLogs([...newLogs].reverse());
    };

    logger.on("logs_updated", handleLogsUpdate);
    return () => {
      logger.off("logs_updated", handleLogsUpdate);
    };
  }, []);

  const handleClearLogs = () => {
    logger.clearLogs();
    setShowClearConfirm(false);
    toast.success("Logs cleared.");
  };

  const handleCopyLogs = () => {
    const logText = logs
      .map(
        (log) =>
          `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] ${log.message}${log.stack ? "\n" + log.stack : ""}`,
      )
      .join("\n\n");

    navigator.clipboard
      .writeText(logText)
      .then(() => {
        toast.success("Logs copied to clipboard.");
      })
      .catch((err) => {
        console.error("Failed to copy logs", err);
        toast.error("Failed to copy logs.");
      });
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  return (
    <LogsContainer>
      <LogsHeader>
        <TitleContainer>
          <Title>Error Logs</Title>
          <SubTitle>
            Debugging information for support and troubleshooting
          </SubTitle>
        </TitleContainer>
        <ActionButtons>
          <Button onClick={handleCopyLogs} disabled={logs.length === 0}>
            Copy All
          </Button>
          <Button
            variant="danger"
            onClick={() => setShowClearConfirm(true)}
            disabled={logs.length === 0}
          >
            Clear
          </Button>
        </ActionButtons>
      </LogsHeader>

      <LogsList ref={logsListRef}>
        {logs.length === 0 ? (
          <NoLogs>No logs captured yet.</NoLogs>
        ) : (
          logs.map((log) => (
            <LogItem key={log.id} level={log.level}>
              <LogTop>
                <LogLevel level={log.level}>{log.level}</LogLevel>
                <LogTimestamp>{formatTimestamp(log.timestamp)}</LogTimestamp>
              </LogTop>
              <LogMessage>{log.message}</LogMessage>
              {log.stack && (
                <LogStack>
                  {log.stack}
                </LogStack>
              )}
            </LogItem>
          ))
        )}
      </LogsList>
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear all logs?"
        description="This removes the locally stored log history used for debugging and troubleshooting."
        confirmLabel="Clear Logs"
        tone="danger"
        badgeLabel="Diagnostics"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearLogs}
      />
    </LogsContainer>
  );
};
