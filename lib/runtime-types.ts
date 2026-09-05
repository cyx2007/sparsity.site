export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Runtime {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
  MEDIA: {
    put(
      key: string,
      bytes: Uint8Array,
      options: { httpMetadata: { contentType: string } },
    ): Promise<unknown>;
    get(
      key: string,
    ): Promise<{
      body: BodyInit;
      httpMetadata?: { contentType?: string };
    } | null>;
    delete(key: string): Promise<unknown>;
  };
  SITE_OWNER_EMAIL?: string;
  SITE_ORIGIN?: string;
  localIdentity?: (headers: Headers) => string | null;
}
