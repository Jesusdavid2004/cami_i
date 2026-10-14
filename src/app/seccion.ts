import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { COLUMNAS, FILAS, PROFUNDIDAD_FILA, Servicio } from './servicio';

@Component({
  selector: 'app-seccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tarjeta">
      <div class="encabezado">
        <h2>4. Sección del subsuelo</h2>
        <label class="campo">
          <input type="checkbox" [checked]="perfil()" (change)="perfil.set(!perfil())" />
          Ver perfil vertical
        </label>
      </div>

      <div class="lienzo-envoltura">
        <canvas #lienzo (mousemove)="alMover($event)" (mouseleave)="alSalir()" (click)="fijarColumna()"></canvas>
      </div>

      <div class="escala">
        <span>Baja</span>
        <div class="barra"></div>
        <span>Alta resistividad</span>
      </div>

      <div class="leyenda">
        <span><i class="marca tuberia"></i> Tubería</span>
        <span><i class="marca zona"></i> Zonas a revisar</span>
      </div>

      @if (lectura(); as l) {
        <p class="lectura">
          <strong>{{ l.resistividad.toFixed(1) }} Ω·m</strong> a <strong>{{ l.profundidad.toFixed(1) }} m</strong>
          de profundidad &middot; a {{ (l.horizontal).toFixed(1) }} m del inicio
          @if (l.candidata) {
            <span class="etiqueta mala">Zona a revisar</span>
          }
        </p>
      } @else {
        <p class="ayuda">Pasa el cursor por la sección para ver los valores de cada punto.</p>
      }

      @if (perfil() && columna() !== null) {
        <div class="perfil">
          <h3>Perfil en la posición {{ (columna()! * 2).toFixed(1) }} m</h3>
          <div class="barras">
            @for (v of perfilColumna(); track $index) {
              <div class="barra-col" [style.height.%]="alto($index)" [title]="'Resistividad ' + v.toFixed(1)"></div>
            }
          </div>
          <p class="ayuda">Cada barra es una profundidad, de la superficie hacia abajo.</p>
        </div>
      }
    </section>
  `,
})
export class Seccion {
  svc = inject(Servicio);
  lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');

  lectura = signal<{ resistividad: number; profundidad: number; horizontal: number; candidata: boolean } | null>(null);
  columna = signal<number | null>(null);
  perfil = signal(false);

  private pendiente = 0;

  constructor() {
    effect(() => {
      this.svc.seccion();
      this.svc.candidatas();
      this.programarDibujo();
    });
    afterNextRender(() => this.programarDibujo());
  }

  private programarDibujo() {
    if (!this.lienzo() || this.pendiente) return;
    this.pendiente = requestAnimationFrame(() => {
      this.pendiente = 0;
      untracked(() => this.dibujar());
    });
  }

  private dibujar() {
    const canvas = this.lienzo().nativeElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = canvas.clientWidth || 800;
    const escalaFila = 22;
    const alto = FILAS * escalaFila;

    if (canvas.width !== Math.round(ancho * dpr) || canvas.height !== Math.round(alto * dpr)) {
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      canvas.style.height = alto + 'px';
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const malla = this.svc.seccion();
    let min = Infinity;
    let max = -Infinity;
    for (const v of malla) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const rango = Math.max(max - min, 1);

    const px = ancho / COLUMNAS;
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLUMNAS; c++) {
        const t = (malla[f * COLUMNAS + c] - min) / rango;
        ctx.fillStyle = color(t);
        ctx.fillRect(c * px, f * escalaFila, px + 1, escalaFila + 1);
      }
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f2937';
    const yTuberia = FILAS * 0.42 * escalaFila;
    ctx.beginPath();
    ctx.moveTo(0, yTuberia);
    ctx.lineTo(ancho, yTuberia);
    ctx.stroke();

    ctx.fillStyle = 'rgba(220,38,38,0.85)';
    const candidatas = this.svc.candidatas();
    for (const z of candidatas) {
      ctx.fillRect(z.c * px, z.f * escalaFila, px + 1, escalaFila + 1);
    }

    const col = this.columna();
    if (col !== null) {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(col * px, 0, px, alto);
    }
  }

  alMover(event: MouseEvent) {
    const canvas = this.lienzo().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const px = rect.width / COLUMNAS;
    const c = Math.min(COLUMNAS - 1, Math.max(0, Math.floor((event.clientX - rect.left) / px)));
    const f = Math.min(FILAS - 1, Math.max(0, Math.floor((event.clientY - rect.top) / 22)));
    const malla = this.svc.seccion();
    const candidatas = this.svc.candidatas();
    this.lectura.set({
      resistividad: malla[f * COLUMNAS + c],
      profundidad: (f + 1) * PROFUNDIDAD_FILA,
      horizontal: (c + 0.5) * 2,
      candidata: candidatas.some((z) => z.c === c && z.f === f),
    });
  }

  alSalir() {
    this.lectura.set(null);
  }

  fijarColumna() {
    const l = this.lectura();
    this.columna.set(l ? Math.min(COLUMNAS - 1, Math.floor(l.horizontal / 2)) : null);
  }

  perfilColumna() {
    const c = this.columna();
    if (c === null) return [];
    const malla = this.svc.seccion();
    const valores: number[] = [];
    for (let f = 0; f < FILAS; f++) valores.push(malla[f * COLUMNAS + c]);
    return valores;
  }

  alto(indice: number) {
    const c = this.columna();
    if (c === null) return 0;
    const malla = this.svc.seccion();
    const max = Math.max(...malla, 1);
    return Math.max(2, (malla[indice * COLUMNAS + c] / max) * 100);
  }
}

function color(t: number) {
  const paradas: [number, number, number][] = [
    [30, 64, 175],
    [14, 165, 233],
    [190, 242, 100],
    [250, 204, 21],
    [239, 138, 75],
    [190, 24, 93],
  ];
  const x = Math.min(0.9999, Math.max(0, t)) * (paradas.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = paradas[i];
  const b = paradas[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
