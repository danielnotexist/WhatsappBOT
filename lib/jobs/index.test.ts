import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { GOOGLE_BASE_SCOPES, GOOGLE_SCOPES, normalizeScopes } from "@/lib/google/oauth";
import { setWaSenderForTests } from "@/lib/wa";
import { RecordingWaSender } from "@/lib/wa/sender";
import { getJobDeps } from "./index";

describe("job wiring — Gmail in the morning summary", () => {
  let db: MemoryDb;
  beforeEach(() => {
    vi.stubEnv("DATA_MODE", "memory");
    db = new MemoryDb();
    setDbForTests(db);
    setWaSenderForTests(new RecordingWaSender());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTests(undefined);
    setWaSenderForTests(undefined);
  });

  it("only for a connection that granted gmail.readonly, and GOOGLE_GMAIL_READ_ENABLED=false turns it off for everyone", async () => {
    const reader = await db.createUser("reader@example.com");
    db.seedConnection(reader.id, "google", "reader@gmail.com").scopes = normalizeScopes([...GOOGLE_BASE_SCOPES, GOOGLE_SCOPES.gmailReadonly]);
    const base = await db.createUser("base@example.com");
    db.seedConnection(base.id, "google", "base@gmail.com").scopes = normalizeScopes([...GOOGLE_BASE_SCOPES]);
    const gmailOf = async (user: typeof reader) => (await getJobDeps().googleFor!(user))?.gmail ?? null;

    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "true");
    expect(await gmailOf(reader)).not.toBeNull();
    expect(await gmailOf(base)).toBeNull();

    // the kill switch: the earlier grant stays at Google, but the summary stops reading the inbox
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "false");
    expect(await gmailOf(reader)).toBeNull();
    expect((await getJobDeps().googleFor!(reader))!.google).toBeTruthy(); // the calendar part stays
    // a bad value fails closed instead of failing the job
    vi.stubEnv("GOOGLE_GMAIL_READ_ENABLED", "maybe");
    expect(await gmailOf(reader)).toBeNull();
  });
});
