import { logger } from "@/lib/logger";

export type Task = { id: string; title: string; due_date: string | null };
export const TASK_API_TIMEOUT_MS = 2000;
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { status: "created"; task: Task }
  | {
      status: "invalid";
      field: "title";
      message: "Title is required" | "Title must be at most 200 characters";
    }
  | { status: "unavailable" };

type Op = "list" | "create";

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (typeof v.due_date === "string" || v.due_date === null)
  );
}

function baseUrl(): string | null {
  const raw = process.env.TASK_API_URL;
  if (!raw) return null;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function warn(op: Op, fields: { status?: number; error?: string }): void {
  logger.warn("task api unavailable", { op, ...fields });
}

function titleMessage(
  title: string,
): "Title is required" | "Title must be at most 200 characters" | null {
  if (title.trim() === "") return "Title is required";
  if ([...title].length > 200) return "Title must be at most 200 characters";
  return null;
}

function hasTitleError(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  if (!Array.isArray(detail)) return false;
  return detail.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const loc = (entry as { loc?: unknown }).loc;
    return Array.isArray(loc) && loc.at(-1) === "title";
  });
}

async function readJson(res: Response): Promise<unknown> {
  return (await res.json()) as unknown;
}

export async function listTasks(): Promise<ListResult> {
  const base = baseUrl();
  if (base === null) {
    warn("list", { error: "TASK_API_URL not set" });
    return { ok: false };
  }
  try {
    const res = await fetch(`${base}/tasks`, {
      signal: AbortSignal.timeout(TASK_API_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status !== 200) {
      warn("list", { status: res.status });
      return { ok: false };
    }
    const body = await readJson(res);
    if (!Array.isArray(body) || !body.every(isTask)) {
      warn("list", { status: res.status, error: "unexpected body" });
      return { ok: false };
    }
    return { ok: true, tasks: body };
  } catch (err) {
    warn("list", { error: err instanceof Error ? err.name : "unknown error" });
    return { ok: false };
  }
}

export async function createTask(input: {
  title: string;
  due_date: string | null;
}): Promise<CreateResult> {
  const unavailable = (fields: { status?: number; error?: string }): CreateResult => {
    warn("create", fields);
    return { status: "unavailable" };
  };
  const base = baseUrl();
  if (base === null) return unavailable({ error: "TASK_API_URL not set" });
  try {
    const res = await fetch(`${base}/tasks`, {
      method: "POST",
      signal: AbortSignal.timeout(TASK_API_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
    });
    if (res.status === 201) {
      const body = await readJson(res);
      if (isTask(body)) return { status: "created", task: body };
      return unavailable({ status: res.status, error: "unexpected body" });
    }
    if (res.status === 422) {
      const body = await readJson(res);
      if (hasTitleError(body)) {
        const message = titleMessage(input.title);
        if (message !== null) return { status: "invalid", field: "title", message };
      }
      return unavailable({ status: res.status, error: "unlisted 422" });
    }
    return unavailable({ status: res.status });
  } catch (err) {
    return unavailable({ error: err instanceof Error ? err.name : "unknown error" });
  }
}
