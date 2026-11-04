// Suscripción compartida a una tabla con actualizaciones incrementales.
//
// - Varias pantallas (p. ej. el menú lateral y el Inventario) comparten UNA sola
//   conexión y UNA sola descarga inicial de la misma tabla.
// - Cada cambio en tiempo real modifica solo la fila afectada, en lugar de volver
//   a descargar la tabla completa.
// - Si la conexión se cae y se recupera, se recarga todo una vez para no perder
//   cambios ocurridos mientras tanto.
// - La descarga inicial no espera al tiempo real: sin WebSocket igual hay datos.

/** Cambio en el formato de postgres_changes de Supabase. */
export interface CambioTiempoReal<Fila> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Fila | Record<string, never> | null;
  old: Partial<Fila> | null;
}

export type EstadoCanal = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export interface OpcionesSuscripcion<Fila, Salida> {
  /** Descarga completa (al conectar y tras una reconexión). */
  cargar: () => Promise<Fila[]>;
  /** Abre el canal en tiempo real y devuelve cómo cerrarlo. */
  conectar: (
    onCambio: (cambio: CambioTiempoReal<Fila>) => void,
    onEstado: (status: EstadoCanal | string, error?: Error) => void
  ) => () => void;
  /** Filtro opcional (p. ej. historial reciente). */
  incluir?: (fila: Fila) => boolean;
  /** Cómo entregar cada fila a las pantallas. */
  mapear?: (fila: Fila) => Salida;
  idDe?: (fila: Partial<Fila>) => unknown;
}

export type OnData<Salida> = (filas: Salida[]) => void;
export type OnError = (error: unknown) => void;
export type Suscribir<Salida> = (onData: OnData<Salida>, onError?: OnError) => () => void;

const idPorDefecto = (fila: object): unknown => (fila as { id?: unknown }).id;

export function crearSuscripcionCompartida<Fila extends object, Salida = Fila>({
  cargar,
  conectar,
  incluir = () => true,
  mapear = (fila) => fila as unknown as Salida,
  idDe = idPorDefecto,
}: OpcionesSuscripcion<Fila, Salida>): Suscribir<Salida> {
  const oyentes = new Set<{ onData: OnData<Salida>; onError?: OnError }>();
  let filas: Map<unknown, Fila> | null = null; // null mientras no hay datos
  let cerrar: (() => void) | null = null;
  let cargando: Promise<void> | null = null;
  let necesitaRecarga = false;
  let ultimaLista: Salida[] | null = null;
  let pendientes: CambioTiempoReal<Fila>[] = []; // cambios que llegan durante una descarga completa

  const emitir = () => {
    if (!filas) return;
    const lista = Array.from(filas.values(), mapear);
    ultimaLista = lista;
    for (const { onData } of oyentes) onData(lista);
  };

  const fallar = (error: unknown) => {
    for (const { onError } of oyentes) onError?.(error);
  };

  // Aplica un cambio al mapa; devuelve true si algo cambió.
  const aplicarEnMapa = (mapa: Map<unknown, Fila>, { eventType, new: nueva, old: anterior }: CambioTiempoReal<Fila>) => {
    if (eventType === "DELETE") return mapa.delete(idDe(anterior ?? {}));
    if (!nueva || Object.keys(nueva).length === 0) return false;
    const fila = nueva as Fila;
    if (incluir(fila)) {
      mapa.set(idDe(fila), fila);
      return true;
    }
    return mapa.delete(idDe(fila)); // dejó de cumplir el filtro
  };

  const recargar = (): Promise<void> => {
    if (cargando) return cargando;
    cargando = cargar()
      .then((datos) => {
        if (!cerrar) return; // nadie escucha ya
        const mapa = new Map(datos.filter(incluir).map((fila) => [idDe(fila), fila] as const));
        // Cambios llegados mientras se descargaba: se reaplican (son idempotentes).
        const atrasados = pendientes;
        pendientes = [];
        for (const cambio of atrasados) aplicarEnMapa(mapa, cambio);
        filas = mapa;
        emitir();
      })
      .catch(fallar)
      .finally(() => {
        cargando = null;
      });
    return cargando;
  };

  const aplicarCambio = (cambio: CambioTiempoReal<Fila>) => {
    if (cargando || !filas) {
      pendientes.push(cambio);
      return;
    }
    if (aplicarEnMapa(filas, cambio)) emitir();
  };

  const alCambiarEstado = (status: string, error?: Error) => {
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
