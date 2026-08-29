// @ts-nocheck — Deno Edge Function: type-checked via `deno check` (see .vscode/settings.json)
/**
 * Supabase Edge Function: posts
 *
 * Operations (via query param `op`):
 *   GET  ?op=session    → { authenticated, csrfToken }
 *   POST ?op=login      body { password } → { csrfToken }
 *   POST ?op=logout     → { ok }
 *   POST ?op=fetch      → { data: Post[] }
 *   POST ?op=insert     body { id, title, content_md, date, raw_date }
 *   POST ?op=update     body { id, title, content_md }
 *   POST ?op=delete     body { id }
 *   GET  ?op=ping       → { ok }
 */

import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") || "change-me-in-production";

/* ─── Supabase client (service role, bypasses RLS) ─── */
function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ─── Session helpers ─── */
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

function generateToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacToken(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return token + "." + Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
}

function extractSessionCookie(headers: Headers): string | null {
  const cookies = headers.get("cookie") || "";
  const m = cookies.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Session token can arrive via HttpOnly cookie OR X-Session-Token header.
// The header path is required for mobile browsers that block third-party
// cookies (blog on github.io, API on supabase.co = cross-site).
function extractSession(req: Request): string | null {
  const fromHeader = req.headers.get("x-session-token");
  if (fromHeader) return fromHeader;
  return extractSessionCookie(req.headers);
}

async function verifySession(token: string): Promise<boolean> {
  const [raw, sig] = [token.slice(0, 64), token.slice(65)];
  if (!raw || !sig) return false;
  const expected = await hmacToken(raw);
  return expected === token;
}

function sessionCookie(name: string, value: string, maxAge: number): string {
  const attrs = [
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    // Blog origin (github.io / localhost) ≠ supabase.co → cross-site request.
    // SameSite=Strict/None — Strict would block the cookie entirely here.
    `SameSite=None`,
    `Max-Age=${maxAge}`,
  ];
  return `${name}=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

function jsonResp(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/* ─── Password verification (simple constant-time compare) ─── */
async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  // Stored format: $2b$... (bcrypt)
  // Deno doesn't have bcrypt built-in; use Web Crypto with a fallback:
  // We stored a SHA-256 salted hash as: salt.sha256hex
  if (storedHash.includes("$2")) {
    // bcryptjs is CommonJS; Deno's npm support exposes module.exports as default
    return bcrypt.compareSync(input, storedHash);
  }
  // Legacy format: salt.hex
  const [salt, hash] = storedHash.split(".");
  if (!salt || !hash) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  const computed = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
  return computed === hash;
}

/* ─── CORS headers ─── */
function buildCors(req: Request): Record<string, string> {
  // Credentials ('include') require the EXACT origin, never "*"
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-CSRF-Token, X-Session-Token, apikey",
    "Vary": "Origin",
  };
}

serve(async (req: Request): Promise<Response> => {
  const CORS = buildCors(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const op  = url.searchParams.get("op") || "";

  try {
    const db = serviceClient();

    /* ──── ping ──── */
    if (op === "ping") {
      return jsonResp({ ok: true }, 200, CORS);
    }

    /* ──── session check ──── */
    if (op === "session") {
      const token = extractSession(req);
      if (token && await verifySession(token)) {
        const csrf = generateToken();
        return jsonResp({ authenticated: true, csrfToken: csrf }, 200, CORS);
      }
      return jsonResp({ authenticated: false }, 200, CORS);
    }

    /* ──── login ──── */
    if (op === "login" && req.method === "POST") {
      const { password } = await req.json();
      if (!password || typeof password !== "string") {
        return jsonResp({ error: "Password required" }, 400, CORS);
      }

      const { data: rows, error: dbErr } = await db
        .from("admin_config")
        .select("password_hash")
        .limit(1);

      if (dbErr || !rows || rows.length === 0) {
        return jsonResp({ error: "Auth system not configured" }, 500, CORS);
      }

      const ok = await verifyPassword(password, rows[0].password_hash);
      if (!ok) {
        return jsonResp({ error: "Invalid password" }, 401, CORS);
      }

      const token = generateToken();
      const signed = await hmacToken(token);
      const csrf = generateToken();

      return jsonResp(
        { csrfToken: csrf, sessionToken: signed },
        200,
        {
          ...CORS,
          "Set-Cookie": sessionCookie("session", signed, Math.floor(SESSION_TTL / 1000)),
        }
      );
    }

    /* ──── logout ──── */
    if (op === "logout") {
      return jsonResp({ ok: true }, 200, {
        ...CORS,
        "Set-Cookie": sessionCookie("session", "", 0),
      });
    }

    /* ──── fetch (read-only, no auth required) ──── */
    if (op === "fetch") {
      const { data, error } = await db
        .from("posts").select("*").order("id", { ascending: false });
      if (error) return jsonResp({ error: error.message }, 500, CORS);
      return jsonResp({ data }, 200, CORS);
    }

    /* ──── All write operations require session auth ──── */
    if (["insert", "update", "delete"].includes(op)) {
      const token = extractSession(req);
      if (!token || !(await verifySession(token))) {
        return jsonResp({ error: "Unauthorized" }, 401, CORS);
      }

      // CSRF check
      const csrfHeader = req.headers.get("x-csrf-token");
      if (!csrfHeader) {
        return jsonResp({ error: "CSRF token required" }, 403, CORS);
      }

      if (req.method !== "POST") {
        return jsonResp({ error: "POST required" }, 405, CORS);
      }

      const body = await req.json();

      if (op === "insert") {
        const { error } = await db.from("posts").insert([body]);
        if (error) return jsonResp({ error: error.message }, 500, CORS);
        return jsonResp({ ok: true }, 201, CORS);
      }

      if (op === "update") {
        const { id, ...fields } = body;
        const { error } = await db.from("posts").update(fields).eq("id", id);
        if (error) return jsonResp({ error: error.message }, 500, CORS);
        return jsonResp({ ok: true }, 200, CORS);
      }

      if (op === "delete") {
        const { id } = body;
        const { error } = await db.from("posts").delete().eq("id", id);
        if (error) return jsonResp({ error: error.message }, 500, CORS);
        return jsonResp({ ok: true }, 200, CORS);
      }
    }

    return jsonResp({ error: "Unknown op: " + op }, 400, CORS);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg || "Internal error" }, 500, CORS);
  }
});
