// Pruebas de la suscripción compartida en tiempo real. Uso: npm run test:web
import assert from "node:assert/strict";
import { test } from "node:test";
import { crearSuscripcionCompartida } from "./realtimeStore.js";

// Simula Supabase: una "base" en memoria y un canal que se controla a mano.
function simulador(filasIniciales) {
  const sim = { base: [...filasIniciales], cargas: 0, conexiones: 0, cierres: 0, cambio: null, estado: null };
  let resolverCarga = null;
  sim.cargaManual = false;
  sim.cargar = () => {
    sim.cargas++;
    const copia = sim.base.map((fila) => ({ ...fila }));
    if (!sim.cargaManual) return Promise.resolve(copia);
    return new Promise((resolve) => {
      resolverCarga = () => resolve(copia);
    });
  };
  sim.terminarCarga = () => resolverCarga?.();
  sim.conectar = (onCambio, onEstado) => {
    sim.conexiones++;
    sim.cambio = onCambio;
    sim.estado = onEstado;
    return () => sim.cierres++;
  };
  return sim;
}

const esperar = () => new Promise((resolve) => setTimeout(resolve, 0));

test("descarga una sola vez al conectarse y entrega las filas mapeadas", async () => {
  const sim = simulador([{ id: "A", data: { nombre: "Laptop" } }]);
  const suscribir = crearSuscripcionCompartida({ ...sim, mapear: (f) => ({ ...f.data, id: f.id }) });
  const recibidos = [];
  suscribir((lista) => recibidos.push(lista));
  sim.estado("SUBSCRIBED");
  await esperar();
  assert.equal(sim.cargas, 1);
  assert.deepEqual(recibidos.at(-1), [{ id: "A", nombre: "Laptop" }]);
});

test("muestra datos aunque el tiempo real nunca conecte (WebSocket bloqueado)", async () => {
  const sim = simulador([{ id: "A" }]);
  const suscribir = crearSuscripcionCompartida(sim);
  const recibidos = [];
  const errores = [];
  suscribir((lista) => recibidos.push(lista), (error) => errores.push(error));
  sim.estado("CHANNEL_ERROR");
  await esperar();
  assert.deepEqual(recibidos.at(-1), [{ id: "A" }]);
  assert.equal(errores.length, 1);
});

test("la conexión inicial no provoca una segunda descarga", async () => {
  const sim = simulador([{ id: "A" }]);
  sim.cargaManual = true;
  const suscribir = crearSuscripcionCompartida(sim);
  suscribir(() => {});
  sim.estado("SUBSCRIBED"); // llega mientras la descarga inicial sigue en curso
  sim.terminarCarga();
  await esperar();
  assert.equal(sim.cargas, 1);
});

test("varias pantallas comparten una conexión y una descarga", async () => {
  const sim = simulador([{ id: "A" }]);
  const suscribir = crearSuscripcionCompartida(sim);
  const a = [];
  const b = [];
  suscribir((lista) => a.push(lista));
  sim.estado("SUBSCRIBED");
  await esperar();
  suscribir((lista) => b.push(lista));
  assert.equal(sim.conexiones, 1);
  assert.equal(sim.cargas, 1);
  assert.deepEqual(b.at(-1), [{ id: "A" }], "la segunda pantalla recibe los datos de inmediato");
});

test("aplica INSERT, UPDATE y DELETE sin volver a descargar la tabla", async () => {
  const sim = simulador([{ id: "A", v: 1 }]);
  const suscribir = crearSuscripcionCompartida(sim);
  const recibidos = [];
  suscribir((lista) => recibidos.push(lista));
  sim.estado("SUBSCRIBED");
  await esperar();

  sim.cambio({ eventType: "INSERT", new: { id: "B", v: 1 }, old: {} });
  sim.cambio({ eventType: "UPDATE", new: { id: "A", v: 2 }, old: { id: "A" } });
  sim.cambio({ eventType: "DELETE", new: {}, old: { id: "B" } });

  assert.equal(sim.cargas, 1, "no se recarga la tabla completa");
  assert.deepEqual(recibidos.at(-1), [{ id: "A", v: 2 }]);
});

test("no pierde cambios que llegan durante la descarga inicial", async () => {
  const sim = simulador([{ id: "A", v: 1 }]);
  sim.cargaManual = true;
  const suscribir = crearSuscripcionCompartida(sim);
  const recibidos = [];
  suscribir((lista) => recibidos.push(lista));
  sim.estado("SUBSCRIBED");
  // La descarga ya leyó la base con A=1; mientras responde, llega un cambio.
  sim.cambio({ eventType: "UPDATE", new: { id: "A", v: 2 }, old: { id: "A" } });
  sim.terminarCarga();
  await esperar();
  assert.deepEqual(recibidos.at(-1), [{ id: "A", v: 2 }]);
});

test("respeta el filtro: quita filas que dejan de cumplirlo e ignora las que no lo cumplen", async () => {
  const sim = simulador([{ id: "A", reciente: true }, { id: "B", reciente: false }]);
  const suscribir = crearSuscripcionCompartida({ ...sim, incluir: (f) => f.reciente });
  const recibidos = [];
  suscribir((lista) => recibidos.push(lista));
  sim.estado("SUBSCRIBED");
  await esperar();
  assert.deepEqual(recibidos.at(-1), [{ id: "A", reciente: true }]);

  const emisiones = recibidos.length;
  sim.cambio({ eventType: "INSERT", new: { id: "C", reciente: false }, old: {} });
  assert.equal(recibidos.length, emisiones, "un cambio fuera del filtro no vuelve a renderizar");

  sim.cambio({ eventType: "UPDATE", new: { id: "A", reciente: false }, old: { id: "A" } });
  assert.deepEqual(recibidos.at(-1), []);
});

test("tras perder la conexión, recarga todo una vez al reconectar y avisa del error", async () => {
  const sim = simulador([{ id: "A" }]);
  const suscribir = crearSuscripcionCompartida(sim);
  const errores = [];
  const recibidos = [];
  suscribir((lista) => recibidos.push(lista), (error) => errores.push(error));
  sim.estado("SUBSCRIBED");
  await esperar();

  sim.estado("CHANNEL_ERROR");
  sim.base.push({ id: "B" }); // cambio ocurrido mientras no había conexión
  sim.estado("SUBSCRIBED");
  await esperar();

  assert.equal(errores.length, 1);
  assert.equal(sim.cargas, 2);
  assert.deepEqual(recibidos.at(-1), [{ id: "A" }, { id: "B" }]);
});

test("cierra el canal cuando la última pantalla deja de escuchar", async () => {
  const sim = simulador([{ id: "A" }]);
  const suscribir = crearSuscripcionCompartida(sim);
  const salirA = suscribir(() => {});
  const salirB = suscribir(() => {});
  sim.estado("SUBSCRIBED");
  await esperar();
  salirA();
  assert.equal(sim.cierres, 0);
  salirB();
  assert.equal(sim.cierres, 1);

  // Una nueva pantalla abre una conexión nueva y descarga de nuevo.
  suscribir(() => {});
  assert.equal(sim.conexiones, 2);
});
