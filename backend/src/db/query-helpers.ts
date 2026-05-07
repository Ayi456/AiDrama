export type MutationRunResult = Record<string, unknown> & {
  lastInsertRowid: number
}

declare module 'drizzle-orm/query-promise' {
  interface QueryPromise<T> {
    all(): Promise<T>
    run(): Promise<MutationRunResult>
  }
}

export function normalizeMutationResult(result: unknown): MutationRunResult {
  const packet = Array.isArray(result) ? result[0] : result
  const record = packet && typeof packet === 'object'
    ? packet as Record<string, unknown>
    : {}
  const insertId = 'insertId' in record ? Number(record.insertId) : 0

  return {
    ...record,
    lastInsertRowid: Number.isFinite(insertId) ? insertId : 0,
  }
}

export function installQueryExecutionHelpers(query: object) {
  let proto = Object.getPrototypeOf(query)
  while (proto && proto !== Object.prototype) {
    if (!Object.prototype.hasOwnProperty.call(proto, 'all')) {
      Object.defineProperty(proto, 'all', {
        value: function all(this: { execute(): Promise<unknown> }) {
          return this.execute()
        },
      })
    }
    if (!Object.prototype.hasOwnProperty.call(proto, 'run')) {
      Object.defineProperty(proto, 'run', {
        value: async function run(this: { execute(): Promise<unknown> }) {
          return normalizeMutationResult(await this.execute())
        },
      })
    }
    proto = Object.getPrototypeOf(proto)
  }
}
