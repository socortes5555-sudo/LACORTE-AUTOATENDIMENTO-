import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('customer-layout.css', 'utf8');

test('a tela inicial usa a logo oficial original em todos os tamanhos', () => {
  const rule = css.match(/#entry-choice:has\(#entry-choice-options\)\s+\.reference-logo\s*\{([\s\S]*?)\}/);
  assert.ok(rule, 'Regra principal da logo não encontrada');
  assert.match(rule[1], /background-image:\s*url\(["']assets\/lacorte-logo\.svg["']\)/);
  assert.match(rule[1], /background-size:\s*contain/);
  assert.match(rule[1], /mask-image:\s*none/);
  assert.doesNotMatch(rule[1], /totem-cena\.svg/);
  assert.doesNotMatch(css, /lacorte-logo\.svg\?v=barbearia-1/);
  assert.match(html, /assets\/lacorte-logo\.svg/);
});

test('o totem mantém uma composição de tela cheia e adapta tablet e celular', () => {
  assert.match(css, /min-height:\s*100svh/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*540px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,1fr\)\)/);
});

test('os contatos públicos permanecem corretos e o acesso Wi-Fi não é exposto', () => {
  assert.match(html, /instagram\.com\/la_corte_oficial/);
  assert.match(html, /@la_corte_oficial/);
  assert.match(html, /wa\.me\/5548999426466/);
  assert.match(html, /\(48\) 99942-6466/);
  assert.match(html, /Peça o acesso à equipe da La Corte\./);
  assert.doesNotMatch(html, /wifi-lacorte\.png|wifi-qr-frame/i);
});

test('tablet horizontal keeps the welcome screen compact and scroll-safe inside one viewport', () => {
  const start = css.indexOf('@media (orientation: landscape) and (min-width: 761px) and (max-height: 900px)');
  assert.notEqual(start, -1, 'Regras específicas para tablet horizontal não encontradas');
  const end = css.indexOf('@media(prefers-reduced-motion:reduce)', start);
  const landscape = css.slice(start, end === -1 ? undefined : end);
  assert.match(landscape, /height:\s*100svh/);
  assert.match(landscape, /min-height:\s*100svh/);
  assert.match(landscape, /overflow-y:\s*auto/);
  assert.match(landscape, /\.reference-art[\s\S]*?min-height:\s*clamp\(78px, 14svh, 124px\)/);
  assert.match(landscape, /\.reference-logo[\s\S]*?width:\s*min\(42vw, 430px, 28svh\)/);
  assert.match(landscape, /\.reference-logo[\s\S]*?height:\s*clamp\(76px, 13\.5svh, 120px\)/);
  assert.match(landscape, /\.contact-strip \.contact-qr[\s\S]*?width:\s*clamp\(42px, 6svh, 54px\)/);
  assert.match(landscape, /\.entry-card \.btn[\s\S]*?min-height:\s*42px/);
});
