import assert from "node:assert/strict";
import { test } from "node:test";
import { areasInventario, describirSeleccion, equiposParaReporte } from "./areasInventario.ts";

const equipo = (id, categoria, subcategoria, subSubcategoria) => ({ id, categoria, subcategoria, subSubcategoria });
const equipos = [
  equipo("EQ-10", "Cómputo", "laptops", "Sala 2"),
  equipo("EQ-2", "CÓMPUTO", "LAPTOPS", "SALA 1"),
  equipo("EQ-3", "CÓMPUTO", "", ""),
  equipo("EQ-4", "MOBILIARIO", "SILLAS"),
  equipo("EQ-5", "", ""),
];

test("agrupa categorías y subcategorías sin importar mayúsculas, con GENERAL al final", () => {
  assert.deepEqual(
    areasInventario(equipos).map((a) => [a.categoria, a.cantidad, a.subcategorias.map((s) => `${s.nombre}:${s.cantidad}`)]),
    [
      ["CÓMPUTO", 3, ["LAPTOPS:2", "GENERAL:1"]],
      ["MOBILIARIO", 1, ["SILLAS:1"]],
      ["SIN CATEGORÍA", 1, ["GENERAL:1"]],
    ]
  );
});

test("filtra por las subcategorías elegidas y ordena por sección e ID", () => {
  const grupos = equiposParaReporte(equipos, ["CÓMPUTO|LAPTOPS", "MOBILIARIO|SILLAS"]);
  assert.deepEqual(
    grupos.map((g) => [g.categoria, g.subcategorias.map((s) => [s.nombre, s.equipos.map((e) => e.id)])]),
    [
      ["CÓMPUTO", [["LAPTOPS", ["EQ-2", "EQ-10"]]]],
      ["MOBILIARIO", [["SILLAS", ["EQ-4"]]]],
    ]
  );
  assert.equal(equiposParaReporte(equipos, []).length, 3);
});

test("describe la selección", () => {
  const areas = areasInventario(equipos);
  assert.equal(describirSeleccion(areas, []), "Todo el inventario");
  assert.equal(
    describirSeleccion(areas, ["CÓMPUTO|LAPTOPS", "MOBILIARIO|SILLAS"]),
    "CÓMPUTO > LAPTOPS, MOBILIARIO (completo)"
  );
});
