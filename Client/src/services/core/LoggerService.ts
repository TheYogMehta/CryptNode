import { EventEmitter } from "events";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  stack?: string;
  data?: any;
}

const MAX_LOGS = 1000;
const STORAGE_KEY = "chatapp_logs";

class LoggerService extends EventEmitter {
  private static instance: LoggerService;
  private logs: LogEntry[] = [];

  private constructor() {
    super();
    this.loadFromStorage();
    this.initInterceptors();
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private loadFromStorage() {
    try {
      const storedLogs = localStorage.getItem(STORAGE_KEY);
      if (storedLogs) {
        this.logs = JSON.parse(storedLogs);
      }
    } catch (e) {
      console.error("Failed to load logs from storage", e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      // If quota exceeded, clear some old logs
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        this.logs = this.logs.slice(-100);
        this.saveToStorage();
      }
    }
  }

  private initInterceptors() {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.error = (...args: any[]) => {
      this.addLog("error", args);
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      this.addLog("warn", args);
      originalWarn.apply(console, args);
    };

    // Optional: Log info but maybe not persist?
    console.info = (...args: any[]) => {
      this.addLog("info", args);
      originalInfo.apply(console, args);
    };

    window.addEventListener("error", (event) => {
      this.addLog("error", [event.message, event.error?.stack]);
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.addLog("error", ["Unhandled Promise Rejection", event.reason]);
    });
  }

  private addLog(level: LogLevel, args: any[]) {
    const message = args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
      .join(" ");

    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      level,
      message,
    };

    // If the last argument looks like a stack trace or an error object, extract it
    const lastArg = args[args.length - 1];
    if (lastArg instanceof Error) {
      entry.stack = lastArg.stack;
    } else if (typeof lastArg === "string" && lastArg.includes("\n    at ")) {
      entry.stack = lastArg;
    }

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this.saveToStorage();
    this.emit("logs_updated", this.logs);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs].reverse();
  }

  public clearLogs() {
    this.logs = [];
    this.saveToStorage();
    this.emit("logs_updated", this.logs);
  }
}

export const logger = LoggerService.getInstance();
