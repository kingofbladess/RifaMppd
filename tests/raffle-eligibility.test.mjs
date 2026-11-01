import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseRaffleDocuments, eligibleRafflePool } from '../lib/raffle-eligibility.ts';
import { elegirGanador } from '../lib/grados.ts';

// Compilar únicamente el helper para resolver el import sin extensión usado por Next.
const helper = ts.transpileModule(readFileSync(new URL('../lib/raffle-import.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText
  .replace('"./raffle-eligibility"', JSON.stringify(new URL('../lib/raffle-eligibility.ts', import.meta.url).href));
const { parseRaffleCsv, reviewRaffleColumn } = await import('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));

test('normaliza, deduplica y rechaza listas vacías o ambiguas', () => {
  assert.deepEqual(parseRaffleDocuments('V-12.345.678\n12345678; E-87654321'), ['12345678', '87654321']);
  assert.throws(() => parseRaffleDocuments(''), /al menos/);
  assert.throws(() => parseRaffleDocuments('Ana 12345678'), /inválida/);
  assert.throws(() => parseRaffleDocuments('0000'), /inválida/);
});

test('solo candidatos de la lista, registrados, visibles y sin premio; conserva grados', () => {
  const attendees = [
    { id: 'a', document_number: '12345678', rank: null },
    { id: 'b', document_number: '87654321', rank: 'Sargento Segundo' },
    { id: 'c', document_number: '11112222', rank: 'Mayor General' },
    { id: 'd', document_number: '33334444', rank: null },
  ];
  const list = ['12345678', '87654321', '11112222', '99998888'];
  const pool = eligibleRafflePool(attendees, list, new Set(['a']));
  assert.deepEqual(pool.map((p) => p.id), ['b', 'c']);
  assert.equal(elegirGanador(pool, () => 0)?.id, 'b');
  assert.equal(elegirGanador(pool.filter((p) => p.id === 'c'), () => 0), null);
  assert.equal(eligibleRafflePool(attendees, [], new Set()).length, 0);
  assert.equal(eligibleRafflePool(attendees, list, new Set(), new Set(['d'])).length, 0);
  assert.equal(attendees.length, 4); // la asistencia permanece intacta
});

test('CSV regional, comillas y revisión de la columna elegida', () => {
  const rows = parseRaffleCsv('\uFEFFNombre;Cédula\r\n"Ana, María";V-12.345.678\r\nLuis;12345678\r\nPedro;sin cedula\r\nEva;\r\n');
  assert.equal(rows[1][0], 'Ana, María');
  const review = reviewRaffleColumn(rows, 1, true);
  assert.deepEqual(review.documents, ['12345678']);
  assert.equal(review.duplicates, 1);
  assert.deepEqual(review.invalid, [4, 5]);
  assert.deepEqual(parseRaffleCsv('"a,b,c";Cédula\nAna;12345678')[0], ['a,b,c', 'Cédula']);
  assert.throws(() => parseRaffleCsv('"sin cierre'), /comillas/);
  assert.deepEqual(parseRaffleCsv('Nombre,Cédula\n"Ana\nMaría",12345678')[1], ['Ana\nMaría', '12345678']);
});
