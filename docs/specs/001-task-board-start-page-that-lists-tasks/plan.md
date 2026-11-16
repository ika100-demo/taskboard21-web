---
spec_id: 001-task-board-start-page-that-lists-tasks
shape: web-nextjs
spec_hash: 215b41406397
summary: Start page lists tasks from the Task API and adds a task through a Server Action, with validation and an unavailable
  state
tasks:
- id: t1
  title: Add shared title validation and user-facing messages
  files: [lib/task-validation.ts, tests/task-validation.test.ts]
  covers: [AC-001.4]
  parallel_safe: true
  depends_on: []
  done: true
- id: t2
  title: Add server-side Task API client and document TASK_API_URL
  files: [lib/task-api.ts, tests/task-api.test.ts, docs/env-vars.md]
  covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.5, AC-001.6]
  parallel_safe: true
  depends_on: []
  done: true
- id: t4
  title: Replace the landing page with the task board start page
  files: [app/page.tsx, tests/page.test.tsx, e2e/home.spec.ts, e2e/smoke.spec.ts, app/actions.ts, app/_components/task-board.tsx,
    app/globals.css, tests/task-board.test.tsx, tests/actions.test.ts]
  covers: [AC-001.1, AC-001.2, AC-001.5, AC-001.3, AC-001.4, AC-001.6]
  parallel_safe: true
  depends_on: [t2, t1]
---

# Plan — 001 Task board start page that lists tasks and adds a task through the Task API

Contract and DOM details: [design.md](design.md). Levels: t1, t2 → t3 → t4.

## t1 — Add shared title validation and user-facing messages

**Files:** lib/task-validation.ts, tests/task-validation.test.ts
**Covers:** AC-001.4
**Goal:** one pure module, safe to import from client and server, that decides whether a title is valid and holds the exact user-facing texts.

**Implementation notes:**
- Export `TITLE_REQUIRED`, `TITLE_TOO_LONG`, `UNAVAILABLE_MESSAGE`, `TITLE_MAX = 200`, `TitleError`, `validateTitle(title)` exactly as in design.md.
- Empty or whitespace-only (`title.trim() === ""`) → `TITLE_REQUIRED`; more than 200 code points (`[...title].length > 200`) → `TITLE_TOO_LONG`; else `null`. Exactly 200 is valid.
- No imports from `next`, `node:*` or `@/lib/logger` (it ships to the browser).
- Unit tests: empty, spaces/tabs only, 200 and 201 characters, a 200-code-point title containing emoji.

**Done when:** unit tests pass; `devbox run quality` is clean.

## t2 — Add server-side Task API client and document TASK_API_URL

**Files:** lib/task-api.ts, tests/task-api.test.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.5, AC-001.6
**Goal:** the only code that talks to the Task API: `listTasks` and `createTask` with the 2 s timeout and the strict "anything unlisted is unavailable" mapping from design.md.

**Implementation notes:**
- Export `Task`, `ListResult`, `CreateResult`, `TASK_API_TIMEOUT_MS`, `listTasks`, `createTask` with the signatures in design.md. No import from `lib/task-validation.ts`: the 422 title rule (trimmed empty → required, over 200 code points → too long) is two inline checks here, so t1 and t2 run in parallel.
- Read `process.env.TASK_API_URL` per call; unset/empty → unavailable without fetching; strip one trailing `/`.
- `fetch(url, { signal: AbortSignal.timeout(TASK_API_TIMEOUT_MS), cache: "no-store", headers })`; catch every throw (abort, network, JSON parse) → unavailable.
- Validate bodies with small hand-written type guards (`isTask`); no new dependency.
- 422: an entry with `loc.at(-1) === "title"` → `invalid` with the matching message, or `unavailable` if the title passes both checks; any other 422 → `unavailable`.
- One `logger.warn("task api unavailable", { op, status?, error? })` per unavailable outcome; never log title or due date.
- `docs/env-vars.md`: a "Task API" section with `TASK_API_URL` | _(unset: the board shows the unavailable notice)_ | base URL of `taskboard21-api`, server-side only, set in the gitops repo (dev `http://taskboard21-api`).
- Unit tests with a stubbed `fetch`: 200 array, 200 `[]`, 200 non-array, 200 malformed element, 503, 500 non-JSON, network error, timeout, env unset; 201 valid/malformed, 422 title (empty / long / neither), 422 `due_date`, 503; assert method, URL, headers and body; assert the log line holds no title.

**Done when:** unit tests pass; acceptance tests that exercise `lib/task-api.ts` directly (if any) pass; `devbox run quality` is clean.

## t4 — Replace the landing page with the task board start page

**Files:** app/page.tsx, tests/page.test.tsx, e2e/home.spec.ts, e2e/smoke.spec.ts, app/actions.ts, app/_components/task-board.tsx, app/globals.css, tests/task-board.test.tsx, tests/actions.test.ts
**Covers:** AC-001.1, AC-001.2, AC-001.5, AC-001.3, AC-001.4, AC-001.6
**Goal:** `/` becomes the task board: an async Server Component that loads tasks with `listTasks` and renders `<h1>Task board</h1>` plus `TaskBoard`, always answering 200.

**Implementation notes:**
- `export const dynamic = "force-dynamic"`; `const result = await listTasks()`; `<TaskBoard initialTasks={result.ok ? result.tasks : null} />`; a failure never throws.
- Remove the template landing content (hero, feature cards, get-started) from the page; leave `app/_components/feature-card.tsx` and `icons.tsx` untouched.
- `tests/page.test.tsx`: rewrite for the new page (`render(await HomePage())` with a stubbed `fetch` and `TASK_API_URL`): a single h1 "Task board", the board for ok and unavailable results.
- `e2e/home.spec.ts`: h1 is now "Task board"; drop the "Check health" link assertion but keep requesting `/api/health`; keep the landmark, 404 and phone-width tests. Locally `TASK_API_URL` is unset, so the page must load with the unavailable notice and the form.
- `e2e/smoke.spec.ts`: keep the root check; add a read-only `@smoke` test that the "Add task" form is visible and the "Tasks" region shows a list or "No tasks yet", not the unavailable notice; add a `@smoke @writes` test that adds `smoke-<uuid>` and sees it at the end of the list.

**Done when:** the page-level acceptance tests for AC-001.1, AC-001.2 and AC-001.5 pass; `devbox run ci` is green; `devbox run e2e` passes locally.

**Merged from t3 — Add addTask Server Action and the TaskBoard client component** (acceptance tests render app/page.tsx (t4); t3's board cannot pass them without the page, so the split was a plan mistake):

**Files:** app/actions.ts, app/_components/task-board.tsx, app/globals.css, tests/task-board.test.tsx, tests/actions.test.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6
**Goal:** the interactive board: renders the list / "No tasks yet" / unavailable notice, validates before sending, calls the Server Action, appends the created task and clears the form, or keeps the input and shows the right message.

**Implementation notes:**
- `app/actions.ts`: `"use server"`; `addTask(input)` validates with `validateTitle` (t1) and returns `invalid` without calling `createTask`; normalizes `""` due date to `null`; otherwise returns `createTask` (t2).
- `app/_components/task-board.tsx`: `"use client"`; props `{ initialTasks: Task[] | null }`; state `tasks`, `title`, `dueDate`, `titleError`, `submitUnavailable`; `useTransition` for pending.
- DOM exactly as design.md: `section[aria-label="Tasks"]`, `ul[aria-label="Task list"]`, `form[aria-label="Add task"][noValidate]`, labels "Title" and "Due date", button "Add task", `#task-title-error` linked by `aria-describedby`, the form notice as the form's first child.
- Controlled inputs; call `addTask` from `onSubmit` (`event.preventDefault()`), never via `<form action>`, so values survive failures.
- `created` → append, clear fields and messages; `invalid` → title message; `unavailable` or a rejected promise → form notice; list unchanged on failure.
- Texts come from `@/lib/task-validation`; `Task` and `CreateResult` from `@/lib/task-api` via `import type` only, so no server code reaches the client bundle.
- `app/globals.css`: board, list item, field error and notice styles with the existing design tokens; keep the 375 px no-horizontal-scroll behaviour.
- Unit tests: board with `vi.mock("@/app/actions")`; action with `vi.mock("@/lib/task-api")`.

**Done when:** the acceptance tests for AC-001.3, AC-001.4 and AC-001.6, and the board-level ones for AC-001.1, AC-001.2 and AC-001.5, pass; unit tests pass; `devbox run quality` is clean.

