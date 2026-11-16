import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ addTask: vi.fn() }));

import { addTask } from "@/app/actions";
import { TaskBoard } from "@/app/_components/task-board";

const mockAdd = vi.mocked(addTask);
const UNAVAILABLE = "Tasks are unavailable right now. Please try again later.";

beforeEach(() => {
  mockAdd.mockReset();
});

function form() {
  return screen.getByRole("form", { name: "Add task" });
}

function fillAndSubmit(title: string, date = "") {
  fireEvent.change(within(form()).getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(within(form()).getByLabelText("Due date"), { target: { value: date } });
  fireEvent.click(within(form()).getByRole("button", { name: "Add task" }));
}

describe("TaskBoard", () => {
  it("renders tasks with due date or 'No due date'", () => {
    render(
      <TaskBoard
        initialTasks={[
          { id: "1", title: "A", due_date: "2026-12-01" },
          { id: "2", title: "B", due_date: null },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2026-12-01");
    expect(items[1]).toHaveTextContent("No due date");
  });

  it("shows the empty state", () => {
    render(<TaskBoard initialTasks={[]} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("keeps the list notice after a successful add when the list was unavailable", async () => {
    mockAdd.mockResolvedValue({ status: "created", task: { id: "1", title: "A", due_date: null } });
    render(<TaskBoard initialTasks={null} />);
    fillAndSubmit("A");
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith({ title: "A", due_date: null }));
    await waitFor(() => expect(within(form()).getByLabelText("Title")).toHaveValue(""));
    expect(within(screen.getByRole("region", { name: "Tasks" })).getByRole("alert")).toHaveTextContent(
      UNAVAILABLE,
    );
  });

  it("does not call addTask for an invalid title", () => {
    render(<TaskBoard initialTasks={[]} />);
    fillAndSubmit("   ", "2026-12-01");
    expect(mockAdd).not.toHaveBeenCalled();
    expect(within(form()).getByText("Title is required")).toBeInTheDocument();
    expect(within(form()).getByLabelText("Due date")).toHaveValue("2026-12-01");
  });

  it("shows the form notice when the action rejects", async () => {
    mockAdd.mockRejectedValue(new Error("boom"));
    render(<TaskBoard initialTasks={[]} />);
    fillAndSubmit("A");
    expect(await within(form()).findByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(within(form()).getByLabelText("Title")).toHaveValue("A");
  });

  it("shows an invalid message returned by the action", async () => {
    mockAdd.mockResolvedValue({ status: "invalid", field: "title", message: "Title is required" });
    render(<TaskBoard initialTasks={[]} />);
    fillAndSubmit("A");
    expect(await within(form()).findByText("Title is required")).toBeInTheDocument();
  });
});
