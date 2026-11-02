import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirGanador } from '../lib/grados.ts';

function scripted(pool, steps) {
  let i = 0;
  const result = elegirGanador(pool, (limit) => {
    const [expected, value] = steps[i++] ?? [];
    assert.equal(limit, expected, 'rango del azar');
    assert.ok(value >= 0 && value < limit);
    return value;
  });
  assert.equal(i, steps.length);
  return result;
}

test('oficiales y sargentos usan dos opciones equiprobables aunque haya 300 sargentos y un oficial', () => {
  const officer = { id: 'oficial', rank: 'Coronel' };
  const sergeants = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, rank: 'Sargento Segundo' }));
  const pool = [officer, ...sergeants];
  assert.equal(scripted(pool, [[301, 0], [2, 0], [1, 0]]).id, 'oficial');
  assert.equal(scripted(pool, [[301, 0], [2, 1], [300, 299]]).id, 's299');
});

test('dentro de cada grupo elige personas, sin favorecer grados con pesos históricos mayores', () => {
  const pool = [{ id: 'coronel', rank: 'Coronel' }, { id: 'teniente', rank: 'Teniente' },
    { id: 'supervisor', rank: 'Sargento Supervisor' }, { id: 'segundo', rank: 'Sargento Segundo' }];
  for (let group = 0; group < 2; group++) for (let person = 0; person < 2; person++) {
    assert.equal(scripted(pool, [[4, 0], [2, group], [2, person]]).id, pool[group * 2 + person].id);
  }
});

test('conserva la proporción civil/militar y el tratamiento civil de grados no reconocidos', () => {
  const pool = [{ rank: null, id: 'civil' }, { rank: 'No reconocido', id: 'otro' }, { rank: 'Coronel', id: 'oficial' },
    ...Array.from({ length: 5 }, (_, i) => ({ rank: 'Sargento Primero', id: `s${i}` }))];
  for (let stage = 0; stage < 8; stage++) {
    const steps = stage < 2 ? [[8, stage], [2, stage]] : [[8, stage], [2, 0], [1, 0]];
    assert.equal(scripted(pool, steps).id, stage < 2 ? pool[stage].id : 'oficial');
  }
});

test('si se agota un grupo el sorteo sigue con el restante y conserva equivalencias de Armada', () => {
  for (const rank of ['Teniente de Navío', 'Sargento Primero']) {
    const pool = [{ id: 'a', rank }, { id: 'b', rank }];
    assert.equal(scripted(pool, [[2, 0], [2, 1]]).id, 'b');
  }
});

test('excluye generales y almirantes; no intenta sortear si no hay candidatos elegibles', () => {
  const excluded = ['Mayor General', 'General de División', 'General de Brigada', 'Almirante', 'Vicealmirante', 'Contraalmirante'].map(rank => ({ rank }));
  assert.equal(scripted(excluded, []), null);
  assert.equal(scripted([], []), null);
  assert.equal(scripted([...excluded, { id: 'civil', rank: null }], [[1, 0], [1, 0]]).id, 'civil');
});
