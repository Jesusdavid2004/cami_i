import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Servicio } from './servicio';
import { Carga } from './carga';
import { Mediciones } from './mediciones';
import { Seccion } from './seccion';
import { Curva } from './curva';

@Component({
  selector: 'app-root',
  imports: [Carga, Mediciones, Seccion, Curva],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  svc = inject(Servicio);

  get listo() {
    return this.svc.mediciones().length > 0;
  }

  get avance() {
    const total = this.svc.iteracionesObjetivo();
    return total ? Math.round((this.svc.iteracion() / total) * 100) : 0;
  }

  get mensaje() {
    const s = this.svc.estado();
    if (s === 'calculando') return 'Calculando la sección…';
    if (s === 'listo') return 'Listo. La sección ya está disponible.';
    if (s === 'cancelado') return 'Se detuvo a mitad de la cuenta.';
    if (s === 'detenido') return 'Se detuvo porque el resultado ya no cambiaba.';
    if (this.listo) return 'Todo listo para calcular.';
    return 'Empieza cargando el archivo de campo.';
  }

  alMoverLambda(valor: string) {
    this.svc.lambda.set(Number(valor));
    if (this.svc.estado() === 'calculando') this.svc.calcular();
  }

  alCambiarMetodo(event: Event) {
    this.svc.metodo.set((event.target as HTMLSelectElement).value as 'rapido' | 'refinado');
  }
}
