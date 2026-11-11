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
  assert.doesNotMatch(sql, /on delete cascade/i);
});

test("a recusa é gravada apenas pelo barbeiro autenticado e a tabela não permite escrita direta", () => {
  const sql = read("supabase/migrations/20261110171000_queue_declines_per_barber.sql");
  assert.match(sql, /r\.user_id = auth\.uid\(\)/i);
  assert.match(sql, /r\.role = 'barber'/i);
  assert.match(sql, /revoke all on table public\.lacorte_queue_declines from anon, authenticated/i);
  assert.match(sql, /grant select on table public\.lacorte_queue_declines to authenticated/i);
  assert.match(sql, /grant execute on function public\.lacorte_decline_queue_entry\(uuid\) to authenticated/i);
});

test("a RPC pública usa SECURITY INVOKER e delega a operação privilegiada ao schema privado", () => {
  const sql = read("supabase/migrations/20261110172000_harden_queue_decline_rpc.sql");
  assert.match(sql, /create or replace function private\.lacorte_decline_queue_entry_internal/i);
  assert.match(sql, /create or replace function public\.lacorte_decline_queue_entry/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute on function private\.lacorte_decline_queue_entry_internal\(uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.lacorte_decline_queue_entry\(uuid\) to anon/i);
});


test("o painel administrativo identifica os barbeiros que já pularam uma senha", () => {
  assert.match(app, /const declinedBarberNames = \\(row\\.declinedBarberIds \\|\\| \\[\\]\\)\\.map/);
  assert.match(app, /admin && row\\.status === "waiting" && declinedBarberNames\\.length/);
  assert.match(app, /Profissionais que já pularam/);
  assert.match(app, /declinedBarberNames\\.map\\(safe\\)\\.join/);
});
