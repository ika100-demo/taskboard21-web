import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/task-api", () => ({ createTask: vi.fn() }));

import { addTask } from "@/app/actions";
import { createTask } from "@/lib/task-api";

const mockCreate = vi.mocked(createTask);

beforeEach(() => {
  mockCreate.mockReset();
});

describe("addTask", () => {
  it("returns invalid without calling createTask for a blank title", async () => {
    const result = await addTask({ title: "  ", due_date: null });
    expect(result).toEqual({ status: "invalid", field: "title", message: "Title is required" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns invalid for a title over 200 code points", async () => {
    const result = await addTask({ title: "x".repeat(201), due_date: null });
    expect(result).toEqual({
      status: "invalid",
      field: "title",
      message: "Title must be at most 200 characters",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("normalizes an empty due date to null and returns the createTask result", async () => {
    const created = { status: "created", task: { id: "1", title: "a", due_date: null } } as const;
    mockCreate.mockResolvedValue(created);
    await expect(addTask({ title: "a", due_date: "" })).resolves.toBe(created);
    expect(mockCreate).toHaveBeenCalledWith({ title: "a", due_date: null });
  });

  it("passes a due date and an unavailable result through", async () => {
    mockCreate.mockResolvedValue({ status: "unavailable" });
    await expect(addTask({ title: "a", due_date: "2026-12-01" })).resolves.toEqual({
      status: "unavailable",
    });
    expect(mockCreate).toHaveBeenCalledWith({ title: "a", due_date: "2026-12-01" });
  });
});
