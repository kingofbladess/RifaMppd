import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrationBatch, registerImportedList } from '../lib/register-imported-list.ts';

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

test('importar 39 cédulas no vuelve a procesar las 295 anteriores', async () => {
 const previous = Array.from({length:295},(_,i)=>String(10000000+i));
 const incoming = Array.from({length:39},(_,i)=>String(20000000+i));
 const batch = registrationBatch(incoming);
 assert.equal(batch.length,39);
 assert.ok(batch.every(doc=>!previous.includes(doc)));
 const calls=[];
 await registerImportedList(batch,'raffle','V',new AbortController().signal,()=>{},async (_url,init)=>{
  calls.push(JSON.parse(init.body).doc);return Response.json({status:'registered'});
 });
 assert.deepEqual(calls,incoming);
});
test('completar lista guardada solo consulta los pendientes conocidos',()=>{
 assert.deepEqual(registrationBatch(['a','b','c','c'],new Set(['a','b'])),['c']);
 assert.deepEqual(registrationBatch(['a'],new Set(['a'])),[]);
});
