import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compila lib/cadetes.ts y resuelve su import sin extensión (como en raffle-eligibility.test.mjs).
const src = ts.transpileModule(readFileSync(new URL('../lib/cadetes.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText
  .replace('"./raffle-eligibility"', JSON.stringify(new URL('../lib/raffle-eligibility.ts', import.meta.url).href));
const { detectarColumnas, revisarCadetes, validarCadetes, elegirCadete, cadeteId, cedulaDeId } =
  await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

test('detecta columnas por encabezado en cualquier orden', () => {
  assert.deepEqual(detectarColumnas(['Grado', 'Nombre Completo', 'Cédula']),
    { columnas: { cedula: 2, nombre: 1, grado: 0 }, encabezado: true });
  assert.deepEqual(detectarColumnas(['12345678', 'Ana Pérez', 'Cadete']),
    { columnas: { cedula: 0, nombre: 1, grado: 2 }, encabezado: false });
});

test('revisa filas: normaliza cédula, quita repetidos y marca inválidas', () => {
  const rows = [['Cédula', 'Nombre', 'Grado'], ['V-12.345.678', '  Ana   Pérez ', 'Cadete'], [12345678, 'Ana Pérez', ''],
    ['abc', 'Sin cédula', ''], ['', '', ''], [87654321, 'Luis Gómez', null]];
  const r = revisarCadetes(rows, { cedula: 0, nombre: 1, grado: 2 }, true);
  assert.deepEqual(r.cadetes, [{ cedula: '12345678', nombre: 'Ana Pérez', grado: 'Cadete' }, { cedula: '87654321', nombre: 'Luis Gómez', grado: null }]);
  assert.equal(r.repetidos, 1);
  assert.deepEqual(r.invalidas, [4]);
});

test('validación del servidor', () => {
  assert.throws(() => validarCadetes([]), /vacía/);
  assert.throws(() => validarCadetes([{ cedula: 'x', nombre: 'Ana Pérez' }]), /inválido/);
  assert.equal(validarCadetes([{ cedula: '123456', nombre: 'Ana Pérez' }, { cedula: '123456', nombre: 'Otra' }]).length, 1);
});

test('probabilidad igual para todos, sin importar el grado', () => {
  const pool = [{ rank: 'Mayor General' }, { rank: 'Sargento Segundo' }, { rank: null }, { rank: 'Cadete' }];
  const counts = new Map();
  let i = 0;
  for (let k = 0; k < 400; k++) { const w = elegirCadete(pool, (n) => i++ % n); counts.set(w, (counts.get(w) ?? 0) + 1); }
  assert.deepEqual([...counts.values()], [100, 100, 100, 100]);
  assert.equal(elegirCadete([], () => 0), null);
});

test('id de cadete en la ruleta', () => {
  assert.equal(cadeteId('123456'), 'cad-123456');
  assert.equal(cedulaDeId('cad-123456'), '123456');
  assert.equal(cedulaDeId('9b2c-uuid'), null);
});
