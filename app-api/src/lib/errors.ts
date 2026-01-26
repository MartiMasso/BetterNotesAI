// app-api/src/lib/errors.ts

export type HttpError = Error & {
  statusCode?: number;
  log?: string;
  code?: string;
};

export function trimHugeLog(s: string, max = 60000) {
  if (s.length <= max) return s;
  return s.slice(-max);
}

export function makeHttpError(message: string, statusCode: number, log?: string, code?: string): HttpError {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (log) err.log = log;
  if (code) err.code = code;
  return err as HttpError;
}

export function extractExecOutput(e: any): { stdout?: string; stderr?: string } {
  return {
    stdout: typeof e?.stdout === "string" ? e.stdout : undefined,
    stderr: typeof e?.stderr === "string" ? e.stderr : undefined,
  };
}