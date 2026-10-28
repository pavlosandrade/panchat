export interface LastErrorInfo {
  time: string;
  type: "interaction" | "lavalink" | "voice" | "fatal";
  command?: string;
  message: string;
  stack?: string;
}

let lastError: LastErrorInfo | null = null;

export function recordBotError(info: Omit<LastErrorInfo, "time">): void {
  lastError = {
    time: new Date().toISOString(),
    ...info,
  };
}

export function getLastError(): LastErrorInfo | null {
  return lastError;
}
