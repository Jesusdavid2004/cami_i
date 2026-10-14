import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Servicio } from './servicio';

@Component({
  selector: 'app-curva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tarjeta">
      <h2>5. Curva de recomendación</h2>
      <p class="ayuda">
        Relación entre el ajuste de la imagen y su detalle. El punto señalado es un buen punto de partida: más suave
        oculta la fuga, más detallado muestra manchas falsas.
      </p>

      <svg viewBox="0 0 320 220" class="curva" role="img" aria-label="Curva de recomendación">
        <line x1="40" y1="180" x2="300" y2="180" class="eje" />
        <line x1="40" y1="180" x2="40" y2="20" class="eje" />

        <path [attr.d]="linea()" class="trazo" />
        <text x="170" y="205" text-anchor="middle" class="texto">Nivel de suavizado bajo</text>
        <text x="170" y="219" text-anchor="middle" class="texto">Nivel de suavizado alto</text>
        <text x="14" y="110" class="texto" transform="rotate(-90 14 110)" text-anchor="middle">Detalle de la imagen</text>

        @for (p of puntos(); track p.lambda) {
          <circle [attr.cx]="x(p)" [attr.cy]="y(p)" r="2.5" class="punto" />
        }

        <circle [attr.cx]="x(sugerido())" [attr.cy]="y(sugerido())" r="6" class="sugerido" />
        <circle [attr.cx]="x(actual())" [attr.cy]="y(actual())" r="5" class="actual" />

        <text
          [attr.x]="x(sugerido())"
          [attr.y]="y(sugerido()) - 10"
          [attr.text-anchor]="x(sugerido()) > 200 ? 'end' : 'middle'"
          class="texto"
        >
          Sugerido: {{ sugerido().lambda.toFixed(2) }}
        </text>
      </svg>

      <p class="ayuda">Estás usando {{ svc.lambda().toFixed(2) }}.</p>
      <button type="button" class="boton secundario" (click)="usarSugerido()">Usar el valor sugerido</button>
    </section>
  `,
})
export class Curva {
  svc = inject(Servicio);

  puntos = () => this.svc.curva().puntos;
  sugerido = () => this.svc.curva().sugerido;
  actual = () => this.svc.lambdaActual();

  x(p: { lambda: number }) {
    const min = Math.log(this.puntos()[0].lambda);
    const max = Math.log(this.puntos()[this.puntos().length - 1].lambda);
    return 40 + ((Math.log(p.lambda) - min) / (max - min)) * 250;
  }

  y(p: { detalle: number }) {
    const valores = this.puntos().map((q) => q.detalle);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return 180 - ((p.detalle - min) / Math.max(max - min, 1e-9)) * 150;
  }

  linea() {
    return this.puntos()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${this.x(p).toFixed(1)},${this.y(p).toFixed(1)}`)
      .join(' ');
  }

  usarSugerido() {
    this.svc.lambda.set(Number(this.sugerido().lambda.toFixed(2)));
  }
}
