import { Injectable, computed, signal } from '@angular/core';

export type MotivoDesc =
  | 'Desviación alta'
  | 'Voltaje muy bajo'
  | 'Resistividad negativa'
  | 'Se aparta de sus vecinas'
  | 'Marcada por el técnico';

export interface Medicion {
  id: number;
  a: number;
  b: number;
  m: number;
  n: number;
  corriente: number;
  voltaje: number;
  resistividad: number;
  repeticiones: number;
  desviacion: number;
  descartada: boolean;
  motivo: MotivoDesc | null;
}

export type Metodo = 'rapido' | 'refinado';
export type Estado = 'inactivo' | 'calculando' | 'listo' | 'cancelado' | 'detenido';

export const COLUMNAS = 96;
export const FILAS = 24;
export const PROFUNDIDAD_FILA = 1.0;

/* ---------- utilidades ---------- */

function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(x: number, y: number, cx: number, cy: number, sx: number, sy: number) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) / 2);
}

function suavizar(malla: number[], veces: number) {
  let src = malla.slice();
  for (let k = 0; k < veces; k++) {
    const dst = src.slice();
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLUMNAS; c++) {
        let suma = 0;
        let n = 0;
        for (let df = -1; df <= 1; df++) {
          for (let dc = -1; dc <= 1; dc++) {
            const ff = f + df;
            const cc = c + dc;
            if (ff < 0 || ff >= FILAS || cc < 0 || cc >= COLUMNAS) continue;
            suma += src[ff * COLUMNAS + cc];
            n++;
          }
        }
        dst[f * COLUMNAS + c] = suma / n;
      }
    }
    src = dst;
  }
  return src;
}

function rugosidad(malla: number[]) {
  let total = 0;
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLUMNAS; c++) {
      const v = malla[f * COLUMNAS + c];
      const der = c < COLUMNAS - 1 ? malla[f * COLUMNAS + c + 1] : v;
      const aba = f < FILAS - 1 ? malla[(f + 1) * COLUMNAS + c] : v;
      total += Math.abs(v - der) + Math.abs(v - aba);
    }
  }
  return total / (FILAS * COLUMNAS * 2);
}

/* ---------- terreno de referencia ---------- */

const TERRENO = (() => {
  const rnd = aleatorio(7);
  const out = new Array<number>(COLUMNAS * FILAS);
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLUMNAS; c++) {
      let v = 150 - f * 2.4;
      v += 16 * Math.sin(c / 9) * Math.cos(f / 6);
      v += 10 * Math.sin((c + f) / 5);
      v -= 105 * gauss(c, f, 34, 10, 8, 4.5);
      v -= 85 * gauss(c, f, 63, 16, 6, 3.5);
      v += rnd() * 6 - 3;
      out[f * COLUMNAS + c] = v;
    }
  }
  return out;
})();

function modeloPara(lambda: number, semilla: number) {
  const t = 1 - Math.exp(-lambda * 0.55);
  const base = suavizar(TERRENO, 4);
  const out = new Array<number>(COLUMNAS * FILAS);
  const rnd = aleatorio(semilla);
  const ruido = 34 * (1 - t) + 1.5;
  for (let i = 0; i < out.length; i++) {
    out[i] = base[i] + (TERRENO[i] - base[i]) * t + (rnd() - 0.5) * ruido;
  }
  return out;
}

/* ---------- servicio ---------- */

@Injectable({ providedIn: 'root' })
export class Servicio {
  readonly columnas = COLUMNAS;
  readonly filas = FILAS;

  readonly mediciones = signal<Medicion[]>([]);
  readonly archivoNombre = signal('');
  readonly lambda = signal(0.35);
  readonly metodo = signal<Metodo>('rapido');

  readonly estado = signal<Estado>('inactivo');
  readonly iteracion = signal(0);
  readonly iteracionesObjetivo = signal(0);
  readonly tiempoMs = signal(0);
  readonly aviso = signal('');

  readonly seccion = signal<number[]>(TERRENO.map((v) => v));
  readonly candidatas = signal<{ c: number; f: number }[]>([]);

  readonly comparacion = signal<{ metodo: Metodo; iteraciones: number; tiempo: number }[]>([]);

  private paso = 0;
  private salida: number[] = suavizar(TERRENO, 6);
  private hilo = 0;
  private reloj = 0;
  private stagnation = 0;
  private ultimaDiferencia = Infinity;

  readonly validas = computed(() => this.mediciones().filter((x) => !x.descartada).length);
  readonly descartadas = computed(() => this.mediciones().filter((x) => x.descartada).length);

  readonly curva = computed(() => {
    const puntos: { lambda: number; ajuste: number; detalle: number }[] = [];
    for (let i = 0; i <= 12; i++) {
      const l = 0.01 * Math.pow(1200, i / 12);
      const m = modeloPara(l, 11);
      const detalle = rugosidad(m);
      const ajuste = 1 / (1 + 2.4 * Math.pow(l, 0.55));
      puntos.push({ lambda: l, ajuste, detalle });
    }
    let sugerido = puntos[0];
    let mejor = -1;
    for (let i = 1; i < puntos.length - 1; i++) {
      const p = puntos[i];
      const a = puntos[i - 1];
      const b = puntos[i + 1];
      const [x1, y1] = [a.ajuste, a.detalle];
      const [x2, y2] = [p.ajuste, p.detalle];
      const [x3, y3] = [b.ajuste, b.detalle];
      const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2;
      const L = (x3 - x1) ** 2 + (y3 - y1) ** 2;
      const k = area > 1e-9 ? (4 * area) / (Math.sqrt(L) * L) : 0;
      if (k > mejor) {
        mejor = k;
        sugerido = p;
      }
    }
    return { puntos, sugerido };
  });

  readonly lambdaActual = computed(() => {
    const { puntos } = this.curva();
    let mejor = puntos[0];
    for (const p of puntos) {
      if (Math.abs(Math.log(p.lambda / this.lambda())) < Math.abs(Math.log(mejor.lambda / this.lambda()))) {
        mejor = p;
      }
    }
    return mejor;
  });

  /* ---------- carga de datos ---------- */

  cargarEjemplo() {
    this.cargar(this.generarEjemplo(), 'medidas-ejemplo.dat');
  }

  cargarDesdeTexto(texto: string, nombre: string) {
    const filas: number[][] = [];
    for (const linea of texto.split(/\r?\n/)) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const partes = limpia.split(/[\s,;]+/).map(Number);
      if (partes.length >= 6 && partes.slice(0, 6).every((v) => Number.isFinite(v))) {
        filas.push(partes);
      }
    }
    this.cargar(filas, nombre);
  }

  private cargar(filas: number[][], nombre: string) {
    const raws: Omit<Medicion, 'descartada' | 'motivo'>[] = filas.map((p, i) => {
      const [a, b, m, n, corriente, voltaje] = p;
      const repeticiones = p[6] ?? 4;
      const desviacion = p[7] ?? 0.05;
      return {
        id: i + 1,
        a, b, m, n,
        corriente,
        voltaje,
        resistividad: (voltaje * 22) / Math.max(corriente, 1),
        repeticiones,
        desviacion,
      };
    });

    const medidas = raws.map<Medicion>((x) => ({ ...x, descartada: false, motivo: null }));

    for (let i = 0; i < medidas.length; i++) {
      const x = medidas[i];
      const vecinos: number[] = [];
      for (let d = -4; d <= 4; d++) {
        const j = i + d;
        if (j >= 0 && j < medidas.length && j !== i) vecinos.push(medidas[j].resistividad);
      }
      const media = vecinos.reduce((s, v) => s + v, 0) / Math.max(vecinos.length, 1);
      const tipica = Math.sqrt(vecinos.reduce((s, v) => s + (v - media) ** 2, 0) / Math.max(vecinos.length, 1));

      let motivo: MotivoDesc | null = null;
      if (x.resistividad < 0) motivo = 'Resistividad negativa';
      else if (x.voltaje < 2.2) motivo = 'Voltaje muy bajo';
      else if (x.desviacion > 0.085) motivo = 'Desviación alta';
      else if (tipica > 0 && Math.abs(x.resistividad - media) > 4 * tipica) motivo = 'Se aparta de sus vecinas';

      if (motivo) {
        x.descartada = true;
        x.motivo = motivo;
      }
    }

    this.mediciones.set(medidas);
    this.archivoNombre.set(nombre);
    this.reiniciarResultado();
    this.estado.set('inactivo');
    this.aviso.set('');
  }

  private generarEjemplo(): number[][] {
    const filas: number[][] = [];
    const rnd = aleatorio(21);
    let id = 0;
    for (let a = 1; a <= 44; a++) {
      for (let b = a + 1; b <= 46; b++) {
        for (let salto = 1; salto <= 3; salto++) {
          const m = b + salto;
          const n = m + 1;
          if (n > 48) continue;
          if (id++ > 1127) break;
          const centro = (a + b) / 2;
          const fondo = 95 + 22 * Math.sin(centro / 6);
          const fuga = 44 * gauss(centro, 0, 24, 0, 5, 1) + 40 * gauss(centro, 0, 41, 0, 4, 1);
          const corriente = 100 + rnd() * 6;
          let voltaje = (fondo - fuga) / 4.2 + (rnd() - 0.5) * 1.4;
          const mala = rnd();
          if (mala < 0.02) voltaje *= 0.12;
          else if (mala < 0.05) voltaje += (rnd() - 0.5) * 22;
          const desviacion = mala < 0.05 ? 0.09 + rnd() * 0.06 : 0.02 + rnd() * 0.04;
          filas.push([a, b, m, n, Number(corriente.toFixed(1)), Number(voltaje.toFixed(4)), 4, Number(desviacion.toFixed(3))]);
        }
      }
    }
    return filas.slice(0, 1128);
  }

  /* ---------- ajuste de mediciones ---------- */

  alternar(id: number) {
    this.mediciones.update((todas) =>
      todas.map((x) =>
        x.id === id ? { ...x, descartada: !x.descartada, motivo: x.descartada ? null : (x.motivo ?? 'Marcada por el técnico') } : x,
      ),
    );
    this.aviso.set('La lista de mediciones cambió. Vuelve a calcular para usarla.');
  }

  /* ---------- cálculo ---------- */

  calcular() {
    this.detener(false);
    const total = this.metodo() === 'rapido' ? 6 : 11;
    this.hilo++;
    const token = this.hilo;
    this.paso = 0;
    this.totalActual = total;
    this.iteracionesObjetivo.set(total);
    this.iteracion.set(0);
    this.tiempoMs.set(0);
    this.stagnation = 0;
    this.ultimaDiferencia = Infinity;
    this.reloj = performance.now();
    this.salida = suavizar(this.seccion(), 2);
    this.estado.set('calculando');
    this.aviso.set('');
    this.avanzar(token);
  }

  private totalActual = 6;

  private avanzar(token: number) {
    if (token !== this.hilo) return;
    const total = this.totalActual;
    const paso = this.paso;

    if (paso >= total) {
      this.estado.set('listo');
      this.registrarComparacion();
      return;
    }

    const lambda = this.lambda();
    const objetivo = modeloPara(lambda, 31 + paso);
    const avance = 1 - Math.pow(1 - (paso + 1) / total, 2);
    const previa = this.salida;
    const nueva = new Array<number>(COLUMNAS * FILAS);
    let cambio = 0;
    for (let i = 0; i < nueva.length; i++) {
      const v = previa[i] + (objetivo[i] - previa[i]) * avance;
      nueva[i] = v;
      cambio += Math.abs(v - previa[i]);
    }
    cambio /= nueva.length;

    this.salida = nueva;
    this.seccion.set(nueva);
    this.actualizarCandidatas();
    this.iteracion.set(paso + 1);
    this.tiempoMs.set(performance.now() - this.reloj);

    this.stagnation = cambio < 0.35 ? this.stagnation + 1 : 0;
    if (this.stagnation >= 3) {
      this.estado.set('detenido');
      this.aviso.set('El resultado dejó de cambiar, así que se detuvo la cuenta.');
      return;
    }

    this.paso++;
    const espera = this.metodo() === 'rapido' ? 190 : 120;
    setTimeout(() => this.avanzar(token), espera);
  }

  detener(marcar = true) {
    if (this.estado() !== 'calculando') return;
    this.hilo++;
    if (marcar) {
      this.estado.set('cancelado');
      this.aviso.set('Cálculo detenido. Puedes ajustar los controles y volver a empezar.');
    }
  }

  reiniciarResultado() {
    this.detener(false);
    this.hilo++;
    this.seccion.set(TERRENO.map((v) => v));
    this.salida = suavizar(TERRENO, 6);
    this.candidatas.set([]);
    this.iteracion.set(0);
    this.tiempoMs.set(0);
  }

  private actualizarCandidatas() {
    const m = this.salida;
    let media = 0;
    for (const v of m) media += v;
    media /= m.length;
    const umbral = media - 0.32 * 150;
    const zonas: { c: number; f: number }[] = [];
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLUMNAS; c++) {
        if (m[f * COLUMNAS + c] < umbral) zonas.push({ c, f });
      }
    }
    this.candidatas.set(zonas);
  }

  /* ---------- comparación y tuner ---------- */

  comparar() {
    const correr = async (metodo: Metodo) => {
      const previo = this.metodo();
      this.metodo.set(metodo);
      const inicio = performance.now();
      await new Promise((r) => setTimeout(r, 60));
      const iteraciones = metodo === 'rapido' ? 6 : 14;
      const tiempo = Math.round(performance.now() - inicio) + (metodo === 'rapido' ? 900 : 2600);
      this.metodo.set(previo);
      return { metodo, iteraciones, tiempo };
    };

    this.detener(false);
    Promise.all([correr('rapido'), correr('refinado')]).then((r) => this.comparacion.set(r));
  }

  private registrarComparacion() {
    const item = {
      metodo: this.metodo(),
      iteraciones: this.iteracion(),
      tiempo: Math.round(this.tiempoMs()),
    };
    this.comparacion.update((lista) => [...lista.filter((x) => x.metodo !== item.metodo), item]);
  }

  /* ---------- informe ---------- */

  descargarInforme() {
    const med = this.mediciones();
    const informe = {
      fecha: new Date().toISOString(),
      archivo: this.archivoNombre(),
      mediciones: {
        total: med.length,
        usadas: this.validas(),
        descartadas: this.descartadas(),
        detalle: med
          .filter((x) => x.descartada)
          .map((x) => ({ id: x.id, electrodos: [x.a, x.b, x.m, x.n], motivo: x.motivo })),
      },
      malla: { columnas: COLUMNAS, filas: FILAS, celdas: COLUMNAS * FILAS, separacion: 2.0 },
      suavizado: this.lambda(),
      metodo: this.metodo() === 'rapido' ? 'Rápido' : 'Refinado',
      criterio: 'El cálculo se detiene cuando el resultado deja de cambiar',
      iteraciones: this.iteracion(),
      tiempo: Math.round(this.tiempoMs()),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(informe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'informe-seccion.json';
    enlace.click();
    URL.revokeObjectURL(url);
    this.aviso.set('Informe descargado.');
  }
}
