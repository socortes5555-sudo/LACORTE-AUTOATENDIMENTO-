import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('customer-layout.css', 'utf8');

test('a tela inicial usa a logo oficial original em todos os tamanhos', () => {
  const rule = css.match(/#entry-choice:has\\(#entry-choice-options\\)\\s+\\.reference-logo\\s*\\{([\\s\\S]*?)\\}/);
  assert.ok(rule, 'Regra principal da logo não encontrada');
  assert.match(rule[1], /background-image:\\s*url\\(["']assets\\/lacorte-logo\\.svg["']\\)/);
  assert.match(rule[1], /background-size:\\s*contain/);
  assert.match(rule[1], /mask-image:\\s*none/);
  assert.doesNotMatch(rule[1], /totem-cena\\.svg/);
  assert.doesNotMatch(css, /lacorte-logo\\.svg\\?v=barbearia-1/);
  assert.match(html, /assets\\/lacorte-logo\\.svg/);
});

test('o totem mantém uma composição de tela cheia e adapta tablet e celular', () => {
  assert.match(css, /min-height:\\s*100svh/);
  assert.match(css, /@media\\s*\\(max-width:\\s*760px\\)/);
  assert.match(css, /@media\\s*\\(max-width:\\s*540px\\)/);
  assert.match(css, /grid-template-columns:\\s*repeat\\(2,\\s*minmax\\(0,1fr\\)\\)/);
});

test('os contatos públicos permanecem corretos e o acesso Wi-Fi não é exposto', () => {
  assert.match(html, /instagram\\.com\\/la_corte_oficial/);
  assert.match(html, /@la_corte_oficial/);
  assert.match(html, /wa\\.me\\/5548999426466/);
  assert.match(html, /\\(48\\) 99942-6466/);
  assert.match(html, /Peça o acesso à equipe da La Corte\\./);
  assert.doesNotMatch(html, /wifi-lacorte\\.png|wifi-qr-frame/i);
});
