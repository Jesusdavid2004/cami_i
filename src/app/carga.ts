import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Servicio } from './servicio';

@Component({
  selector: 'app-carga',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tarjeta">
      <h2>1. Cargar mediciones</h2>
      <p class="ayuda">Sube el archivo que sale del equipo de campo. Si no tienes uno a mano, puedes empezar con datos de ejemplo.</p>

      <div class="fila">
        <label class="boton">
          Elegir archivo
          <input type="file" accept=".dat,.txt,.csv" hidden (change)="onFile($event)" />
        </label>
        <button type="button" class="boton secundario" (click)="svc.cargarEjemplo()">Usar datos de ejemplo</button>
      </div>

      @if (svc.archivoNombre()) {
        <p class="ruta">Archivo: <strong>{{ svc.archivoNombre() }}</strong></p>
        <p class="ayuda">
          {{ svc.mediciones().length }} mediciones leídas &middot; {{ svc.validas() }} para usar &middot;
          {{ svc.descartadas() }} descartadas
        </p>
      }
    </section>
  `,
})
export class Carga {
  svc = inject(Servicio);

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    archivo
      .text()
      .then((texto) => this.svc.cargarDesdeTexto(texto, archivo.name))
      .finally(() => (input.value = ''));
  }
}
