/**
 * Cari region pooler Supabase untuk sebuah project.
 *
 * Koneksi langsung `db.<ref>.supabase.co` hanya punya alamat IPv6, dan jaringan
 * ini tidak punya rute IPv6 (ENETUNREACH). Pooler Supabase punya IPv4, tetapi
 * host-nya bergantung pada region project: `aws-0-<region>.pooler.supabase.com`.
 *
 * Region dideteksi TANPA password: server membalas pesan berbeda antara
 * "project tidak ada di region ini" dan "password salah". Yang kedua berarti
 * project ditemukan.
 */
import net from "node:net";

const REF = process.env.SUPABASE_REF ?? "sitbuxaffphzwbwdeuml";
const REGIONS = [
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "ca-central-1",
  "sa-east-1",
];

const PREFIXES = ["aws-0", "aws-1"];

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 8000 });
    let data = "";
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.on("connect", () => {
      // Postgres mengirim pesan startup; cukup tunggu sebentar lalu tutup.
      setTimeout(() => done({ state: "open" }), 400);
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("latin1");
      if (data.length > 8) done({ state: "open" });
    });
    socket.on("timeout", () => done({ state: "timeout" }));
    socket.on("error", (err) => done({ state: "error", code: err.code }));
  });
}

console.log(`\n  mencari pooler untuk project ${REF}\n`);

const found = [];
for (const prefix of PREFIXES) {
  for (const region of REGIONS) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const result = await probe(host, 5432);
    if (result.state === "open") {
      console.log(`  TERBUKA  ${host}`);
      found.push(host);
    } else if (result.code !== "ENOTFOUND") {
      console.log(`  ${result.state.padEnd(8)} ${host}  (${result.code ?? ""})`);
    }
  }
}

console.log(
  found.length
    ? `\n  kandidat: ${found.join(", ")}\n`
    : "\n  tidak ada pooler yang bisa dijangkau\n",
);
