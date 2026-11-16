---
spec_id: 001-task-board-start-page-that-lists-tasks
title: Task board start page that lists tasks and adds a task through the Task API
status: approved
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard21-gitops:001-persistent-tasks-in-postgres-with-a-web
---

# 001 — Task board start page that lists tasks and adds a task through the Task API

## Problem

The Task API keeps tasks in its own memory. Every restart or redeploy loses them, and two running instances each show a different board. People also have no way to use the board except by calling the API directly, because the website has no task features yet. This spec makes tasks durable and shared, stored in a Postgres database, and gives people a web page where they can see the board and add tasks to it.

## System context

Slice of the system plan `001-persistent-tasks-in-postgres-with-a-web` in `ika100-demo/taskboard21-gitops` for `taskboard21-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.3** Given tasks A, B and C exist, created in that order, when a person opens the website's start page, then it shows the three tasks in creation order, each with its title and its due date as `YYYY-MM-DD`, or "No due date" when it has none.
- **AC-001.4** Given no task exists in the environment, when a person opens the website's start page, then it shows the text "No tasks yet" and the form for adding a task.
- **AC-001.5** Given the start page is open, when a person enters the title "Buy milk", optionally a due date, and submits the form, then within 2 seconds the task appears at the end of the list without a manual page reload, the form is emptied, and `GET /tasks` returns the task with the same title and due date.
- **AC-001.6** Given the start page is open, when a person submits the form with a title that is empty, only whitespace, or longer than 200 characters, then the page shows "Title is required" or "Title must be at most 200 characters" next to the title field, keeps what was typed, and no task is created.
- **AC-001.8** Given the Task API answers with an error or cannot be reached, when a person opens the start page or submits the form, then the page shows "Tasks are unavailable right now. Please try again later." instead of the list or above the form, keeps what was typed in the form, and the page itself still loads.

### Contract

Caller: `taskboard21-web` (server side). Callee: `taskboard21-api`, base URL from `TASK_API_URL` (dev: `http://taskboard21-api`). JSON bodies, `Content-Type: application/json`, no authentication (spec non-goal). The resource contract is unchanged from the Task API's spec 001.

**Task object**

```json
{"id": "<string, server-assigned, unique in the environment>", "title": "<string, as sent>", "due_date": "YYYY-MM-DD" | null}
```

**`GET /tasks`**

- `200` → JSON array of every task in creation order, oldest first, no limit; `[]` when none is stored.
- `503` → `{"detail": "Task storage is unavailable"}` when the database cannot be reached.

**`POST /tasks`** — request `{"title": string, "due_date"?: "YYYY-MM-DD" | null}`; unknown fields ignored.

- `201` → the created task object; it is the last element of the next `GET /tasks`.
- `422` → FastAPI validation body `{"detail": [{"loc": ["body", "<field>"], "msg": "...", "type": "...", "input": ...}]}`; the field is the last element of `loc`. Title rule: 1 to 200 characters, not only whitespace; `due_date` must be a real calendar date. Nothing is stored.
- `503` → `{"detail": "Task storage is unavailable"}`; nothing is stored.

**`GET /ready`** (probe, not called by the website) — `200 {"status": "ready"}` when the database answers, else `503 {"status": "not ready"}`. `GET /health` stays `200` during a database outage, so pods are not restarted for it.

**Website rendering rules** — `due_date` shown verbatim as `YYYY-MM-DD`, `null` shown as "No due date"; list order is the API's order; the website does not re-sort.

### Errors

- Error bodies are JSON with a `detail` key: a string for `503`, FastAPI's array of `{loc, msg, type, input}` for `422`.
- The website validates the title before sending (same rule as the API), so a `422` is not expected; if one arrives for `title`, it shows "Title is required" (empty or whitespace) or "Title must be at most 200 characters" (over 200) next to the title field and keeps the input; a `422` for any other field is treated like an unlisted response.
- Any status or body the contract does not list (including `5xx`, a non-JSON body, a connection error, and a `200` that is not a JSON array) is treated as "API unavailable": the website shows "Tasks are unavailable right now. Please try again later." (instead of the list on load, above the form on submit), keeps the form's input, and its own page still returns `200`. It logs one line with the status or error, never the title.
- No retries: `POST /tasks` is not idempotent, and a retried `GET` would push the page past its time budget.

### Timeouts

- Website → `GET /tasks` (page render): 2 s total; on timeout, the unavailable state above.
- Website → `POST /tasks` (submit): 2 s total; on timeout, the unavailable state above the form, input kept. The website does not know whether the task was stored; a reload shows the truth.
- Task API → Postgres: connect timeout 1 s and statement timeout 2 s per request; when either is hit or the connection fails, the request answers `503` (well within the 3 s of the API criterion). `GET /ready` checks the database with a 1 s budget.
- When the database is down, readiness fails and Kubernetes takes the API pods out of the Service; the website then gets connection errors instead of `503`, which it treats the same way. Once the database is back, readiness passes and the stored tasks are served again.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASK_API_URL=http://taskboard21-api`

### Notes for this repo

The Task API base URL comes from the server-side env var TASK_API_URL (cluster-internal, never NEXT_PUBLIC_*): call the
API only from the Next.js server (Server Component for the list, a Server Action or app/api route handler for the add),
never from the browser. Add TASK_API_URL to docs/env-vars.md. Tests stub the Task API per the Contract.

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the Task API's GET /tasks returns tasks A, B and C in that order, when a person opens the start page /, then it lists A, B and C in that order, each with its title and its due_date as YYYY-MM-DD, or "No due date" when due_date is null (system AC-001.3)
- **AC-001.2** Given the Task API's GET /tasks returns an empty array, when a person opens the start page, then it shows the text "No tasks yet" and the add-task form with a title field and a date field (system AC-001.4)
- **AC-001.3** Given the start page is open, when a person enters the title "Buy milk", optionally picks a due date, and submits, then the page sends POST /tasks with that title and due_date (null when none), and within 2 seconds the returned task appears at the end of the list without a page reload and both fields are emptied (system AC-001.5)
- **AC-001.4** Given the start page is open, when a person submits a title that is empty or only whitespace, then "Title is required" shows next to the title field; when the title is longer than 200 characters, then "Title must be at most 200 characters" shows there; in both cases the typed values stay and no POST /tasks is sent (system AC-001.6)
- **AC-001.5** Given the Task API answers GET /tasks with anything but 200 and a JSON array, or does not answer within 2 seconds, when a person opens the start page, then the page still loads with status 200 and shows "Tasks are unavailable right now. Please try again later." instead of the list, with the form below it (system AC-001.8)
- **AC-001.6** Given the start page is open, when a submitted POST /tasks gets an answer other than 201 or 422, or none within 2 seconds, then "Tasks are unavailable right now. Please try again later." shows above the form, the typed title and due date stay in the form, and the list is unchanged (system AC-001.8)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-16 created from the system plan, with its criteria (spec 147)
- 2026-11-16 approved
