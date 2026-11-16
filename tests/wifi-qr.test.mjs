import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('o QR de Wi-Fi permanece disponível nas duas entradas do cliente', () => {
  for (const path of ['index.html', 'cliente/index.html']) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /href="assets\/wifi-lacorte\.png"/, path);
    assert.match(html, /<img[^>]+src="assets\/wifi-lacorte\.png"[^>]+alt="[^"]+"/, path);
    assert.doesNotMatch(html, /Peça o acesso à equipe da La Corte\./, path);
    assert.match(html, /id="instagram-qr"/, path);
    assert.match(html, /id="whatsapp-qr"/, path);
  }
  assert.equal(existsSync(new URL('../assets/wifi-lacorte.png', import.meta.url)), true);
});
