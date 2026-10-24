/**
 * Perbaiki pembacaan sesi ganda.
 *
 * `master.ts` menerima `tenant` sebagai argumen dari rute, tetapi menamainya
 * `_tenant` (tanda "tidak dipakai") dan memanggil `requireSession()` lagi di
 * dalam. Akibatnya SATU request mengirim DUA query ke pool global — dan pool
 * itu hanya punya 5 slot. Beberapa halaman bersamaan langsung menghabiskannya,
 * lalu semua request berikutnya menunggu slot selamanya: "load terus" tanpa
 * error dan tanpa batas waktu.
 *
 * Perbaikan: pakai `tenant` yang sudah diberikan rute; hanya peran yang masih
 * perlu diperiksa di dalam handler.
 */
import re
import pathlib

P = pathlib.Path(r"C:\Users\user\Downloads\nemu-frontend\src\server\handlers\master.ts")
s = P.read_text(encoding="utf-8")

# 1. Parameter `_tenant` -> `tenant`
s = s.replace("_tenant: string", "tenant: string")

# 2. Di dalam fungsi bertanda tangan `tenant: string`, buang requireSession/requireRole
#    yang hanya dipakai untuk mengambil tenant, dan pakai argumennya.
s = s.replace("  const session = await requireSession();\n  const db = tenantPool(session.tenant);",
              "  const db = tenantPool(tenant);")
s = s.replace("  const session = await requireRole(\"admin\");\n  const db = tenantPool(session.tenant);",
              "  const session = await requireRole(\"admin\");\n  const db = tenantPool(tenant);")

# 3. Sisa pemakaian session.tenant -> tenant
s = s.replace("tenantPool(session.tenant)", "tenantPool(tenant)")
s = s.replace("session.tenant", "tenant")

P.write_text(s, encoding="utf-8", newline="\n")

left = s.count("requireSession();")
print("requireSession tersisa:", left)
print("tenantPool(tenant):", s.count("tenantPool(tenant)"))
