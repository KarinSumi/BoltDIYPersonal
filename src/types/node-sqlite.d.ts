declare module 'node:sqlite' {
  interface StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    iterate(...params: unknown[]): IterableIterator<unknown>
  }

  class DatabaseSync {
    constructor(path: string, options?: { readonly?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }

  export { DatabaseSync }
}
