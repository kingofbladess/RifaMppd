import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRaffleListPdf } from '../lib/raffle-list-pdf.ts';

test('exporta una lista completa con varias páginas, tildes y numeración', async () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({
    document: String(10000000 + i), name: i === 60 ? 'María José Núñez' : `Persona de prueba ${i}`,
    rank: 'SARGENTO PRIMERO', status: 'Disponible para ganar', origin: 'Solo lista de rifa',
  }));
  const pdf = await buildRaffleListPdf({ title: 'Integrantes de la lista', raffleName: 'Rifa de prueba',
    description: 'Borrador con cambios sin guardar | Filtro: Todos', rows, now: new Date('2026-11-01T23:30:00Z') });
  assert.ok(pdf.getNumberOfPages() > 1);
  const content = pdf.output();
  for (const row of rows) assert.ok(content.includes(row.document), `Debe incluir la cédula ${row.document}`);
  assert.ok(content.includes('María José Núñez'));
  assert.ok(content.includes('Borrador con cambios sin guardar'));
  assert.ok(content.includes(`Página ${pdf.getNumberOfPages()} de ${pdf.getNumberOfPages()}`));
});
