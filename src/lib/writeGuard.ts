// A Supabase UPDATE blocked by row-level security does not fail — it matches
// 0 rows and returns no error, so the screen reports success while nothing
// changed. Chain `.select("id")` onto the update and pass the result here so
// the reviewer sees the refusal instead.
export function assertRowsChanged(rows: unknown[] | null, action: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${action} was not saved — your role does not have access to do this.`);
  }
}
