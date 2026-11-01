import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerImportedList } from '../lib/register-imported-list.ts';

test('registra secuencialmente, reutiliza existentes y reporta errores sin duplicar cédulas', async () => {
 const calls = [];
 const request = async (_url, init) => {
  const { doc } = JSON.parse(init.body); calls.push(doc);
  return Response.json(doc === 'a' ? { status: 'existing', number: 1 } : doc === 'b' ? { status: 'registered', number: 2 } : { error: 'Sin foto' }, { status: doc === 'c' ? 422 : 200 });
 };
 const results = await registerImportedList(['a','b','b','c'], 'raffle', 'V', new AbortController().signal, () => {}, request);
 assert.deepEqual(calls, ['a','b','c']);
 assert.deepEqual(results.map(r=>r.status), ['existing','registered','error']);
});
test('un cambio de rifa o de configuración detiene el lote', async () => {
 let calls = 0;
 const request = async () => { calls++; return Response.json({ error: 'La rifa cambió', stop: true }, { status: 409 }); };
 const results = await registerImportedList(['a','b'], 'raffle', 'V', new AbortController().signal, () => {}, request);
 assert.equal(calls, 1); assert.equal(results.length, 1);
});
test('detener el proceso evita registrar a las siguientes personas', async () => {
 const controller = new AbortController();
 const request = async () => { controller.abort(); return Response.json({status:'registered',number:1}); };
 const results = await registerImportedList(['a','b'], 'raffle', 'V', controller.signal, () => {}, request);
 assert.equal(results.length, 1);
});
