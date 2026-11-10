import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("cada painel carrega sua própria folha de estilos", () => {
  const pages = [
    ["index.html", "customer.css"],
    ["barbeiros.html", "barber.css"],
    ["painel-admin-preview.html", "admin.css"]
  ];
  for (const [htmlPath, cssPath] of pages) {
    const html = read(htmlPath);
    assert.ok(existsSync(join(root, cssPath)), cssPath + " deve existir");
    assert.match(html, new RegExp("href=[\\"']" + cssPath.replace(".", "\\.") + "\\?v="));
  }
  assert.equal(existsSync(join(root, "styles.css")), false);
  assert.equal(existsSync(join(root, "customer-layout.css")), false);
});

test("o totem oferece cadastro, retorno e revisão antes de entrar na fila", () => {
  const html = read("index.html");
  const app = read("app.js");
  for (const id of ["step-content", "step-actions", "demo-notice"]) {
    assert.match(html, new RegExp("id=[\\"']" + id + "[\\"']"));
  }
  for (const fn of ["renderLogin", "renderProfile", "renderReturningCustomerLookup", "renderServices", "renderConfirmation", "submitQueueEntry"]) {
    assert.match(app, new RegExp("function " + fn + "\\s*\\("), fn + " deve existir");
  }
  assert.match(app, /REVISAR SOLICITAÇÃO/);
  assert.match(app, /ENTRAR NA FILA/);
});

test("o cliente não escolhe barbeiro e entra na fila compartilhada", () => {
  const app = read("app.js");
  assert.match(app, /Fila compartilhada/);
  assert.match(app, /NÃO ACEITOU \/ MANTER NA FILA/);
  assert.match(app, /data-decline/);
  assert.match(app, /row\.status === ["']waiting["'] && !row\.barber_id/);
});

test("as telas mantêm estilos de seus próprios domínios", () => {
  const customer = read("customer.css");
  const barber = read("barber.css");
  const admin = read("admin.css");
  assert.match(customer, /#entry-choice|body:has\(#entry-choice\)/);
  assert.doesNotMatch(customer, /\.admin-dashboard|\.professional-dashboard|\.lc-admin-app/);
  assert.match(barber, /\.professional-dashboard|\.professional-nav/);
  assert.doesNotMatch(barber, /#entry-choice|\.admin-dashboard|\.lc-admin-app/);
  assert.match(admin, /\.admin-dashboard|\.lc-admin-app/);
  assert.doesNotMatch(admin, /#entry-choice|\.professional-dashboard|\.professional-nav/);
  assert.ok(customer.length < 250000);
  assert.ok(barber.length < 120000);
  assert.ok(admin.length < 220000);
});

test("o código enviado ao navegador não contém chave privilegiada do Supabase", () => {
  const browserFiles = read("app.js") + "\n" + read("index.html");
  assert.doesNotMatch(browserFiles, /SUPABASE_SERVICE_ROLE_KEY|service_role|BEGIN PRIVATE KEY/i);
});

test("a interface mantém os contatos oficiais e recursos responsivos", () => {
  const html = read("index.html");
  const css = read("customer.css");
  assert.match(html, /@la_corte_oficial/);
  assert.match(html, /\(48\) 99942-6466/);
  assert.match(css, /@media/);
});
