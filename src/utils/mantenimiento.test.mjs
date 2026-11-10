import assert from "node:assert/strict";
import { test } from "node:test";
import { DIAS_URGENTE, compararPorPrioridad, esUrgente, estadoMantenimiento } from "./mantenimiento.ts";

const AHORA = new Date("2026-11-10T12:00:00Z").getTime();
const haceDias = (dias) => new Date(AHORA - dias * 24 * 60 * 60 * 1000).toISOString();

test("clasifica por días desde la última revisión", () => {
  assert.equal(estadoMantenimiento({ fecha_revision: haceDias(10) }, AHORA).nivel, "al-dia");
  assert.equal(estadoMantenimiento({ fecha_revision: haceDias(75) }, AHORA).nivel, "proximo");
  assert.equal(estadoMantenimiento({ fecha_revision: haceDias(DIAS_URGENTE + 1) }, AHORA).nivel, "urgente");
  assert.equal(estadoMantenimiento({}, AHORA).nivel, "sin-revision");
});

test("usa lastCheck de equipos antiguos e ignora fechas inválidas", () => {
  assert.equal(esUrgente({ lastCheck: haceDias(400) }, AHORA), true);
  assert.equal(estadoMantenimiento({ fecha_revision: "no es fecha" }, AHORA).nivel, "sin-revision");
});

test("calcula la próxima revisión y los días", () => {
  const estado = estadoMantenimiento({ fecha_revision: haceDias(30) }, AHORA);
  assert.equal(estado.dias, 30);
  assert.equal(estado.proximaRevision.getTime(), AHORA + (DIAS_URGENTE - 30) * 24 * 60 * 60 * 1000);
});

test("ordena primero lo urgente y lo más atrasado", () => {
  const estados = [
    estadoMantenimiento({ fecha_revision: haceDias(5) }, AHORA),
    estadoMantenimiento({ fecha_revision: haceDias(120) }, AHORA),
    estadoMantenimiento({}, AHORA),
    estadoMantenimiento({ fecha_revision: haceDias(300) }, AHORA),
  ].sort(compararPorPrioridad);
  assert.deepEqual(estados.map((e) => e.dias), [300, 120, null, 5]);
});
