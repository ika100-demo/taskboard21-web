# Design — 001 Task board start page that lists tasks and adds a task through the Task API

## Decisions

- The browser never calls the Task API. The list is fetched in the start page's Server Component; the add goes through one Server Action (`app/actions.ts`) called from a client component. This follows the spec's note for this repo and keeps `TASK_API_URL` server-only (never `NEXT_PUBLIC_*`).
- One server-side client module `lib/task-api.ts` owns every call to the Task API: base URL, the 2 s timeout, response checking and the mapping to a closed result type. Pages and actions never touch `fetch` or HTTP statuses, so the "anything the contract does not list means unavailable" rule (AC-001.5, AC-001.6) lives in one place.
- The add form is a client component with **controlled inputs** and the action called from `onSubmit` inside `startTransition`, not `<form action={...}>`. React 19 resets an uncontrolled form after a form action, which would lose the typed values that AC-001.4 and AC-001.6 require us to keep. Fields are cleared only on `created` (AC-001.3).
- The new task is appended to the list from the action's result, client-side (no `router.refresh()`, no reload): AC-001.3 wants the returned task at the end within 2 s, and a refetch would add a second API round trip to the budget.
- The title is checked in the browser before sending (no POST for an invalid title, AC-001.4) and again in the action (defense in depth, same pure function in `lib/task-validation.ts`). The title is sent **as typed** (not trimmed), because the API stores it "as sent".
- Title length is counted in Unicode code points (`[...title].length`), matching Python's `len` on the API side. The title input has **no** `maxLength` attribute, so a person can type more than 200 characters and see the message.
- All user-facing texts live in the client-safe `lib/task-validation.ts`, so the client component never imports runtime code from `lib/task-api.ts` (only `import type`).
- The page is `export const dynamic = "force-dynamic"` and every fetch uses `cache: "no-store"`: `next build` must not call the API, and each visit shows current data.
- No retries anywhere (contract: POST is not idempotent, GET budget is 2 s).
- When the list could not be loaded and a later add succeeds, the list area keeps the unavailable notice (a reload shows the truth); showing only the new task would pretend the board is empty.
- No ADR: the "server-only API access" pattern is already fixed by the system plan for this repo; everything else here is local to this feature.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `lib/task-validation.ts` | `validateTitle` and the user-facing message constants; pure, importable by client and server | new |
| `lib/task-api.ts` | `listTasks`, `createTask` against `TASK_API_URL`; timeout, response checks, logging. Imported at runtime only from `app/page.tsx` and `app/actions.ts` (the `server-only` package is not a dependency, so this is by convention) | new |
| `app/actions.ts` | `"use server"` action `addTask` | new |
| `app/_components/task-board.tsx` | `"use client"` list + add form, local list state | new |
| `app/page.tsx` | async Server Component: loads tasks, renders heading + `TaskBoard` | changed (replaces the template landing page) |
| `app/globals.css` | styles for the board | changed |
| `docs/env-vars.md` | documents `TASK_API_URL` | changed |

## Contract

### Upstream (Task API, binding from the spec)

`GET {TASK_API_URL}/tasks` and `POST {TASK_API_URL}/tasks` exactly as in the spec's Contract section. The client strips one trailing `/` from `TASK_API_URL` before appending `/tasks`.

### `lib/task-validation.ts`

```ts
export const TITLE_REQUIRED = "Title is required";
export const TITLE_TOO_LONG = "Title must be at most 200 characters";
export const UNAVAILABLE_MESSAGE = "Tasks are unavailable right now. Please try again later.";
export const TITLE_MAX = 200;
export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;
/** null when valid. Empty or whitespace-only -> TITLE_REQUIRED; more than 200 code points -> TITLE_TOO_LONG. */
export function validateTitle(title: string): TitleError | null;
```

### `lib/task-api.ts`

```ts
export type Task = { id: string; title: string; due_date: string | null };
export const TASK_API_TIMEOUT_MS = 2000;

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { status: "created"; task: Task }
  | { status: "invalid"; field: "title"; message: "Title is required" | "Title must be at most 200 characters" }
  | { status: "unavailable" };

export function listTasks(): Promise<ListResult>;
export function createTask(input: { title: string; due_date: string | null }): Promise<CreateResult>;
```

Behaviour (tests stub `globalThis.fetch` and set `process.env.TASK_API_URL`):

- Both read `process.env.TASK_API_URL` **at call time**. Unset or empty → `{ ok: false }` / `unavailable`, no fetch, one log line.
- Both call `fetch` with `signal: AbortSignal.timeout(2000)`, `cache: "no-store"`, header `Accept: application/json`; `createTask` uses method `POST`, header `Content-Type: application/json` and body `{"title": <as given>, "due_date": <string or null>}`.
- `listTasks`: `{ ok: true, tasks }` only for status `200` whose body parses as a JSON array in which every element has a string `id`, a string `title` and a `due_date` that is a string or `null`. Order is kept as received. Everything else (other status, non-JSON, non-array, malformed element, abort/timeout, network error) → `{ ok: false }`.
- `createTask`:
  - `201` with a valid task object → `created` with that task.
  - `422` whose `detail` is an array with an entry whose `loc` ends in `"title"` → `invalid` with the title rule's message (`Title is required` for empty/whitespace, `Title must be at most 200 characters` for over 200 code points). If the title passes both checks (the API rejected a title the website considers valid), the result is `unavailable`.
  - `422` for any other field, and anything else (including `201` with a malformed body, `503`, other statuses, non-JSON, timeout, network error) → `unavailable`.
- Logging: on every unavailable outcome exactly one `logger.warn("task api unavailable", { op: "list" | "create", status?: number, error?: string })`. The title and due date are never logged.

### `app/actions.ts`

```ts
"use server";
export async function addTask(input: { title: string; due_date: string | null }): Promise<CreateResult>;
```

- Runs `validateTitle(input.title)` first; when invalid returns `{ status: "invalid", field: "title", message }` **without** calling `createTask` (no POST, AC-001.4).
- An empty-string `due_date` is normalized to `null`.
- Otherwise returns `createTask(...)` unchanged. It never throws for API failures.

### `app/_components/task-board.tsx`

```ts
"use client";
export function TaskBoard(props: { initialTasks: Task[] | null }): JSX.Element; // null = list could not be loaded
```

Rendered DOM (the accessible names and texts below are binding for tests):

- A `<section aria-label="Tasks">` containing exactly one of:
  - `initialTasks === null` → `<p role="alert">Tasks are unavailable right now. Please try again later.</p>` (AC-001.5);
  - list empty → `<p>No tasks yet</p>` (AC-001.2);
  - otherwise `<ul aria-label="Task list">` with one `<li>` per task, in state order; each `<li>` contains the title and then either the `due_date` string verbatim (`YYYY-MM-DD`, in a `<time dateTime=...>`) or the text `No due date` (AC-001.1).
- Below it a `<form aria-label="Add task" noValidate>` containing, in this order:
  - when the last submit was `unavailable`: `<p role="alert">Tasks are unavailable right now. Please try again later.</p>` as the form's first child, above the fields (AC-001.6). Tests distinguish it from the list notice by scoping with `within(getByRole("form", { name: "Add task" }))` vs `within(getByRole("region", { name: "Tasks" }))`;
  - `<label for="task-title">Title</label>` + `<input id="task-title" name="title" type="text">` (no `maxLength`, no `required`); when a title error is present the input has `aria-invalid="true"` and `aria-describedby="task-title-error"`, and `<p id="task-title-error">` with the message follows the input directly (AC-001.4);
  - `<label for="task-due-date">Due date</label>` + `<input id="task-due-date" name="due_date" type="date">`;
  - `<button type="submit">Add task</button>`, disabled while a submit is pending.
- Submit flow:
  1. `validateTitle(title)`; if invalid show the message, keep both values, do **not** call `addTask`.
  2. Otherwise clear previous messages and call `addTask({ title, due_date: dueDate || null })` in `startTransition`.
  3. `created` → append `task` to the list state ("No tasks yet" is replaced by the list; an unavailable list notice stays), clear both fields and messages (AC-001.3).
  4. `invalid` → show the message next to the title, keep values.
  5. `unavailable`, or the action promise rejects → show the form notice, keep values, list unchanged (AC-001.6).

### `app/page.tsx`

```ts
export const dynamic = "force-dynamic";
export default async function HomePage(): Promise<JSX.Element>;
```

Renders `<h1>Task board</h1>` and `<TaskBoard initialTasks={result.ok ? result.tasks : null} />`. It never throws on an API failure, so the response stays `200` (AC-001.5).

## Testing notes

- Acceptance tests go in new files (e.g. `tests/acceptance/001-task-board.test.tsx`), not in `tests/page.test.tsx`: that file tests the template landing page and is rewritten by plan task t4.
- Page-level tests: stub `fetch`, set `TASK_API_URL`, then `render(await HomePage())`. Board-level tests: `vi.mock("@/app/actions")` and render `TaskBoard` directly. A "no POST" check asserts the stubbed `fetch` (or the mocked `addTask`) was not called.
- Local Playwright runs start the app without `TASK_API_URL`, so the page shows the unavailable notice; e2e checks that need data run against a deployment (`SMOKE_BASE_URL`).

## Gitops

None: `TASK_API_URL=http://taskboard21-api` is wired by the system plan's gitops part. Port, probes and image are unchanged.
