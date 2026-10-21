import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A tiny in-memory stand-in for the supabase-js query builder — enough PostgREST for `SupabaseDb` in the unit tests
 * (users, audit_log, connections, link_tokens…): select (with the column list applied, so secret columns stay out
 * unless asked for), insert, update, upsert(onConflict), delete, eq / neq / is, order, limit, single / maybeSingle.
 * Never touches the network; `calls` records every operation so a test can assert what was written.
 */
type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "neq" | "is"; value: unknown };

const DEFAULTS: Record<string, () => Row> = {
  users: () => ({ name: null, business_name: null, business_type: null, timezone: "Asia/Jerusalem", morning_time: "07:30", locale: "he-IL", profile: {}, deleted_at: null }),
  connections: () => ({ status: "active", revoked_at: null, tenant_id: null, scopes: [] }),
};

export class FakeSupabase {
  tables = new Map<string, Row[]>();
  calls: { table: string; op: string; payload?: unknown }[] = [];

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  rpc(name: string): Promise<{ data: null; error: { message: string } }> {
    return Promise.resolve({ data: null, error: { message: `rpc ${name} is not faked` } });
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflict: string[] = [];
  private filters: Filter[] = [];
  private columns: string[] | null = null;
  private ordering: { col: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(cols?: string): this {
    this.columns = cols && cols !== "*" ? cols.split(",").map((c) => c.trim()) : null;
    return this;
  }
  insert(row: Row | Row[]): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  upsert(row: Row, opts: { onConflict?: string } = {}): this {
    this.op = "upsert";
    this.payload = row;
    this.conflict = (opts.onConflict ?? "id").split(",").map((c) => c.trim());
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push({ col, op: "eq", value });
    return this;
  }
  neq(col: string, value: unknown): this {
    this.filters.push({ col, op: "neq", value });
    return this;
  }
  is(col: string, value: unknown): this {
    this.filters.push({ col, op: "is", value });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.ordering = { col, ascending: opts.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.col.includes("->")) throw new Error(`json filter ${f.col} is not faked`);
      const v = row[f.col];
      if (f.op === "eq") return v === f.value;
      if (f.op === "neq") return v !== f.value;
      return (v ?? null) === f.value;
    });
  }

  private project(row: Row): Row {
    if (!this.columns) return { ...row };
    return Object.fromEntries(this.columns.map((c) => [c, row[c] ?? null]));
  }

  private run(): Row[] {
    const rows = this.db.rows(this.table);
    this.db.calls.push({ table: this.table, op: this.op, payload: this.payload ?? undefined });
    const now = new Date().toISOString();
    switch (this.op) {
      case "insert": {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
        return list.map((r) => {
          const row: Row = { id: randomUUID(), created_at: now, ...(DEFAULTS[this.table]?.() ?? {}), ...r };
          if (this.table === "users" && rows.some((x) => x.email === row.email && !x.deleted_at)) throw new Error("duplicate key value violates unique constraint");
          rows.push(row);
          return row;
        });
      }
      case "upsert": {
        const r = this.payload as Row;
        const existing = rows.find((x) => this.conflict.every((c) => x[c] === r[c]));
        if (existing) return [Object.assign(existing, r)];
        const row = { id: randomUUID(), created_at: now, ...(DEFAULTS[this.table]?.() ?? {}), ...r };
        rows.push(row);
        return [row];
      }
      case "update": {
        const hit = rows.filter((x) => this.matches(x));
        for (const x of hit) Object.assign(x, this.payload);
        return hit;
      }
      case "delete": {
        const hit = rows.filter((x) => this.matches(x));
        this.db.tables.set(this.table, rows.filter((x) => !hit.includes(x)));
        return hit;
      }
      default: {
        let hit = rows.filter((x) => this.matches(x));
        if (this.ordering) {
          const { col, ascending } = this.ordering;
          hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (this.max !== null) hit = hit.slice(0, this.max);
        return hit;
      }
    }
  }

  then<A = { data: unknown; error: { message: string } | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    let result: { data: unknown; error: { message: string } | null };
    try {
      const rows = this.run().map((r) => this.project(r));
      if (this.mode === "many") result = { data: rows, error: null };
      else if (rows.length > 1) result = { data: null, error: { message: "more than one row" } };
      else if (rows.length === 0) result = this.mode === "single" ? { data: null, error: { message: "no rows" } } : { data: null, error: null };
      else result = { data: rows[0], error: null };
    } catch (e) {
      result = { data: null, error: { message: (e as Error).message } };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}
