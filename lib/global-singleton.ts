/**
 * Process-wide singletons keyed on `globalThis`. Next.js dev (and tests) can evaluate a module more than once
 * (separate module graphs for route handlers, pages and server actions), so module-level `let instance`
 * is not enough for state that must be shared across them — the in-memory db, mailer, limiter and dev keys.
 */
const KEY = Symbol.for("whatsappbot.singletons");

type Registry = Map<string, unknown>;

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  g[KEY] ??= new Map();
  return g[KEY];
}

export function globalSingleton<T>(name: string, create: () => T): T {
  const reg = registry();
  if (!reg.has(name)) reg.set(name, create());
  return reg.get(name) as T;
}

export function setGlobalSingleton<T>(name: string, value: T | undefined): void {
  const reg = registry();
  if (value === undefined) reg.delete(name);
  else reg.set(name, value);
}
