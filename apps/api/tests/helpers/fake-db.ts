export interface RecordedStep {
  name: string;
  args: unknown[];
}

export interface RecordedOp {
  root: string;
  steps: RecordedStep[];
}

/**
 * Drizzle-style fluent chain: any method returns the chain, awaiting it yields `result`
 * (or the value returned by `result` when it is a function, evaluated at await time).
 */
export function fakeChain(result: unknown, steps: RecordedStep[] = []): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(typeof result === 'function' ? result() : result).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        steps.push({ name: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy: object = new Proxy({}, handler);
  return proxy;
}

/**
 * Fake transaction: every top-level call (select/insert/update/delete/execute) consumes the next
 * queued result when its chain is awaited, and is recorded so tests can assert on what was written.
 */
export type OpResolver = (op: RecordedOp) => unknown;

export function createFakeTx(
  results: unknown[] = [],
  resolver?: OpResolver,
): { tx: never; ops: RecordedOp[] } {
  const ops: RecordedOp[] = [];
  const queue = [...results];

  const tx = new Proxy(
    {},
    {
      get(_target, root) {
        return (...args: unknown[]) => {
          const op: RecordedOp = { root: String(root), steps: [{ name: String(root), args }] };
          ops.push(op);
          return fakeChain(() => {
            // Evaluated when the chain is awaited, so the resolver can inspect the recorded from/where steps.
            const resolved = resolver?.(op);
            if (resolved !== undefined) return resolved;
            return queue.length > 0 ? queue.shift() : [];
          }, op.steps);
        };
      },
    },
  );

  return { tx: tx as never, ops };
}

export function stepArg(op: RecordedOp, name: string, index = 0): unknown {
  return op.steps.find((step) => step.name === name)?.args[index];
}

export function insertsInto(ops: RecordedOp[], table: unknown): RecordedOp[] {
  return ops.filter((op) => op.root === 'insert' && op.steps[0]?.args[0] === table);
}

export function updatesOf(ops: RecordedOp[], table: unknown): RecordedOp[] {
  return ops.filter((op) => op.root === 'update' && op.steps[0]?.args[0] === table);
}

/** Makes tx.transaction(cb) run cb against the same fake, the way a savepoint reuses the connection. */
export function withSavepoints(tx: never): never {
  const wrapped: unknown = new Proxy(tx as object, {
    get(target, prop, receiver) {
      if (prop === 'transaction') return (cb: (inner: unknown) => unknown) => cb(wrapped);
      return Reflect.get(target, prop, receiver);
    },
  });
  return wrapped as never;
}

type MockableDb = Record<string, unknown>;

/**
 * Points a mocked `db` at one fake whose queue is consumed in call order, whether the call is made
 * directly (db.select) or inside db.transaction(cb) / a nested tx.transaction(cb).
 */
export function installFakeDb(
  db: MockableDb,
  results: unknown[] = [],
  resolver?: OpResolver,
): { tx: never; ops: RecordedOp[] } {
  const fake = createFakeTx(results, resolver);
  const tx = withSavepoints(fake.tx);
  const target = tx as unknown as Record<string, (...args: unknown[]) => unknown>;

  for (const method of ['select', 'insert', 'update', 'delete', 'execute']) {
    const fn = db[method] as { mockImplementation?: (impl: (...args: unknown[]) => unknown) => void } | undefined;
    fn?.mockImplementation?.((...args: unknown[]) => target[method]?.(...args));
  }
  const transaction = db.transaction as
    | { mockImplementation?: (impl: (cb: (t: unknown) => unknown) => unknown) => void }
    | undefined;
  transaction?.mockImplementation?.((cb) => cb(tx));

  return { tx, ops: fake.ops };
}

export function whereOf(op: RecordedOp | undefined, dialect: { sqlToQuery: (q: never) => { sql: string; params: unknown[] } }): { sql: string; params: unknown[] } {
  const args = op?.steps.find((s) => s.name === 'where')?.args ?? [];
  const parts = args.map((arg) => dialect.sqlToQuery(arg as never));
  return { sql: parts.map((p) => p.sql).join(', '), params: parts.flatMap((p) => p.params) };
}

/** The table an op reads from or writes to (select -> from(), insert/update/delete -> the table argument). */
export function tableOf(op: RecordedOp): unknown {
  if (op.root === "select") return op.steps.find((s) => s.name === "from")?.args[0];
  return op.steps[0]?.args[0];
}

/** The keys of a select({...}) projection, to tell apart two selects from the same table. */
export function selectedKeys(op: RecordedOp): string[] {
  const projection = op.steps[0]?.args[0];
  return projection && typeof projection === "object" ? Object.keys(projection as object) : [];
}
