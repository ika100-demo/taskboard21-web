import { describe, expect, it } from "vitest";
import {
  TITLE_REQUIRED,
  TITLE_TOO_LONG,
  validateTitle,
} from "@/lib/task-validation";

describe("validateTitle", () => {
  it("rejects an empty title", () => {
    expect(validateTitle("")).toBe(TITLE_REQUIRED);
  });

  it("rejects spaces and tabs only", () => {
    expect(validateTitle("  \t ")).toBe(TITLE_REQUIRED);
  });

  it("accepts exactly 200 characters", () => {
    expect(validateTitle("a".repeat(200))).toBeNull();
  });

  it("rejects 201 characters", () => {
    expect(validateTitle("a".repeat(201))).toBe(TITLE_TOO_LONG);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(validateTitle("😀".repeat(200))).toBeNull();
    expect(validateTitle("😀".repeat(201))).toBe(TITLE_TOO_LONG);
  });
});
