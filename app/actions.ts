"use server";

import { createTask } from "@/lib/task-api";
import type { CreateResult } from "@/lib/task-api";
import { validateTitle } from "@/lib/task-validation";

export async function addTask(input: {
  title: string;
  due_date: string | null;
}): Promise<CreateResult> {
  const message = validateTitle(input.title);
  if (message !== null) return { status: "invalid", field: "title", message };
  return createTask({ title: input.title, due_date: input.due_date || null });
}
