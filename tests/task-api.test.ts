import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, listTasks } from "@/lib/task-api";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let out: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.TASK_API_URL = "http://api/";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASK_API_URL;
});

const logs = () =>
  out.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])) as Record<string, unknown>);

describe("listTasks", () => {
  it("returns tasks in order and sends the right request", async () => {
    const tasks = [
      { id: "1", title: "A", due_date: null },
      { id: "2", title: "B", due_date: "2026-01-02" },
    ];
    fetchMock.mockResolvedValue(json(tasks, 200));
    expect(await listTasks()).toEqual({ ok: true, tasks });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api/tasks");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(logs()).toHaveLength(0);
  });

  it("accepts an empty array", async () => {
    fetchMock.mockResolvedValue(json([], 200));
    expect(await listTasks()).toEqual({ ok: true, tasks: [] });
  });

  it.each([
    ["non-array", json({ a: 1 }, 200)],
    ["malformed element", json([{ id: "1", title: 5, due_date: null }], 200)],
    ["503", json({}, 503)],
    ["500 non-JSON", new Response("oops", { status: 500 })],
  ])("is unavailable for %s", async (_n, res) => {
    fetchMock.mockResolvedValue(res);
    expect(await listTasks()).toEqual({ ok: false });
    const l = logs();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ msg: "task api unavailable", op: "list", level: "warn" });
  });

  it("is unavailable on network error and timeout", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await listTasks()).toEqual({ ok: false });
    expect(logs()).toHaveLength(2);
  });

  it("is unavailable without fetching when the env is unset", async () => {
    delete process.env.TASK_API_URL;
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs()).toHaveLength(1);
  });
});

describe("createTask", () => {
  const task = { id: "9", title: " Buy milk ", due_date: null };

  it("posts the title as typed and returns the created task", async () => {
    fetchMock.mockResolvedValue(json(task, 201));
    expect(await createTask({ title: " Buy milk ", due_date: null })).toEqual({
      status: "created",
      task,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api/tasks");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({ title: " Buy milk ", due_date: null });
  });

  it("is unavailable for a malformed 201 body", async () => {
    fetchMock.mockResolvedValue(json({ id: 1 }, 201));
    expect(await createTask({ title: "x", due_date: null })).toEqual({ status: "unavailable" });
  });

  const titleErr = { detail: [{ loc: ["body", "title"], msg: "bad" }] };

  it("maps a 422 on title to the matching message", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(titleErr, 422)));
    expect(await createTask({ title: "   ", due_date: null })).toEqual({
      status: "invalid",
      field: "title",
      message: "Title is required",
    });
    expect(await createTask({ title: "😀".repeat(201), due_date: null })).toEqual({
      status: "invalid",
      field: "title",
      message: "Title must be at most 200 characters",
    });
  });

  it("is unavailable for a 422 on title when the title is fine", async () => {
    fetchMock.mockResolvedValue(json(titleErr, 422));
    expect(await createTask({ title: "😀".repeat(200), due_date: null })).toEqual({
      status: "unavailable",
    });
  });

  it("is unavailable for a 422 on due_date", async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ loc: ["body", "due_date"] }] }, 422));
    expect(await createTask({ title: "", due_date: "x" })).toEqual({ status: "unavailable" });
  });

  it("is unavailable for 503 and logs no title or date", async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    expect(await createTask({ title: "Secret title", due_date: "2026-05-05" })).toEqual({
      status: "unavailable",
    });
    const l = logs();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ op: "create", status: 503 });
    const line = JSON.stringify(l[0]);
    expect(line).not.toContain("Secret title");
    expect(line).not.toContain("2026-05-05");
  });
});
