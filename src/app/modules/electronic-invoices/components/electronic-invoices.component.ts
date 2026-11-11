import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import Notiflix from 'notiflix';
import {
  ElectronicInvoiceService,
  ElectronicInvoiceListItem,
  ElectronicInvoiceResult
} from '../../../services/electronic-invoice.service';
import { ThermalTicketService } from '../../../services/thermal-ticket.service';

/** Histórico de facturas electrónicas: consulta, acciones, reintento y anulación asistida. */
@Component({
  selector: 'app-electronic-invoices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './electronic-invoices.component.html',
  styleUrls: ['./electronic-invoices.component.scss']
})
export class ElectronicInvoicesComponent implements OnInit, OnDestroy {

  readonly SRI_EN_LINEA_URL = 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT';

  // 🔎 Filtros
  desde = '';
  hasta = '';
  estado = '';
  buscar = '';
  page = 1;
  readonly pageSize = 20;

  // 📋 Datos
  facturas: ElectronicInvoiceListItem[] = [];
  total = 0;
  pendientes = 0;
  cargando = false;
  procesandoId: string | null = null;

  // ✉️ Reenvío de correo
  emailFactura: ElectronicInvoiceListItem | null = null;
  emailDestino = '';

  // 🚫 Anulación asistida
  anularFactura: ElectronicInvoiceListItem | null = null;
  anularMotivo = '';
  anularCancelarVenta = true;
  anularConfirmado = false;

  private buscar$ = new Subject<string>();
  private sub?: Subscription;

  constructor(
    private invoiceService: ElectronicInvoiceService,
    private ticket: ThermalTicketService
  ) { }

  ngOnInit(): void {
    // Al entrar se muestran todas las facturas; las fechas son un filtro opcional
    this.sub = this.buscar$.pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.aplicarFiltros());
    this.cargar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  cargar(): void {
    this.cargando = true;
    this.invoiceService.listar({
      desde: this.desde || undefined,
      hasta: this.hasta || undefined,
      estado: this.estado || undefined,
      buscar: this.buscar,
      page: this.page,
      pageSize: this.pageSize
    }).subscribe({
      next: (res) => {
        this.facturas = res.items;
        this.total = res.total;
        this.pendientes = res.pendientes;
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
        Notiflix.Notify.failure('No se pudieron cargar las facturas.');
      }
    });
  }

  aplicarFiltros(): void {
    this.page = 1;
    this.cargar();
  }

  onBuscarChange(value: string): void {
    this.buscar$.next(value);
  }

  verPendientes(): void {
    this.estado = 'PENDIENTE';
    this.desde = '';
    this.aplicarFiltros();
  }

  limpiarFiltros(): void {
    this.desde = '';
    this.hasta = '';
    this.estado = '';
    this.buscar = '';
    this.aplicarFiltros();
  }

  irAPagina(p: number): void {
    if (p < 1 || p > this.totalPaginas || p === this.page) return;
    this.page = p;
    this.cargar();
  }

  /* =========================
     🏷️ PRESENTACIÓN
     ========================= */

  fecha(value?: string): string {
    // FechaEmision llega como aaaa-mm-ddT00:00:00 (fecha local de Ecuador, sin zona)
    if (!value) return '';
    const [y, m, d] = value.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  estadoInfo(estado: string): { label: string; css: string; icon: string } {
    switch (estado) {
      case 'AUTORIZADO': return { label: 'Autorizada', css: 'ok', icon: 'bi-check-circle-fill' };
      case 'ANULADA': return { label: 'Anulada', css: 'anulada', icon: 'bi-x-octagon-fill' };
      case 'DEVUELTA':
      case 'NO AUTORIZADO': return { label: 'Rechazada', css: 'rechazada', icon: 'bi-exclamation-octagon-fill' };
      default: return { label: 'Pendiente', css: 'pendiente', icon: 'bi-hourglass-split' };
    }
  }

  esPendiente(f: ElectronicInvoiceListItem): boolean {
    return ['FIRMADA', 'ERROR_ENVIO', 'RECIBIDA'].includes(f.estado);
  }

  /* =========================
     ⚙️ ACCIONES
     ========================= */

  descargarPdf(f: ElectronicInvoiceListItem): void {
    this.invoiceService.descargarPdf(f.id).subscribe({
      next: (blob) => this.guardarArchivo(blob, `Factura-${f.numeroFactura}.pdf`),
      error: () => Notiflix.Notify.failure('No se pudo descargar el PDF.')
    });
  }

  descargarXml(f: ElectronicInvoiceListItem): void {
    this.invoiceService.descargarXml(f.id).subscribe({
      next: (blob) => this.guardarArchivo(blob, `${f.claveAcceso}.xml`),
      error: () => Notiflix.Notify.failure('No se pudo descargar el XML.')
    });
  }

  imprimirTicket(f: ElectronicInvoiceListItem): void {
    this.invoiceService.getTicket(f.id).subscribe({
      next: async (data) => {
        try {
          const html = await this.ticket.buildDocument(`Factura ${data.numeroFactura}`, this.ticket.buildInvoiceTicketBody(data));
          await this.ticket.print(html);
        } catch (error) {
          console.error('Error al imprimir la factura:', error);
          Notiflix.Notify.failure('No se pudo imprimir el ticket de la factura.');
        }
      },
      error: () => Notiflix.Notify.failure('No se pudieron obtener los datos de la factura para imprimir.')
    });
  }

  reintentar(f: ElectronicInvoiceListItem): void {
    this.procesandoId = f.id;
    this.invoiceService.reintentar(f.id).subscribe({
      next: (res) => {
        this.procesandoId = null;
        if (res.autorizada) {
          Notiflix.Notify.success(`Factura ${res.numeroFactura} autorizada por el SRI`);
        } else {
          const msg = res.mensajes?.[0]?.mensaje;
          Notiflix.Notify.warning(msg || `La factura sigue en estado ${res.estado}.`);
        }
        this.cargar();
      },
      error: (err) => {
        this.procesandoId = null;
        Notiflix.Notify.failure(err?.error?.error || 'No se pudo contactar al SRI. Intenta en unos minutos.');
      }
    });
  }

  abrirEmail(f: ElectronicInvoiceListItem): void {
    this.emailFactura = f;
    this.emailDestino = f.emailComprador || '';
  }

  enviarEmail(): void {
    const f = this.emailFactura;
    if (!f) return;
    Notiflix.Loading.standard('Enviando correo...');
    this.invoiceService.enviarEmail(f.id, this.emailDestino.trim() || undefined).subscribe({
      next: () => {
        Notiflix.Loading.remove();
        Notiflix.Notify.success('Factura enviada por correo');
        this.emailFactura = null;
        this.cargar();
      },
      error: (err) => {
        Notiflix.Loading.remove();
        Notiflix.Notify.failure(err?.error?.error || 'No se pudo enviar el correo.');
      }
    });
  }

  abrirAnular(f: ElectronicInvoiceListItem): void {
    this.anularFactura = f;
    this.anularMotivo = '';
    this.anularCancelarVenta = !!f.saleInvoiceNumber;
    this.anularConfirmado = false;
  }

  copiarClave(): void {
    const clave = this.anularFactura?.claveAcceso;
    if (!clave) return;
    navigator.clipboard.writeText(clave)
      .then(() => Notiflix.Notify.success('Clave de acceso copiada'))
      .catch(() => Notiflix.Notify.warning('No se pudo copiar; selecciónala y cópiala a mano.'));
  }

  confirmarAnulacion(): void {
    const f = this.anularFactura;
    if (!f || !this.anularConfirmado) return;

    Notiflix.Loading.standard('Registrando anulación...');
    this.invoiceService.anular(f.id, this.anularMotivo.trim(), this.anularCancelarVenta).subscribe({
      next: (res: ElectronicInvoiceResult) => {
        Notiflix.Loading.remove();
        Notiflix.Notify.success(this.anularCancelarVenta
          ? `Factura ${res.numeroFactura} anulada. Venta cancelada y stock devuelto.`
          : `Factura ${res.numeroFactura} anulada.`);
        this.anularFactura = null;
        this.cargar();
      },
      error: (err) => {
        Notiflix.Loading.remove();
        Notiflix.Notify.failure(err?.error?.error || 'No se pudo registrar la anulación.');
      }
    });
  }

  /* =========================
     🧰 UTILIDADES
     ========================= */

  private guardarArchivo(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

}
