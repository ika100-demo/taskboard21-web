import { listTasks } from "@/lib/task-api";

import { TaskBoard } from "./_components/task-board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <>
      <h1>Task board</h1>
      <TaskBoard initialTasks={result.ok ? result.tasks : null} />
    </>
  );
}
