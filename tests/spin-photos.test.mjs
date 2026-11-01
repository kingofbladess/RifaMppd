import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSpinPhotos } from '../lib/spin-photos.ts';

// DOM mínimo para comprobar red, reintentos y preparación sin Supabase ni datos personales.
test('prepara cada URL una vez, limita concurrencia y reintenta fallos', async () => {
  const originalImage = globalThis.Image, originalDocument = globalThis.document;
  const attempts = new Map();
  let active = 0, peak = 0, draws = 0;
  globalThis.Image = class {
    naturalWidth = 480; naturalHeight = 640;
    decode() { return Promise.resolve(); }
    set src(url) {
      if (!url) return;
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      active++; peak = Math.max(peak, active);
      setTimeout(() => {
        active--;
        if (url === 'missing' || (url === 'transient' && attempt === 1)) this.onerror?.();
        else this.onload?.();
      }, 2);
    }
  };
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: () => draws++ }) }) };
  try {
    const progress = [];
    const urls = ['a', 'b', 'c', 'd', 'e', 'a', 'transient', 'missing'];
    const { photos, done } = prepareSpinPhotos(urls, (done, total) => progress.push([done, total]));
    const failed = await done;
    assert.equal(photos.size, 6);
    assert.deepEqual(failed, ['missing']);
    assert.equal(attempts.get('a'), 1);
    assert.equal(attempts.get('transient'), 2);
    assert.equal(attempts.get('missing'), 2);
    assert.ok(peak <= 6);
    assert.equal(draws, 6);
    assert.equal(photos.get('a').width, 192);
    assert.deepEqual(progress.at(-1), [7, 7]);
    const empty = await prepareSpinPhotos([], () => {});
    assert.equal(empty.photos.size, 0);
  } finally { globalThis.Image = originalImage; globalThis.document = originalDocument; }
});

test('corta la preparación a los 20 segundos incluso si la red no responde', async (t) => {
  const originalImage = globalThis.Image;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.Image = class { set src(value) {} };
  try {
    const urls = Array.from({ length: 12 }, (_, i) => `stalled-${i}`);
    const { photos, done } = prepareSpinPhotos(urls, () => {});
    t.mock.timers.tick(20000);
    const failed = await done;
    assert.equal(photos.size, 0);
    assert.deepEqual(failed, urls);
  } finally { globalThis.Image = originalImage; t.mock.timers.reset(); }
});
