"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { addTask } from "@/app/actions";
import type { Task } from "@/lib/task-api";
import { UNAVAILABLE_MESSAGE, validateTitle } from "@/lib/task-validation";

export type TaskBoardProps = { initialTasks: Task[] | null };

export function TaskBoard({ initialTasks }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formUnavailable, setFormUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateTitle(title);
    if (error !== null) {
      setTitleError(error);
      return;
    }
    setTitleError(null);
    setFormUnavailable(false);
    startTransition(async () => {
      try {
        const result = await addTask({ title, due_date: dueDate || null });
        if (result.status === "created") {
          setTasks((prev) => [...prev, result.task]);
          setTitle("");
          setDueDate("");
        } else if (result.status === "invalid") {
          setTitleError(result.message);
        } else {
          setFormUnavailable(true);
        }
      } catch {
        setFormUnavailable(true);
      }
    });
  }

  return (
    <div className="board">
      <section aria-label="Tasks" className="board-list">
        {initialTasks === null ? (
          <p role="alert" className="notice">
            {UNAVAILABLE_MESSAGE}
          </p>
        ) : tasks.length === 0 ? (
          <p>No tasks yet</p>
        ) : (
          <ul aria-label="Task list" className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className="task-item">
                <span className="task-title">{task.title}</span>
                {task.due_date === null ? (
                  <span className="task-due">No due date</span>
                ) : (
                  <time dateTime={task.due_date} className="task-due">
                    {task.due_date}
                  </time>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <form aria-label="Add task" noValidate onSubmit={onSubmit} className="board-form">
        {formUnavailable && (
          <p role="alert" className="notice">
            {UNAVAILABLE_MESSAGE}
          </p>
        )}
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "task-title-error" : undefined}
        />
        {titleError && (
          <p id="task-title-error" className="field-error">
            {titleError}
          </p>
        )}
        <label htmlFor="task-due-date">Due date</label>
        <input
          id="task-due-date"
          name="due_date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          Add task
        </button>
      </form>
    </div>
  );
}
