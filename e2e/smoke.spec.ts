import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Read-only, so it runs in every environment. A smoke test that creates or changes data also carries
// @writes in its title (or { tag: "@writes" }) and then runs only in dev (#474).

test("the root page loads at the base URL @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the task board shows the add form and a list or empty state @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("form", { name: "Add task" })).toBeVisible();
  const tasks = page.getByRole("region", { name: "Tasks" });
  await expect(tasks.getByRole("list", { name: "Task list" }).or(tasks.getByText("No tasks yet"))).toBeVisible();
  await expect(tasks.getByRole("alert")).toHaveCount(0);
});

test("adding a task appends it to the list @smoke @writes", async ({ page }) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  const items = page.getByRole("list", { name: "Task list" }).getByRole("listitem");
  await expect(items.last()).toContainText(title);
});
