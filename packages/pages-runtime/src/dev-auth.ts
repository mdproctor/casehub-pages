export interface DevAuthConfig {
  readonly backendUrl: string;
  readonly identities?: readonly string[];
}

export function createDevAuthTokenFn(
  sessionStorageKey = "pages-dev-auth-token",
): () => string | null {
  return () => {
    try {
      return sessionStorage.getItem(sessionStorageKey);
    } catch {
      return null;
    }
  };
}
