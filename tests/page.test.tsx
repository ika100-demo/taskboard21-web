import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { UNAVAILABLE_MESSAGE } from "@/lib/task-validation";

vi.mock("@/app/actions", () => ({ addTask: vi.fn() }));

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TASK_API_URL", "http://tasks.test");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders a single Task board heading and the add form", async () => {
    fetchMock.mockResolvedValue(json([]));
    render(await HomePage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Task board" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });

  it("lists the tasks in the order received", async () => {
    fetchMock.mockResolvedValue(
      json([
        { id: "1", title: "First", due_date: "2026-12-01" },
        { id: "2", title: "Second", due_date: null },
      ]),
    );
    render(await HomePage());
    const items = within(screen.getByRole("list", { name: "Task list" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("First");
    expect(items[0]).toHaveTextContent("2026-12-01");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[1]).toHaveTextContent("No due date");
  });

  it("shows an empty state when there are no tasks", async () => {
    fetchMock.mockResolvedValue(json([]));
    render(await HomePage());
    expect(within(screen.getByRole("region", { name: "Tasks" })).getByText("No tasks yet")).toBeInTheDocument();
  });

  it("shows the unavailable notice, without throwing, when the API fails", async () => {
    fetchMock.mockResolvedValue(json({ detail: "down" }, 503));
    render(await HomePage());
    expect(within(screen.getByRole("region", { name: "Tasks" })).getByRole("alert")).toHaveTextContent(UNAVAILABLE_MESSAGE);
    expect(screen.getByRole("form", { name: "Add task" })).toBeInTheDocument();
  });

  it("shows the unavailable notice when TASK_API_URL is unset", async () => {
    vi.stubEnv("TASK_API_URL", "");
    render(await HomePage());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: "Tasks" })).getByRole("alert")).toHaveTextContent(UNAVAILABLE_MESSAGE);
  });
});
