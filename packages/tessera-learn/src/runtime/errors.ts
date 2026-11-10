export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
