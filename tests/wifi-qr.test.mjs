import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const publicPages = ['index.html', 'cliente/index.html'];

test('as páginas públicas não expõem QR nem arquivo de acesso Wi-Fi', () => {
  for (const path of publicPages) {
    const html = readFileSync(path, 'utf8');
    assert.doesNotMatch(html, /wifi-lacorte\\.png|wifi-qr-frame/i, path);
    assert.match(html, /Peça o acesso à equipe da La Corte\\./, path);
    assert.match(html, /id="instagram-qr"/, path);
    assert.match(html, /id="whatsapp-qr"/, path);
  }
});

test('o arquivo público do QR de acesso Wi-Fi não existe', () => {
  assert.equal(existsSync(new URL('../assets/wifi-lacorte.png', import.meta.url)), false);
});
