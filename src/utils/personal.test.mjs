import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agruparPorDepartamento,
  buscarPersonal,
  departamentosDe,
  estaActivo,
  formatearFecha,
  historialDePersona,
  seleccionarParaReporte,
} from "./personal.ts";

const persona = (nombre, departamento = null, fecha_termino = null) => ({
  id: nombre,
  nombre,
  departamento,
  fecha_ingreso: null,
  fecha_termino,
  conducta: null,
  conducta_notas: null,
});

const lista = [
  persona("Zoe", "FINANZAS"),
  persona("Ana"),
  persona("Bruno", "CONTROL ESCOLAR"),
  persona("Álvaro", "FINANZAS", "2026-01-31"),
];

test("agrupa por departamento alfabético con 'Sin departamento' al final", () => {
  assert.deepEqual(departamentosDe(lista), ["CONTROL ESCOLAR", "FINANZAS", "Sin departamento"]);
  assert.deepEqual(
    agruparPorDepartamento(lista).map((g) => [g.departamento, g.personas.map((p) => p.nombre)]),
    [
      ["CONTROL ESCOLAR", ["Bruno"]],
      ["FINANZAS", ["Álvaro", "Zoe"]],
      ["Sin departamento", ["Ana"]],
    ]
  );
});

test("busca sin acentos por nombre o departamento", () => {
  assert.deepEqual(buscarPersonal(lista, "alvaro").map((p) => p.nombre), ["Álvaro"]);
  assert.deepEqual(buscarPersonal(lista, "escolar").map((p) => p.nombre), ["Bruno"]);
});

test("el reporte filtra por áreas y por personal que ya no labora", () => {
  const hoy = "2026-11-09";
  const nombres = (grupos) => grupos.map((g) => [g.departamento, g.personas.map((p) => p.nombre)]);
  assert.deepEqual(nombres(seleccionarParaReporte(lista, { departamentos: ["FINANZAS"], incluirBajas: false }, hoy)), [
    ["FINANZAS", ["Zoe"]],
  ]);
  assert.deepEqual(nombres(seleccionarParaReporte(lista, { departamentos: ["FINANZAS"], incluirBajas: true }, hoy)), [
    ["FINANZAS", ["Álvaro", "Zoe"]],
  ]);
  assert.equal(seleccionarParaReporte(lista, { departamentos: [], incluirBajas: true }, hoy).length, 3);
  assert.equal(estaActivo(lista[3], hoy), false);
});

test("historial: solo asignaciones cerradas, la más reciente primero", () => {
  const a = (id, inicio, fin) => ({ id, personal_id: "p1", equipo_id: id, fecha_inicio: inicio, fecha_fin: fin });
  const historial = historialDePersona(
    [a("1", "2025-01-01", "2025-02-01"), a("2", "2026-01-01", null), a("3", "2025-06-01", "2025-07-01")],
    "p1"
  );
  assert.deepEqual(historial.map((x) => x.id), ["3", "1"]);
  assert.equal(formatearFecha("2026-03-15"), "15/03/2026");
});
