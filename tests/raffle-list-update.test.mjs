import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveRaffleList } from '../lib/raffle-list-update.ts';

function store(initial) {
  let current = initial;
  return {
    read: async () => current,
    create: async (docs, version) => { if (current) return false; current = { document_numbers: docs, updated_at: version }; return true; },
    update: async (docs, version, previous) => { if (current?.updated_at !== previous) return false; current = { document_numbers: docs, updated_at: version }; return true; },
  };
}
const snapshot = () => ({ document_numbers: ['11112222', '33334444'], updated_at: '2026-11-01T00:00:00.000Z' });
test('entrada manual e importación añaden sin borrar integrantes existentes', async () => {
 const db = store(snapshot());
 await saveRaffleList(db, ['33334444', '55556666'], 'append');
 assert.deepEqual((await db.read()).document_numbers, ['11112222', '33334444', '55556666']);
});
test('dos altas simultáneas se conservan mediante reintento', async () => {
 const db = store(snapshot());
 await Promise.all([saveRaffleList(db, ['55556666'], 'append'), saveRaffleList(db, ['77778888'], 'append')]);
 assert.equal((await db.read()).document_numbers.length, 4);
});
test('una pestaña vieja no puede reemplazar la lista actual', async () => {
 const db = store(snapshot());
 await saveRaffleList(db, ['55556666'], 'append');
 await assert.rejects(() => saveRaffleList(db, ['11112222'], 'edit', snapshot().updated_at), /otra pestaña/);
 assert.equal((await db.read()).document_numbers.length, 3);
});
test('quitar explícitamente desde administración con versión vigente funciona', async () => {
 const db = store(snapshot());
 await saveRaffleList(db, ['11112222'], 'edit', snapshot().updated_at);
 assert.deepEqual((await db.read()).document_numbers, ['11112222']);
});
test('crear la lista desde dos pestañas no pierde la primera carga', async () => {
 const db = store(null);
 await Promise.all([saveRaffleList(db, ['11112222'], 'append'), saveRaffleList(db, ['33334444'], 'append')]);
 assert.deepEqual(new Set((await db.read()).document_numbers), new Set(['11112222', '33334444']));
});
