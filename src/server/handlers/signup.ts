/**
 * Pendaftaran organisasi baru (sign up publik).
 *
 * Alur yang diminta:
 *   1. Pengunjung mendaftar dengan email + password → menjadi **admin** dan
 *      otomatis mendapat organisasi (schema Postgres) sendiri.
 *   2. Admin membuat akun pekerja (PIN 4 digit) dari menu Pengguna.
 *   3. Pekerja login seperti biasa; datanya mengikuti gudang admin yang
 *      membuat akunnya.
 *
 * Tidak ada verifikasi email: untuk produk gratis yang langsung dicoba, itu
 * hanya menambah gesekan. Bila nanti perlu, tambahkan kolom `email_verified_at`
 * dan blokir login sampai terverifikasi.
 */
import { z } from "zod";
import { createSession, setSessionCookie } from "@/server/auth";
import { hashSecret } from "@/server/crypto";
import { sql } from "@/server/db";
import { errors, ok, parseBody } from "@/server/http";
import { checkRateLimit } from "@/server/rate-limit";
import { createTenant } from "@/server/tenant";

const signupSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export async function handleSignup(request: Request): Promise<Response> {
  const body = await parseBody(request, signupSchema);
  const email = body.email.toLowerCase();

  // Batas per IP: mendaftar membuat schema database, jadi ini operasi mahal.
  // Bisa dinaikkan lewat env untuk pengujian — nilai default TIDAK dilonggarkan,
  // dan `scripts/smoke-ratelimit.mjs` memverifikasi batas ketat tetap bekerja.
  const limit = await checkRateLimit({
    bucket: `signup:ip:${request.headers.get("x-forwarded-for") ?? "local"}`,
    limit: Number(process.env.RATE_LIMIT_SIGNUP ?? 5),
    windowSeconds: 3600,
  });
  if (!limit.allowed) throw errors.locked(limit.retryAfterSeconds);

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (existing[0]) {
    throw errors.conflict("EMAIL_TAKEN", "Email ini sudah terdaftar. Coba masuk saja.");
  }

  const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = await hashSecret(body.password);

  // Kode login admin dibuat dari email, unik per tenant (dicek ulang di DB).
  const baseCode =
    email
      .split("@")[0]
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10) || "ADMIN";

  // 1. Buat organisasi (schema Postgres sendiri) lebih dulu: bila gagal, tidak
  //    ada akun yatim yang tertinggal.
  const tenant = await createTenant({ name: body.orgName, ownerId: userId });

  // 2. Akun admin pemilik.
  try {
    await sql`
      INSERT INTO users (id, code, name, role, email, password_hash, tenant_slug)
      VALUES (${userId}, ${baseCode}, ${body.name}, 'admin', ${email}, ${passwordHash}, ${tenant.slug})
    `;
  } catch {
    // Kode bentrok di tenant lain: ulangi dengan akhiran acak.
    const fallback = `${baseCode}${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
    await sql`
      INSERT INTO users (id, code, name, role, email, password_hash, tenant_slug)
      VALUES (${userId}, ${fallback}, ${body.name}, 'admin', ${email}, ${passwordHash}, ${tenant.slug})
    `;
  }

  // 3. Pemilik dicatat di tenant.
  await sql`UPDATE tenants SET owner_id = ${userId} WHERE slug = ${tenant.slug}`;

  // 4. Langsung masuk — pengguna baru tidak perlu mengetik ulang kredensial.
  const sessionId = await createSession(userId, "admin", tenant.slug);
  const response = ok(
    {
      user: { id: userId, code: baseCode, name: body.name, role: "admin", email },
      tenant: { slug: tenant.slug, name: tenant.name },
      redirectTo: "/app",
    },
    { status: 201 },
  );
  setSessionCookie(response, sessionId, request);
  return response;
}

/** Apakah email sudah terpakai — untuk validasi bertahap di form. */
export async function checkEmail(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").toLowerCase();
  if (!email) throw errors.badRequest("Parameter email wajib diisi.");
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
  `;
  return ok({ available: rows.length === 0 });
}
