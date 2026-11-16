import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UNAVAILABLE = "Tasks are unavailable right now. Please try again later.";

type Task = { id: string; title: string; due_date: string | null };

const A: Task = { id: "1", title: "Alpha", due_date: "2026-12-01" };
const B: Task = { id: "2", title: "Bravo", due_date: null };
const C: Task = { id: "3", title: "Charlie", due_date: "2027-01-31" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** Stubs the Task API: one handler for GET /tasks, one for POST /tasks. */
function stubApi(handlers: { get?: Handler; post?: Handler }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toBe("http://task-api.test/tasks");
    const method = methodOf(input, init);
    const handler = method === "POST" ? handlers.post : handlers.get;
    if (!handler) throw new Error(`unexpected ${method}`);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return handler({ ...init, signal });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function posts(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls.filter(([input, init]) => methodOf(input, init) === "POST");
}

/** The HTTP method of a fetch call, whether given in init or on a Request input. */
function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

/** A handler that never answers but rejects when the caller aborts via init.signal. */
const hangsUntilAborted: Handler = (init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const abort = () => reject(signal.reason ?? new DOMException("aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });

function expectBefore(first: Node, second: Node) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

async function renderPage() {
  const { default: HomePage } = await import("@/app/page");
  render(await HomePage());
}

function tasksRegion() {
  return screen.getByRole("region", { name: "Tasks" });
}

function addForm() {
  return screen.getByRole("form", { name: "Add task" });
}

function fill(title: string, date = "") {
  fireEvent.change(within(addForm()).getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(within(addForm()).getByLabelText("Due date"), { target: { value: date } });
}

function submit() {
  fireEvent.click(within(addForm()).getByRole("button", { name: "Add task" }));
}

beforeEach(() => {
  vi.stubEnv("TASK_API_URL", "http://task-api.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("001 task board start page", () => {
  it("AC-001.1 lists the tasks in API order with title and due date or 'No due date'", async () => {
    stubApi({ get: () => json(200, [A, B, C]) });
    await renderPage();
    const items = within(within(tasksRegion()).getByRole("list", { name: "Task list" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Alpha");
    expect(items[0]).toHaveTextContent("2026-12-01");
    expect(items[0]).not.toHaveTextContent("No due date");
    expect(items[1]).toHaveTextContent("Bravo");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("Charlie");
    expect(items[2]).toHaveTextContent("2027-01-31");
  });

  it("AC-001.1 does not re-sort: the API order wins", async () => {
    stubApi({ get: () => json(200, [C, A, B]) });
    await renderPage();
    const items = within(tasksRegion()).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^Charlie/);
    expect(items[1]).toHaveTextContent(/^Alpha/);
    expect(items[2]).toHaveTextContent(/^Bravo/);
  });

  it("AC-001.2 shows 'No tasks yet' and the add form with a title and a date field when the list is empty", async () => {
    stubApi({ get: () => json(200, []) });
    await renderPage();
    expect(within(tasksRegion()).getByText("No tasks yet")).toBeInTheDocument();
    expect(within(addForm()).getByLabelText("Title")).toBeInTheDocument();
    expect(within(addForm()).getByLabelText("Due date")).toHaveAttribute("type", "date");
  });

  it("AC-001.3 posts the title and due date, appends the returned task at the end and empties both fields", async () => {
    const created: Task = { id: "4", title: "Buy milk", due_date: "2026-12-24" };
    const fetchMock = stubApi({
      get: () => json(200, [A, B]),
      post: () => json(201, created),
    });
    await renderPage();
    fill("Buy milk", "2026-12-24");
    submit();
    await waitFor(() => expect(within(tasksRegion()).getAllByRole("listitem")).toHaveLength(3));
    const items = within(tasksRegion()).getAllByRole("listitem");
    expect(items[2]).toHaveTextContent("Buy milk");
    expect(items[2]).toHaveTextContent("2026-12-24");
    expect(within(addForm()).getByLabelText("Title")).toHaveValue("");
    expect(within(addForm()).getByLabelText("Due date")).toHaveValue("");
    const sent = posts(fetchMock);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0][1]?.body))).toEqual({ title: "Buy milk", due_date: "2026-12-24" });
  });

  it("AC-001.3 sends due_date null when no date is picked and replaces 'No tasks yet'", async () => {
    const fetchMock = stubApi({
      get: () => json(200, []),
      post: () => json(201, { id: "9", title: "Buy milk", due_date: null }),
    });
    await renderPage();
    fill("Buy milk");
    submit();
    await waitFor(() => expect(within(tasksRegion()).getAllByRole("listitem")).toHaveLength(1));
    expect(within(tasksRegion()).queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(within(tasksRegion()).getByRole("listitem")).toHaveTextContent("No due date");
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({ title: "Buy milk", due_date: null });
  });

  it.each([
    ["", "Title is required"],
    ["   ", "Title is required"],
    ["x".repeat(201), "Title must be at most 200 characters"],
  ])("AC-001.4 rejects title %j with a message next to the title field, keeps values, sends no POST", async (title, message) => {
    const fetchMock = stubApi({ get: () => json(200, [A]), post: () => json(201, A) });
    await renderPage();
    fill(title, "2026-12-24");
    submit();
    const input = within(addForm()).getByLabelText("Title");
    expect(await within(addForm()).findByText(message)).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(message);
    expect(input).toHaveValue(title);
    expect(within(addForm()).getByLabelText("Due date")).toHaveValue("2026-12-24");
    expect(posts(fetchMock)).toHaveLength(0);
    expect(within(tasksRegion()).getAllByRole("listitem")).toHaveLength(1);
  });

  it("AC-001.4 accepts a title of exactly 200 characters", async () => {
    const title = "x".repeat(200);
    const fetchMock = stubApi({ get: () => json(200, []), post: () => json(201, { id: "5", title, due_date: null }) });
    await renderPage();
    fill(title);
    submit();
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(screen.queryByText("Title must be at most 200 characters")).not.toBeInTheDocument();
  });

  it.each([
    ["status 500", () => json(500, { detail: "boom" })],
    ["status 503", () => json(503, { detail: "Task storage is unavailable" })],
    ["a non-array 200 body", () => json(200, { tasks: [] })],
    ["a non-JSON 200 body", () => new Response("<html>", { status: 200 })],
    ["a timeout error", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a connection error", () => Promise.reject(new TypeError("fetch failed"))],
  ] as [string, Handler][])("AC-001.5 still loads and shows the unavailable message instead of the list on %s", async (_name, get) => {
    stubApi({ get });
    await renderPage();
    expect(within(tasksRegion()).getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(within(tasksRegion()).queryByRole("list")).not.toBeInTheDocument();
    expect(within(tasksRegion()).queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(within(addForm()).getByLabelText("Title")).toBeInTheDocument();
    expectBefore(tasksRegion(), addForm());
  });

  it("AC-001.5 gives up on a GET that never answers after 2 s and shows the unavailable message", async () => {
    stubApi({ get: hangsUntilAborted });
    const started = Date.now();
    await Promise.race([
      renderPage(),
      new Promise((_r, reject) => setTimeout(() => reject(new Error("GET /tasks not aborted within 3.5 s")), 3500)),
    ]);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1500);
    expect(elapsed).toBeLessThan(3500);
    expect(within(tasksRegion()).getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expectBefore(tasksRegion(), addForm());
  }, 8000);

  it.each([
    ["status 500", () => json(500, { detail: "boom" })],
    ["status 503", () => json(503, { detail: "Task storage is unavailable" })],
    ["status 200 without a task", () => json(200, [])],
    ["a timeout error", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a connection error", () => Promise.reject(new TypeError("fetch failed"))],
  ] as [string, Handler][])("AC-001.6 shows the unavailable message above the form, keeps values and list on %s", async (_name, post) => {
    stubApi({ get: () => json(200, [A, B]), post });
    await renderPage();
    fill("Buy milk", "2026-12-24");
    submit();
    const alert = await within(addForm()).findByRole("alert");
    expect(alert).toHaveTextContent(UNAVAILABLE);
    expect(within(addForm()).getByLabelText("Title")).toHaveValue("Buy milk");
    expect(within(addForm()).getByLabelText("Due date")).toHaveValue("2026-12-24");
    const items = within(tasksRegion()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Alpha");
    expect(items[1]).toHaveTextContent("Bravo");
    expect(within(tasksRegion()).queryByRole("alert")).not.toBeInTheDocument();
    expectBefore(alert, within(addForm()).getByLabelText("Title"));
  });

  it("AC-001.6 gives up on a POST that never answers after 2 s, shows the message and keeps values", async () => {
    stubApi({ get: () => json(200, [A, B]), post: hangsUntilAborted });
    await renderPage();
    fill("Buy milk", "2026-12-24");
    const started = Date.now();
    submit();
    const alert = await within(addForm()).findByRole("alert", {}, { timeout: 3500 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
    expect(alert).toHaveTextContent(UNAVAILABLE);
    expectBefore(alert, within(addForm()).getByLabelText("Title"));
    expect(within(addForm()).getByLabelText("Title")).toHaveValue("Buy milk");
    expect(within(tasksRegion()).getAllByRole("listitem")).toHaveLength(2);
  }, 8000);

  it("design: 422 for a valid title is treated as unavailable and keeps values", async () => {
    stubApi({
      get: () => json(200, []),
      post: () => json(422, { detail: [{ loc: ["body", "title"], msg: "x", type: "y", input: "" }] }),
    });
    await renderPage();
    fill("Buy milk", "2026-12-24");
    submit();
    expect(await within(addForm()).findByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(within(addForm()).getByLabelText("Title")).toHaveValue("Buy milk");
  });
});
