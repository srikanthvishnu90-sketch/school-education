import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SEED_STUDENTS } from "@/application";
import { createPgClient, type SqlClient } from "@/adapters/supabase";
import { COUNSELOR_ID } from "./roles";
import { TEACHER_ID } from "./teacher";

/**
 * Real credential auth. Passwords are salted + scrypt-hashed and verified in
 * constant time (never compared as plaintext). The hashing is pure; only STORAGE
 * differs between adapters:
 *
 *   - In-memory (default): a process-lifetime Map, zero infrastructure.
 *   - Postgres (when DATABASE_URL is set): an `auth.accounts` table that survives
 *     restarts. Accounts are service-role-only — never reachable from a client.
 *
 * The store is the authority on WHO an account is and WHAT role it has; the
 * session cookie carries only the id.
 */

export type AccountRole = "student" | "teacher" | "counselor";

/** The demo district every seeded/self-signup account belongs to. A real build
 * resolves the tenant from the email domain or an invite at sign-up. */
export const DEMO_TENANT_ID = "district-demo";

export interface Account {
  id: string;
  email: string;
  role: AccountRole;
  tenantId: string;
  salt: string;
  hash: string;
}

const KEYLEN = 64;

function derive(password: string, salt: string): Buffer {
  return scryptSync(password, salt, KEYLEN);
}

/** A fresh salted hash for a new password. */
function hashNew(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: derive(password, salt).toString("hex") };
}

/** Constant-time password check against a stored account. */
function passwordMatches(account: Account, password: string): boolean {
  const candidate = derive(password, account.salt);
  const expected = Buffer.from(account.hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** The password every seeded demo account shares — shown on the login screen. */
export const DEMO_PASSWORD = "plumb1234";

/** The seed set both adapters provision idempotently, so the demo always works. */
function seedAccounts(): Account[] {
  const make = (id: string, email: string, role: AccountRole): Account => {
    const { salt, hash } = hashNew(DEMO_PASSWORD);
    return { id, email: email.toLowerCase(), role, tenantId: DEMO_TENANT_ID, salt, hash };
  };
  const accounts = [
    make(TEACHER_ID, "rivera@demo.school", "teacher"),
    make(COUNSELOR_ID, "okafor@demo.school", "counselor"),
  ];
  for (const s of SEED_STUDENTS) {
    const first = s.id.replace(/^student-/, "");
    accounts.push(make(s.id, `${first}@demo.school`, "student"));
  }
  return accounts;
}

function slug(email: string): string {
  return email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function newStudentId(email: string): string {
  return `student-${slug(email)}-${randomBytes(3).toString("hex")}`;
}

// --- The store port -----------------------------------------------------------

interface CredentialStore {
  verify(email: string, password: string): Promise<Account | null>;
  roleForId(id: string): Promise<AccountRole | null>;
  tenantForId(id: string): Promise<string | null>;
  emailTaken(email: string): Promise<boolean>;
  createStudent(email: string, password: string): Promise<string>;
}

function createMemoryStore(): CredentialStore {
  const byEmail = new Map<string, Account>();
  const byId = new Map<string, Account>();
  const put = (a: Account): void => {
    byEmail.set(a.email, a);
    byId.set(a.id, a);
  };
  seedAccounts().forEach(put);
  return {
    async verify(email, password) {
      const a = byEmail.get(email.trim().toLowerCase());
      return a !== undefined && passwordMatches(a, password) ? a : null;
    },
    async roleForId(id) {
      return byId.get(id)?.role ?? null;
    },
    async tenantForId(id) {
      return byId.get(id)?.tenantId ?? null;
    },
    async emailTaken(email) {
      return byEmail.has(email.trim().toLowerCase());
    },
    async createStudent(email, password) {
      const normalized = email.trim().toLowerCase();
      if (byEmail.has(normalized)) {
        throw new Error("An account with that email already exists.");
      }
      const { salt, hash } = hashNew(password);
      const account: Account = {
        id: newStudentId(normalized),
        email: normalized,
        role: "student",
        tenantId: DEMO_TENANT_ID,
        salt,
        hash,
      };
      put(account);
      return account.id;
    },
  };
}

const ACCOUNTS_DDL = `
create schema if not exists auth;
create table if not exists auth.accounts (
  id text primary key,
  email text not null unique,
  role text not null check (role in ('student','teacher','counselor')),
  tenant_id text not null default '${DEMO_TENANT_ID}',
  salt text not null,
  hash text not null,
  created_at timestamptz not null default now()
);
alter table auth.accounts add column if not exists tenant_id text not null default '${DEMO_TENANT_ID}';
`;

type RawAccount = {
  id: string;
  email: string;
  role: AccountRole;
  tenantId: string;
  salt: string;
  hash: string;
} & Record<string, unknown>;

async function createPgStore(client: SqlClient): Promise<CredentialStore> {
  await client.query(ACCOUNTS_DDL);
  // Seed the demo accounts once — insert-if-absent so restarts don't re-hash.
  for (const a of seedAccounts()) {
    await client.query(
      `insert into auth.accounts (id, email, role, tenant_id, salt, hash)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (email) do nothing`,
      [a.id, a.email, a.role, a.tenantId, a.salt, a.hash],
    );
  }
  const findByEmail = async (email: string): Promise<Account | null> => {
    const { rows } = await client.query<RawAccount>(
      `select id, email, role, tenant_id as "tenantId", salt, hash from auth.accounts where email = $1`,
      [email.trim().toLowerCase()],
    );
    return rows[0] ?? null;
  };
  return {
    async verify(email, password) {
      const a = await findByEmail(email);
      return a !== null && passwordMatches(a, password) ? a : null;
    },
    async roleForId(id) {
      const { rows } = await client.query<{ role: AccountRole } & Record<string, unknown>>(
        "select role from auth.accounts where id = $1",
        [id],
      );
      return rows[0]?.role ?? null;
    },
    async tenantForId(id) {
      const { rows } = await client.query<{ tenantId: string } & Record<string, unknown>>(
        `select tenant_id as "tenantId" from auth.accounts where id = $1`,
        [id],
      );
      return rows[0]?.tenantId ?? null;
    },
    async emailTaken(email) {
      return (await findByEmail(email)) !== null;
    },
    async createStudent(email, password) {
      const normalized = email.trim().toLowerCase();
      if (await findByEmail(normalized)) {
        throw new Error("An account with that email already exists.");
      }
      const { salt, hash } = hashNew(password);
      const id = newStudentId(normalized);
      await client.query(
        `insert into auth.accounts (id, email, role, tenant_id, salt, hash) values ($1, $2, 'student', $3, $4, $5)`,
        [id, normalized, DEMO_TENANT_ID, salt, hash],
      );
      return id;
    },
  };
}

// --- Store selection (Postgres when configured, else in-memory) ---------------

let storePromise: Promise<CredentialStore> | null = null;

function store(): Promise<CredentialStore> {
  if (storePromise === null) {
    const url = process.env.DATABASE_URL ?? "";
    const usePostgres =
      process.env.WORLD_BACKEND === "postgres" || url.length > 0;
    storePromise = usePostgres
      ? createPgStore(createPgClient(url))
      : Promise.resolve(createMemoryStore());
  }
  return storePromise;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Account | null> {
  return (await store()).verify(email, password);
}

export async function roleForId(id: string): Promise<AccountRole | null> {
  return (await store()).roleForId(id);
}

/** The tenant (district) an account belongs to — the isolation boundary. */
export async function tenantForId(id: string): Promise<string | null> {
  return (await store()).tenantForId(id);
}

export async function emailTaken(email: string): Promise<boolean> {
  return (await store()).emailTaken(email);
}

export async function createStudentAccount(
  email: string,
  password: string,
): Promise<string> {
  return (await store()).createStudent(email, password);
}
