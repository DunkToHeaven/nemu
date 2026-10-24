/**
 * Lupa kata sandi untuk admin/supervisor.
 *
 * KENAPA TIDAK "kirim email": aplikasi ini belum punya pengirim email. Menulis
 * "kami sudah mengirim tautan ke email Anda" tanpa SMTP/Resend terpasang adalah
 * kebohongan yang membuat pengguna menunggu selamanya.
 *
 * Skema yang dipakai:
 *   1. POST /auth/forgot  -> membuat token acak 32 byte, disimpan sebagai hash,
 *      berlaku 60 menit, sekali pakai. Token dikembalikan SEKALI.
 *   2. POST /auth/reset   -> menukar token dengan kata sandi baru.
 *
 * Bila nanti `RESEND_API_KEY` (atau SMTP) dikonfigurasi, fungsi `deliverReset`
 * tinggal mengirim tautan yang sama lewat email — alur tokennya tidak berubah.
 *
 * Keamanan:
 *  - Balasan selalu sama ("bila email terdaftar, tautan dibuat") supaya tidak
 *    bisa dipakai menebak email mana yang ada.
 *  - Token disimpan sebagai hash; bocornya tabel tidak langsung memberi akses.
 *  - Permintaan baru membatalkan token lama (trigger di migrasi 010).
 *  - Semua sesi pengguna dicabut setelah kata sandi diganti.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSecret } from "@/server/crypto";
import { sql } from "@/server/db";
import { errors, ok, parseBody } from "@/server/http";
import { checkRateLimit } from "@/server/rate-limit";

const TTL_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Apakah pengiriman email tersedia. Dipakai UI untuk memilih teks yang jujur. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

/**
 * Kirim tautan reset lewat email. Mengembalikan false bila belum dikonfigurasi.
 * Sengaja tidak melempar error: kegagalan email tidak boleh memberi tahu
 * penyerang apakah email terdaftar.
 */
async function deliverReset(email: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Nemu <onboarding@resend.dev>",
        to: [email],
        subject: "Reset kata sandi Nemu",
        html:
          `<p>Klik tautan ini untuk membuat kata sandi baru (berlaku ${TTL_MINUTES} menit):</p>` +
          `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
          "<p>Abaikan email ini bila Anda tidak meminta reset.</p>",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function handleForgotPassword(request: Request): Promise<Response> {
  const body = await parseBody(request, z.object({ email: z.string().trim().email().max(200) }));
  const email = body.email.toLowerCase();

  const limit = await checkRateLimit({
    bucket: `forgot:ip:${request.headers.get("x-forwarded-for") ?? "local"}`,
    // Default ketat (5/jam). Bisa dinaikkan lewat env untuk pengujian; nilai
    // default TIDAK dilonggarkan.
    limit: Number(process.env.RATE_LIMIT_FORGOT ?? 5),
    windowSeconds: 3600,
  });
  if (!limit.allowed) throw errors.locked(limit.retryAfterSeconds);

  const rows = await sql<{ id: string; role: string; tenant_slug: string | null }[]>`
    SELECT id, role, tenant_slug FROM users
    WHERE lower(email) = ${email} AND active AND role <> 'worker'
    LIMIT 1
  `;
  const user = rows[0];

  // Balasan seragam: jangan bocorkan apakah email terdaftar.
  const generic = {
    message:
      "Bila email itu terdaftar sebagai admin, tautan reset sudah diproses. " +
      "Periksa kotak masuk Anda.",
    emailSent: emailConfigured(),
  };

  // Pekerja tidak punya email/password — reset-nya lewat admin gudang.
  // Respons untuk email tak terdaftar HARUS identik dengan yang terdaftar,
  // termasuk tidak menyebut field token sama sekali.
  if (!user) return ok(generic);

  const token = randomBytes(32).toString("base64url");
  const id = `pr_${randomBytes(6).toString("hex")}`;
  const expires = new Date(Date.now() + TTL_MINUTES * 60_000);

  await sql`
    INSERT INTO password_resets (id, user_id, token_hash, expires_at, requested_ip)
    VALUES (${id}, ${user.id}, ${hashToken(token)}, ${expires},
            ${request.headers.get("x-forwarded-for") ?? null})
  `;

  const origin = new URL(request.url).origin;
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

  const sent = await deliverReset(email, resetUrl);
  if (!sent) {
    // Belum ada pengirim email: token tidak dikirim ke klien (akan menjadi
    // lubang pengambilalihan akun). Operator membuat tautan lewat skrip.
    console.warn(
      `[reset] email belum dikonfigurasi; token untuk ${email} tidak dikirim. ` +
        `Jalankan: node scripts/reset-password.mjs --email ${email}`,
    );
  }

  return ok({ ...generic, emailSent: sent });
}

export async function handleResetPassword(request: Request): Promise<Response> {
  const body = await parseBody(
    request,
    z.object({
      token: z.string().min(20).max(200),
      password: z.string().min(8).max(200),
    }),
  );

  const rows = await sql<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }[]>`
    SELECT id, user_id, expires_at, used_at FROM password_resets
    WHERE token_hash = ${hashToken(body.token)}
    LIMIT 1
  `;
  const reset = rows[0];
  if (!reset) throw errors.badRequest("Tautan reset tidak sah.");
  if (reset.used_at) throw errors.badRequest("Tautan ini sudah dipakai. Minta tautan baru.");
  if (new Date(reset.expires_at).getTime() < Date.now()) {
    throw errors.badRequest("Tautan sudah kedaluwarsa. Minta tautan baru.");
  }

  const passwordHash = await hashSecret(body.password);

  await sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now()
            WHERE id = ${reset.user_id}`;
  await sql`UPDATE password_resets SET used_at = now() WHERE id = ${reset.id}`;
  // Kata sandi berubah -> semua sesi lama harus mati.
  await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${reset.user_id}`;

  return ok({ ok: true, message: "Kata sandi diperbarui. Silakan masuk dengan kata sandi baru." });
}

/**
 * Info untuk UI: apakah email tersedia, dan berapa lama tautan berlaku.
 * Tanpa ini, halaman lupa-password akan menjanjikan email yang tidak dikirim.
 */
export async function forgotInfo(): Promise<Response> {
  return ok({ emailSent: emailConfigured(), ttlMinutes: TTL_MINUTES });
}
