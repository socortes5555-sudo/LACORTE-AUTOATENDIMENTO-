import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("a página pública não publica nem gera QR com credenciais do Wi-Fi", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /WIFI:T:WPA;|P:[^;]{8,};;/i);
  assert.doesNotMatch(html, /makeQr\(["']wifi-qr/i);
  assert.match(html, /Solicite a senha à nossa equipe/);
  assert.match(html, /makeQr\(["']instagram-qr/);
  assert.match(html, /makeQr\(["']whatsapp-qr/);
});

test("o barbeiro pode pular um cliente sem removê-lo nem mudar sua posição", () => {
  const app = read("app.js");
  const sql = read("supabase/migrations/20261110171000_queue_declines_per_barber.sql");
  assert.match(app, /from\('lacorte_queue_declines'\)/);
  assert.match(app, /declinedBarberIds/);
  assert.match(app, /!\(row\.declinedBarberIds \|\| \[\]\)\.includes\(state\.barberId\)/);
  assert.match(app, /lacorte_decline_queue_entry/);
  assert.match(sql, /create table if not exists public\.lacorte_queue_declines/i);
  assert.match(sql, /primary key \(queue_id, barber_id\)/i);
  assert.match(sql, /on conflict \(queue_id, barber_id\) do nothing/i);
  assert.match(sql, /status = 'waiting'/i);
  assert.match(sql, /private\.lacorte_start_service_internal/i);
  assert.match(sql, /Este cliente prefere aguardar outro profissional/i);
  assert.doesNotMatch(sql, /\b(drop table|truncate|delete from)\b/i);
});

test("a recusa é gravada apenas pelo barbeiro autenticado e a tabela não permite escrita direta", () => {
  const sql = read("supabase/migrations/20261110171000_queue_declines_per_barber.sql");
  assert.match(sql, /r\.user_id = auth\.uid\(\)/i);
  assert.match(sql, /r\.role = 'barber'/i);
  assert.match(sql, /revoke all on table public\.lacorte_queue_declines from anon, authenticated/i);
  assert.match(sql, /grant select on table public\.lacorte_queue_declines to authenticated/i);
  assert.match(sql, /grant execute on function public\.lacorte_decline_queue_entry\(uuid\) to authenticated/i);
});
