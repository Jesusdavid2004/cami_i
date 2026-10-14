import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Servicio } from './servicio';

@Component({
  selector: 'app-mediciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tarjeta">
      <div class="encabezado">
        <h2>2. Revisar mediciones</h2>
        <div class="acciones">
          <label class="campo">
            Mostrar
            <select [value]="filtro()" (change)="cambiarFiltro($event)">
              <option value="todas">Todas</option>
              <option value="descartadas">Solo descartadas</option>
              <option value="usadas">Solo las que se usan</option>
            </select>
          </label>
        </div>
      </div>

      <p class="ayuda">Las mediciones dudosas se apartan solas para no alterar el resultado. Si ves una que sí sirve, vuelve a activarla.</p>

      @if (svc.mediciones().length === 0) {
        <p class="vacio">Todavía no hay mediciones cargadas.</p>
      } @else {
        <div class="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Electrodos</th>
                <th>Corriente</th>
                <th>Voltaje</th>
                <th>Resistividad</th>
                <th>Desviación</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (x of visibles(); track x.id) {
                <tr [class.apagada]="x.descartada">
                  <td>{{ x.id }}</td>
                  <td>{{ x.a }}–{{ x.b }} / {{ x.m }}–{{ x.n }}</td>
                  <td>{{ x.corriente.toFixed(1) }} mA</td>
                  <td>{{ x.voltaje.toFixed(3) }} mV</td>
                  <td>{{ x.resistividad.toFixed(1) }} Ω·m</td>
                  <td>{{ (x.desviacion * 100).toFixed(1) }} %</td>
                  <td>
                    @if (x.descartada) {
                      <span class="etiqueta mala">{{ x.motivo }}</span>
                    } @else {
                      <span class="etiqueta buena">En uso</span>
                    }
                  </td>
                  <td>
                    <button type="button" class="enlace" (click)="svc.alternar(x.id)">
                      {{ x.descartada ? 'Usar' : 'Apartar' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="ayuda">Mostrando {{ visibles().length }} de {{ svc.mediciones().length }}.</p>
      }
    </section>
  `,
})
export class Mediciones {
  svc = inject(Servicio);
  filtro = signal<'todas' | 'descartadas' | 'usadas'>('todas');

  visibles = computed(() => {
    const todas = this.svc.mediciones();
    const f = this.filtro();
    if (f === 'descartadas') return todas.filter((x) => x.descartada).slice(0, 200);
    if (f === 'usadas') return todas.filter((x) => !x.descartada).slice(0, 200);
    return todas.slice(0, 200);
  });

  cambiarFiltro(event: Event) {
    this.filtro.set((event.target as HTMLSelectElement).value as 'todas' | 'descartadas' | 'usadas');
  }
}
