import assert from "node:assert/strict";
import { test } from "node:test";
import {
  areaDe,
  describirUbicacion,
  equiposPorUbicacion,
  esPrestamoVencido,
  normalizarUbicacion,
  resumenPorEdificio,
  SIN_EDIFICIO,
  SIN_ESPACIO,
} from "./ubicacion.ts";

const AHORA = Date.parse("2026-11-19T12:00:00Z");
const haceHoras = (h) => new Date(AHORA - h * 3600 * 1000).toISOString();
const equipos = [
  { id: "EQ-10", categoria: "CÓMPUTO", edificio: "EDIFICIO A", espacio: "AULA 3", estado: "Disponible" },
  { id: "EQ-2", categoria: "CÓMPUTO", edificio: "EDIFICIO A", espacio: null, estado: "Prestado", fecha_prestamo: haceHoras(50) },
  { id: "EQ-3", categoria: "AUDIOVISUAL", edificio: "EDIFICIO B", estado: "No responde" },
  { id: "EQ-4", categoria: "MOBILIARIO", estado: "Fuera de Servicio" },
  { id: "EQ-5", categoria: "ADMINISTRATIVOS", edificio: "EDIFICIO B", estado: "Prestado", fecha_prestamo: haceHoras(99) },
  { id: "MOB-1", nombre: "Plantilla Sistema", isTemplate: true },
];

test("normaliza como el servidor y describe la ubicación", () => {
  assert.equal(normalizarUbicacion("  edificio   a "), "EDIFICIO A");
  assert.equal(normalizarUbicacion(""), null);
  assert.equal(describirUbicacion(equipos[0]), "EDIFICIO A › AULA 3");
  assert.equal(describirUbicacion(equipos[3]), "");
  assert.equal(describirUbicacion({ edificio: "a", espacio: "aula 3", area: " caja " }), "A › AULA 3 › CAJA");
  assert.equal(describirUbicacion({ edificio: "A", espacio: null, area: "CAJA" }), "A", "sin espacio no hay área");
  assert.equal(areaDe({ edificio: "A", espacio: null, area: "CAJA" }), "SIN ÁREA");
});

test("vencidos: No responde, o Prestado de más de 48 h salvo ADMINISTRATIVOS", () => {
  assert.deepEqual(equipos.filter((e) => esPrestamoVencido(e, AHORA)).map((e) => e.id), ["EQ-2", "EQ-3"]);
});

test("resumen por edificio con los vacíos del catálogo y SIN EDIFICIO al final", () => {
  const resumen = resumenPorEdificio(equipos, [{ nombre: "EDIFICIO C" }], AHORA);
  assert.deepEqual(resumen.map((r) => [r.edificio, r.total, r.prestados, r.vencidos]), [
    ["EDIFICIO A", 2, 1, 1],
    ["EDIFICIO B", 2, 2, 1],
    ["EDIFICIO C", 0, 0, 0],
    [SIN_EDIFICIO, 1, 0, 0],
  ]);
});

test("agrupa por edificio y espacio, ordenado por ID, filtrando edificios", () => {
  assert.deepEqual(
    equiposPorUbicacion(equipos, ["EDIFICIO A"]).map((g) => [g.edificio, g.espacios.map((s) => [s.espacio, s.equipos.map((e) => e.id)])]),
    [["EDIFICIO A", [["AULA 3", ["EQ-10"]], [SIN_ESPACIO, ["EQ-2"]]]]]
  );
  assert.equal(equiposPorUbicacion(equipos).length, 3);
});
