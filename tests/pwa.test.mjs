import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const load = (path) => readFileSync(new URL(path, root));
const manifest = (path) => JSON.parse(load(path).toString('utf8'));

for (const [name, html, manifestPath, startUrl] of [
  ['cliente', 'index.html', 'manifest.webmanifest', './'],
  ['profissionais', 'barbeiros.html', 'manifest-profissionais.webmanifest', './barbeiros.html']
]) {
  test('PWA: ' + name + ' possui manifesto, entrada e registro', () => {
    const markup = load(html).toString('utf8');
    const config = manifest(manifestPath);
    assert.ok(markup.includes('rel="manifest" href="' + manifestPath + '"'));
    assert.ok(markup.includes('src="pwa.js?v=pwa-1"'));
    assert.equal(config.start_url, startUrl);
    assert.equal(config.display, 'standalone');
    assert.equal(config.scope, './');
    assert.ok(config.name && config.short_name);
    for (const size of [192, 512]) {
      const icon = config.icons.find(item => item.sizes === size + 'x' + size && item.type === 'image/png');
      assert.ok(icon, 'Ícone ' + size + ' ausente');
      const png = load(icon.src);
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  });
}
test('PWA: nenhuma informação operacional é armazenada offline', () => {
  const sw = load('service-worker.js').toString('utf8');
  assert.doesNotMatch(sw, /caches\.open|cache\.put|fetch\(/i);
  assert.match(load('pwa.js').toString('utf8'), /serviceWorker\.register/);
});

test('PWA: instalações independentes em /cliente/ e /equipe/', () => {
  const cliente = manifest('cliente/manifest.webmanifest');
  const equipe = manifest('equipe/manifest.webmanifest');
  assert.equal(cliente.start_url, './');
  assert.equal(equipe.start_url, './');
  assert.equal(cliente.scope, './');
  assert.equal(equipe.scope, './');
  assert.notEqual(new URL(cliente.id, 'https://example.com/cliente/').href, new URL(equipe.id, 'https://example.com/equipe/').href);
  for (const [name, m] of [['cliente', cliente], ['equipe', equipe]]) {
    const html = load(name + '/index.html').toString('utf8');
    assert.match(html, /<base href="\.\.\/"/);
    assert.match(html, new RegExp('rel="manifest" href="' + name + '/manifest.webmanifest"'));
    assert.match(html, /pwa\.js/);
    assert.match(load(name + '/service-worker.js').toString('utf8'), /skipWaiting/);
    for (const icon of m.icons) {
      const file = new URL(icon.src, 'https://example.com/' + name + '/').pathname;
      assert.ok(file.startsWith('/assets/'), 'Ícone fora da pasta correta');
      assert.ok(load(file.slice(1)).length > 100);
    }
  }
  assert.match(load('app.js').toString('utf8'), /equipe/);
});
