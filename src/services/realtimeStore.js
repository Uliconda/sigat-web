// Suscripción compartida a una tabla con actualizaciones incrementales.
//
// - Varias pantallas (p. ej. el menú lateral y el Inventario) comparten UNA sola
//   conexión y UNA sola descarga inicial de la misma tabla.
// - Cada cambio en tiempo real modifica solo la fila afectada, en lugar de volver
//   a descargar la tabla completa.
// - Si la conexión se cae y se recupera, se recarga todo una vez para no perder
//   cambios ocurridos mientras tanto.
// - La descarga inicial no espera al tiempo real: sin WebSocket igual hay datos.
//
// cargar():               Promise<filas[]>  — descarga inicial (o tras reconexión)
// conectar(onCambio, onEstado): () => void  — abre el canal y devuelve cómo cerrarlo
//   onCambio({ eventType, new, old })  formato de postgres_changes de Supabase
//   onEstado(status, error)            "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED"
// incluir(fila): boolean               — filtro opcional (p. ej. historial reciente)
// mapear(fila): objeto                 — cómo entregar cada fila a las pantallas
export function crearSuscripcionCompartida({
  cargar,
  conectar,
  incluir = () => true,
  mapear = (fila) => fila,
  idDe = (fila) => fila.id,
}) {
  const oyentes = new Set();
  let filas = null; // Map id → fila cruda; null mientras no hay datos
  let cerrar = null;
  let cargando = null;
  let necesitaRecarga = false;
  let ultimaLista = null;
  let pendientes = []; // cambios que llegan durante una descarga completa

  const emitir = () => {
    if (!filas) return;
    ultimaLista = Array.from(filas.values(), mapear);
    for (const { onData } of oyentes) onData(ultimaLista);
  };

  const fallar = (error) => {
    for (const { onError } of oyentes) onError?.(error);
  };

  const recargar = () => {
    if (cargando) return cargando;
    cargando = cargar()
      .then((datos) => {
        if (!cerrar) return; // nadie escucha ya
        filas = new Map(datos.filter(incluir).map((fila) => [idDe(fila), fila]));
        // Cambios llegados mientras se descargaba: se reaplican (son idempotentes).
        const atrasados = pendientes;
        pendientes = [];
        for (const cambio of atrasados) aplicarEnMapa(cambio);
        emitir();
      })
      .catch(fallar)
      .finally(() => {
        cargando = null;
      });
    return cargando;
  };

  // Aplica un cambio al mapa; devuelve true si algo cambió.
  const aplicarEnMapa = ({ eventType, new: nueva, old: anterior }) => {
    if (eventType === "DELETE") return filas.delete(idDe(anterior ?? {}));
    if (!nueva) return false;
    if (incluir(nueva)) {
      filas.set(idDe(nueva), nueva);
      return true;
    }
    return filas.delete(idDe(nueva)); // dejó de cumplir el filtro
  };

  const aplicarCambio = (cambio) => {
    if (cargando || !filas) {
      pendientes.push(cambio);
      return;
    }
    if (aplicarEnMapa(cambio)) emitir();
  };

  const alCambiarEstado = (status, error) => {
    if (status === "SUBSCRIBED") {
      // Reconexión tras un corte: se sincroniza el estado completo una vez.
      if (necesitaRecarga) {
        necesitaRecarga = false;
        void recargar();
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      necesitaRecarga = true;
      fallar(error ?? new Error(`Se perdió la conexión en tiempo real (${status}).`));
    }
  };

  return function suscribir(onData, onError) {
    const oyente = { onData, onError };
    oyentes.add(oyente);

    if (!cerrar) {
      cerrar = conectar(aplicarCambio, alCambiarEstado);
      // Los datos se descargan de inmediato: si el tiempo real no logra conectar
      // (p. ej. una red que bloquea WebSockets) la pantalla igual muestra datos.
      void recargar();
    } else if (ultimaLista) {
      // Ya hay datos de otra pantalla: se entregan de inmediato.
      onData(ultimaLista);
    }

    return () => {
      oyentes.delete(oyente);
      if (oyentes.size === 0 && cerrar) {
        const cerrarCanal = cerrar;
        cerrar = null;
        filas = null;
        ultimaLista = null;
        pendientes = [];
        necesitaRecarga = false;
        cerrarCanal();
      }
    };
  };
}
