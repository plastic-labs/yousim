import { expect, test, afterEach } from "bun:test";
import { rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStorage, resolveDbPath, SCHEMA_VERSION } from "../storage/sqlite";
import { Database } from "bun:sqlite";

const dirs: string[] = [];
function tmpDb(name = "yousim.db") {
  const d = mkdtempSync(join(tmpdir(), "yousim-test-"));
  dirs.push(d);
  return join(d, name);
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

test("resolveDbPath precedence: explicit > YOUSIM_DB > XDG > home", () => {
  const savedDb = process.env.YOUSIM_DB;
  const savedXdg = process.env.XDG_DATA_HOME;
  try {
    delete process.env.YOUSIM_DB;
    delete process.env.XDG_DATA_HOME;
    expect(resolveDbPath()).toContain(".yousim");

    process.env.XDG_DATA_HOME = "/xdg";
    expect(resolveDbPath()).toBe("/xdg/yousim/yousim.db");

    process.env.YOUSIM_DB = "/env/db.sqlite";
    expect(resolveDbPath()).toBe("/env/db.sqlite");

    expect(resolveDbPath("/explicit.db")).toBe("/explicit.db");
  } finally {
    savedDb === undefined ? delete process.env.YOUSIM_DB : (process.env.YOUSIM_DB = savedDb);
    savedXdg === undefined ? delete process.env.XDG_DATA_HOME : (process.env.XDG_DATA_HOME = savedXdg);
  }
});

test("a session survives closing and reopening the database", async () => {
  const p = tmpDb();
  const a = new SqliteStorage(p);
  await a.upsertUser("local", "local");
  const s = await a.createSession("local", { mode: "simulator", name: "Ada" });
  await a.insertMessage(s.id, "local", "/locate Ada", true);
  await a.insertMessage(s.id, "local", "found her", false);
  await a.insertSummary(s.id, "local", "a summary");
  a.close();

  // This is the actual guarantee: closing the process must not lose work.
  const b = new SqliteStorage(p);
  const sessions = await b.getSessions("local");
  expect(sessions).toHaveLength(1);
  expect(sessions[0].metadata).toEqual({ mode: "simulator", name: "Ada" });

  const msgs = await b.getMessages(s.id, "local");
  expect(msgs.map((m) => m.content)).toEqual(["/locate Ada", "found her"]);
  expect(msgs.map((m) => m.is_user)).toEqual([true, false]);
  expect((await b.getLatestSummary(s.id, "local"))?.content).toBe("a summary");
  b.close();
});

test("creates its parent directory on first run", async () => {
  const p = join(mkdtempSync(join(tmpdir(), "yousim-test-")), "nested", "deep", "yousim.db");
  dirs.push(p.split("/nested")[0]);
  const s = new SqliteStorage(p);
  expect(s.path).toBe(p);
  await s.upsertUser("local", "local");
  s.close();
});

test("records its schema version", () => {
  const p = tmpDb();
  new SqliteStorage(p).close();
  const d = new Database(p);
  expect((d.query("PRAGMA user_version").get() as any).user_version).toBe(SCHEMA_VERSION);
  d.close();
});

test("refuses a database written by a newer build instead of corrupting it", () => {
  const p = tmpDb();
  const d = new Database(p);
  d.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 50};`);
  d.close();
  expect(() => new SqliteStorage(p)).toThrow(/schema v/);
});

test("opening an existing database twice does not duplicate or wipe rows", async () => {
  const p = tmpDb();
  const a = new SqliteStorage(p);
  await a.upsertUser("local", "local");
  const s = await a.createSession("local", {});
  await a.insertMessage(s.id, "local", "one", true);
  a.close();

  // migrate() runs again on every open; it must be idempotent.
  const b = new SqliteStorage(p);
  await b.insertMessage(s.id, "local", "two", false);
  expect(await b.getMessages(s.id, "local")).toHaveLength(2);
  expect(await b.getSessions("local")).toHaveLength(1);
  b.close();
});

test("sessions are scoped by user", async () => {
  const p = tmpDb();
  const s = new SqliteStorage(p);
  await s.upsertUser("a", "a");
  await s.upsertUser("b", "b");
  const sa = await s.createSession("a", {});
  await s.insertMessage(sa.id, "a", "secret", true);

  expect(await s.getSessions("b")).toHaveLength(0);
  expect(await s.getMessages(sa.id, "b")).toHaveLength(0);
  expect(await s.getSession(sa.id, "b")).toBeNull();
  s.close();
});
