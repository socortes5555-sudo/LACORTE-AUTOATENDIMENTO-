import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("a página inicial carrega os arquivos essenciais e a marca", () => {
  const html = read("index.html");
  assert.ok(existsSync(join(root, "app.js")));
  assert.ok(existsSync(join(root, "styles.css")));
  assert.ok(existsSync(join(root, "customer-layout.css")));
  assert.ok(existsSync(join(root, "assets/lacorte-logo.svg")));
  assert.match(html, /src=["']app\.js\?v=/);
  assert.match(html, /href=["']styles\.css\?v=/);
  assert.match(html, /href=["']customer-layout\.css\?v=/);
  assert.ok(html.indexOf("customer-layout.css?v=") > html.indexOf("styles.css?v="), "o layout do cliente deve carregar depois do CSS base");
  assert.match(html, /assets\/lacorte-logo\.svg/);
  assert.doesNotMatch(html, /images\.unsplash\.com/i);
});


test("o rodapé do autoatendimento mantém o acesso da equipe visível e acessível", () => {
  const html = read("index.html");
  const css = read("customer-layout.css");
  assert.match(html, /class=["']staff-portal-entry["']/);
  assert.match(css, /\.site-footer \.footer-meta\{display:flex!important\}/);
  assert.match(css, /\.site-footer \.staff-portal-entry\{display:inline-flex!important/);
  assert.match(css, /\.staff-portal-entry:focus-visible/);
});

test("a tela do cliente respeita a preferência por movimento reduzido", () => {
  const css = read("customer-layout.css");
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i);
  assert.match(css, /#entry-choice-options\s+\.btn\{transition:none!important\}/);
});

test("o totem oferece cadastro, retorno e revisão antes de entrar na fila", () => {
  const html = read("index.html");
  const app = read("app.js");
  for (const id of ["step-content", "step-actions", "demo-notice"]) {
    assert.match(html, new RegExp(`id=[\"']${id}[\"']`));
  }
  for (const fn of [
    "renderLogin",
    "renderProfile",
    "renderReturningCustomerLookup",
    "renderServices",
    "renderConfirmation",
    "submitQueueEntry"
  ]) {
    assert.match(app, new RegExp("function " + fn + "\\s*\\("), fn + " deve existir");
  }
  assert.match(app, /REVISAR SOLICITAÇÃO/);
  assert.match(app, /ENTRAR NA FILA/);
});

test("o cliente não escolhe o barbeiro e a chamada permite manter a senha aguardando", () => {
  const app = read("app.js");
  assert.match(app, /Fila compartilhada/);
  assert.match(app, /NÃO ACEITOU \/ MANTER NA FILA/);
  assert.match(app, /data-decline/);
  assert.match(app, /row\.status === ["']waiting["'] && !row\.barber_id/);
});

test("os painéis de administração e profissional possuem rotas próprias", () => {
  const app = read("app.js");
  for (const fn of [
    "renderQueueDashboard",
    "renderBarberReports",
    "renderAdminReports",
    "renderAdminManagement",
    "renderAdminCustomers",
    "renderAdminPlans"
  ]) {
    assert.ok(app.includes(fn), fn + " deve estar presente");
  }
});

test("o código enviado ao navegador não contém chave privilegiada do Supabase", () => {
  const browserFiles = read("app.js") + "\n" + read("index.html");
  assert.doesNotMatch(browserFiles, /SUPABASE_SERVICE_ROLE_KEY|service_role|BEGIN PRIVATE KEY/i);
});

test("a interface mantém recursos responsivos e os contatos oficiais", () => {
  const html = read("index.html");
  const css = read("styles.css") + "\n" + read("customer-layout.css");
  assert.match(html, /@la_corte_oficial/);
  assert.match(html, /\(48\) 99942-6466/);
  assert.match(css, /@media/);
});
