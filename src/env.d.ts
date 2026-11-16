interface ImportMetaEnv {
  /** Set by the build from ALLOW_INDEXING. False unless explicitly opened. */
  readonly ALLOW_INDEXING: boolean;
  /** Set by the build from ROUTE_CACHE. False unless explicitly turned on. */
  readonly ROUTE_CACHE: boolean;
}

// The one runtime API used directly: the Worker purging its own cache.
declare module "cloudflare:workers" {
  export const cache: {
    purge(options: { tags: string[] }): Promise<{
      success: boolean;
      errors: { code: number; message: string }[];
    }>;
  };
}
