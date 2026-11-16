export const TITLE_REQUIRED = "Title is required";
export const TITLE_TOO_LONG = "Title must be at most 200 characters";
export const UNAVAILABLE_MESSAGE =
  "Tasks are unavailable right now. Please try again later.";
export const TITLE_MAX = 200;

export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;

/** null when valid. Empty or whitespace-only -> TITLE_REQUIRED; more than 200 code points -> TITLE_TOO_LONG. */
export function validateTitle(title: string): TitleError | null {
  if (title.trim() === "") return TITLE_REQUIRED;
  if ([...title].length > TITLE_MAX) return TITLE_TOO_LONG;
  return null;
}
