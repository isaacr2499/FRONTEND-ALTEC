import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { SmartSearchCache } from '../../../shared/utils/smart-search';
import { UntypedFormBuilder, UntypedFormGroup } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";
import { ProductService } from "../../warehouse/services/warehouse.service";
import html2pdf from 'html2pdf.js';
import Notiflix from "notiflix";
declare var bootstrap: any;
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { saveAs } from 'file-saver';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ThermalTicketService } from 'src/app/services/thermal-ticket.service';




@Component({
  selector: 'app-product-quote',
  templateUrl: './product-quote.component.html',
  styleUrls: ['./product-quote.component.scss']
})
export class ProductQuoteComponent implements OnInit {
  public formGroup!: UntypedFormGroup;
  private smartSearch = new SmartSearchCache<any>(p => [p.descripcion, p.codigo, p.categoria], p => Number(p.stock) > 0);
  allProducts: any[] = [];
  filteredProducts: any[] = [];
  products: any[] = [];
  selectedProduct: any;
  totalCount: number = 0;
  currentPage: number = 1;
  totalPages: number = 0;
  private pageSize: number = 5;
  isFirstLoad: boolean = true;
  isLoading: boolean = true;
  cotizacion: any[] = [];
  resistorValues: string[] = [
    '1Ω', '8.2Ω', '10Ω', '20Ω', '22Ω', '27Ω', '47Ω', '56Ω', '62Ω', '68Ω', '75Ω', '82Ω',
    '100Ω', '110Ω', '120Ω', '200Ω', '220Ω', '240Ω', '270Ω', '300Ω', '330Ω', '360Ω',
    '390Ω', '470Ω', '510Ω', '560Ω', '680Ω', '820Ω',
    '1kΩ', '1.2kΩ', '1.8kΩ', '2kΩ', '2.2kΩ', '2.7kΩ', '3.3kΩ', '3.9kΩ', '4.7kΩ',
    '5.1kΩ', '5.6kΩ', '6.2kΩ', '6.8kΩ', '8.2kΩ', '10kΩ', '12kΩ', '15kΩ', '16kΩ',
    '20kΩ', '22kΩ', '27kΩ', '39kΩ', '47kΩ', '56kΩ', '68kΩ', '82kΩ', '100kΩ',
    '120kΩ', '150kΩ', '220kΩ', '270kΩ', '330kΩ', '470kΩ', '560kΩ', '750kΩ', '820kΩ',
    '1MΩ', '2.2MΩ', '10MΩ'
  ];

  resistorHalfWattValues: string[] = [
    '12Ω', '15Ω', '18Ω', '30Ω', '33Ω', '39Ω', '56Ω', '150Ω',
    '1.5kΩ', '10kΩ', '33kΩ', '100kΩ', '150kΩ', '680kΩ'
  ];

  activeResistorValues: string[] = [];
  resistorLabel: string = '';

  ledColors: { nombre: string; hex: string }[] = [
    { nombre: 'Blanco',   hex: '#ffffff' },
    { nombre: 'Rojo',     hex: '#ef4444' },
    { nombre: 'Verde',    hex: '#22c55e' },
    { nombre: 'Amarillo', hex: '#facc15' },
    { nombre: 'Azul',     hex: '#3b82f6' }
  ];
  isLed: boolean = false;
  selectedLedColor: string = '';

  selectedCategory: string = '';
  onlyImport: boolean = false;
  onlyLowStock: boolean = false;

  categories = [
    'Audio y video',
    'Baquelitas',
    'Componentes Electrónicos',
    'Compuertas e Integrados',
    'Electricidad',
    'Fuentes',
    'Herramientas',
    'Microcontroladores y Arduinos',
    'Modulos y Sensores',
    'Motores',
    'Parlantes',
    'Pilas y Baterias',
    'Plugs y Conectores',
    'Por Importar',
    'Protoboards',
    'Proyectos Y kits',
    'Redes y Comunicación',
    'Transformadores',
    'Otros'
  ];

  selectedResistorValue = '';
  isResistor: boolean = false;
  @ViewChild('pdfCotizacion', {static: false}) pdfCotizacion!: ElementRef;

  // Variables para modal de extra y loader
  extraCost: number = 0;
  extraDescription: string = '';
  isDownloading: boolean = false;
  downloadMessage: string = '';

  // Historial de cotizaciones
  historialCotizaciones: any[] = [];
  busquedaHistorial: string = '';
  cargandoHistorial: boolean = false;
  cotizacionCargadaNumero: string | null = null;

  constructor(
    private productService: ProductService,
    private fb: UntypedFormBuilder,
    private http: HttpClient,
    private ticket: ThermalTicketService
  ) {
  }

  ngOnInit(): void {
    this.formGroup = this.fb.group({
      searchControl: [''],
      importCheck: [false],
      lowStockCheck: [false]
    });


    // Carga inicial: traemos un batch grande y filtramos en cliente
    this.getProducts();

    // Búsqueda reactiva con debounce
    this.formGroup.get('searchControl')!
      .valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.applyFilter();
      });
  }

  filtrarCategoria(categoria: string) {
    this.selectedCategory = categoria;
    this.currentPage = 1;
    this.applyFilter();
  }

  toggleImport() {
    this.onlyImport = this.formGroup.get('importCheck')?.value;
    this.currentPage = 1;
    this.applyFilter();
  }

  toggleLowStock() {
    this.onlyLowStock = this.formGroup.get('lowStockCheck')?.value;
    this.currentPage = 1;
    this.applyFilter();
  }

  // Limpiar todos los filtros
  clearAllFilters(): void {
    this.selectedCategory = '';
    this.onlyImport = false;
    this.onlyLowStock = false;
    this.formGroup.patchValue({
      importCheck: false,
      lowStockCheck: false
    });
    this.currentPage = 1;
    this.applyFilter();
  }

  onSubmit() {
  }

  openProductModal(product: any): void {
    this.selectedProduct = product;

    const desc = product.descripcion?.toLowerCase() || '';
    if (desc.includes('resistencia') && desc.includes('1/2')) {
      this.isResistor = true;
      this.isLed = false;
      this.activeResistorValues = this.resistorHalfWattValues;
      this.resistorLabel = 'Resistencia ½ Watt';
    } else if (desc.includes('resistencia') && desc.includes('1/4')) {
      this.isResistor = true;
      this.isLed = false;
      this.activeResistorValues = this.resistorValues;
      this.resistorLabel = 'Resistencia ¼ Watt';
    } else if (desc.includes('diodo') && desc.includes('led')) {
      this.isLed = true;
      this.isResistor = false;
      this.activeResistorValues = [];
      this.resistorLabel = '';
    } else {
      this.isResistor = false;
      this.isLed = false;
      this.activeResistorValues = [];
      this.resistorLabel = '';
    }
    this.selectedResistorValue = '';
    this.selectedLedColor = '';

    const modalElement = document.getElementById('productModal');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  getProducts(): void {
    if (this.isFirstLoad) {
      Notiflix.Loading.standard('Cargando productos...');
      this.isLoading = true;
    }

    // Ajusta 1000 si necesitas más/menos
    this.productService.getProducts(1, 1000, '', 'descripcion', 'asc').subscribe({
      next: (data: any) => {
        const items = data?.items ?? [];
        this.allProducts = items.map((p: any) => ({
          ...p,
        }));

        this.applyFilter();

        if (this.isFirstLoad) {
          Notiflix.Loading.remove();
          this.isLoading = false;
          this.isFirstLoad = false;
        }
      },
      error: (error: any) => {
        console.error('Error al obtener los productos', error);
        if (this.isFirstLoad) {
          Notiflix.Loading.remove();
          this.isLoading = false;
          this.isFirstLoad = false;
        }
      }
    });
  }

  applyFilter(): void {
    const raw = this.formGroup.get('searchControl')!.value || '';

    let filtered = this.allProducts;

    // 🔹 Categoría
    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.categoria === this.selectedCategory);
    }

    // 🔹 Importación
    if (this.onlyImport) {
      filtered = filtered.filter(p => p.isImport);
    }

    // 🔹 Stock bajo
    if (this.onlyLowStock) {
      filtered = filtered.filter(p => p.stock < 5);
    }

    // 🔹 Texto: búsqueda inteligente (tildes, errores de tipeo, sinónimos…)
    if (raw.trim()) {
      filtered = this.smartSearch.filter(this.allProducts, filtered, raw).items;
    }

    this.filteredProducts = filtered;
    this.totalCount = filtered.length;
    this.totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.products = filtered.slice(startIndex, startIndex + this.pageSize);
  }

  /** ---------- Paginación (cliente) ---------- */
  onPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.applyFilter();
    }
  }

  onNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.applyFilter();
    }
  }

  /** ---------- Helpers de búsqueda avanzada ---------- */







  /** ---------- Cotización / PDF (tu lógica intacta) ---------- */

  async agregarACotizacion(item: any) {

    // 🔌 Si es resistencia, exige valor
    if (this.isResistor) {
      if (!this.selectedResistorValue) {
        Notiflix.Notify.warning('Selecciona el valor de la resistencia');
        return;
      }
      item = {
        ...item,
        descripcion: `${item.descripcion} - ${this.selectedResistorValue}`
      };
    }

    // 💡 Si es diodo LED, exige color
    if (this.isLed) {
      if (!this.selectedLedColor) {
        Notiflix.Notify.warning('Selecciona el color del LED');
        return;
      }
      item = {
        ...item,
        descripcion: `${item.descripcion} - ${this.selectedLedColor}`
      };
    }

    const nuevoItem = {...item};
    nuevoItem.foto = item.foto;

    if (item.foto) {
      try {
        const base64 = await this.getBase64ImageFromURL(item.foto);
        nuevoItem.fotoBase64 = base64;
      } catch {
        nuevoItem.fotoBase64 = null;
      }
    }

    this.cotizacion.push(nuevoItem);
    this.close();
  }


  getBase64ImageFromURL(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/jpeg');
        resolve(dataURL);
      };
      img.onerror = () => reject('No se pudo cargar la imagen desde la URL: ' + url);
      img.src = url;
    });
  }

  close(): void {
    const modalElement = document.getElementById('productModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal?.hide();
    }
  }

  eliminarDeCotizacion(index: number): void {
    this.cotizacion.splice(index, 1);
  }

  // Incrementar cantidad
  incrementarCantidad(index: number): void {
    this.cotizacion[index].cantidad++;
    this.cotizacion[index].total = this.cotizacion[index].cantidad * this.cotizacion[index].precio;
  }

  // Decrementar cantidad
  decrementarCantidad(index: number): void {
    if (this.cotizacion[index].cantidad > 1) {
      this.cotizacion[index].cantidad--;
      this.cotizacion[index].total = this.cotizacion[index].cantidad * this.cotizacion[index].precio;
    } else {
      // Si la cantidad es 1, eliminar el producto
      this.eliminarDeCotizacion(index);
    }
  }

  setCantidad(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1) {
      this.cotizacion[index].cantidad = val;
      this.cotizacion[index].total = val * this.cotizacion[index].precio;
    } else {
      this.cotizacion[index].cantidad = 1;
      this.cotizacion[index].total = this.cotizacion[index].precio;
      input.value = '1';
    }
  }

  get totalCotizacion(): number {
    return this.cotizacion.reduce((acc, item) => acc + item.total, 0);
  }

  async descargarPDF() {
    this.isDownloading = true;
    this.downloadMessage = 'Guardando cotización...';

    // Guardar en BD primero — el backend genera el número único
    const quotationDetails = this.cotizacion.map(product => ({
      productId: product.id,
      quantity: product.cantidad,
      unitPrice: product.precio,
      priceType: product.priceType || 'pvp'
    }));

    let quotationNumber: string;
    try {
      const response: any = await new Promise((resolve, reject) => {
        this.http.post(`${environment.apiALTEC}/api/cotizaciones`, { quotationDetails }).subscribe({
          next: (res) => resolve(res),
          error: (err) => reject(err)
        });
      });
      // El backend devuelve un array; el número está en el primer elemento
      quotationNumber = response[0]?.quotationNumber;
      if (!quotationNumber) throw new Error('Número de cotización no recibido');
    } catch (err) {
      console.error('Error al guardar la cotización:', err);
      Notiflix.Notify.failure('Error al guardar la cotización en la base de datos');
      this.isDownloading = false;
      return;
    }

    this.downloadMessage = 'Generando PDF...';
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.padding = '20px';
      container.style.backgroundColor = '#ffffff';
      container.style.fontFamily = 'Arial, sans-serif';

      // Fecha y hora se formatean por separado: Chrome cambió el formato combinado
      // ("24 de octubre de 2026 a las 01:03 p. m.", sin coma) y separar por ',' rompía el PDF
      const now = new Date();
      const fecha = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil', year: 'numeric', month: 'long', day: 'numeric'
      }).format(now);
      const hora = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: true
      }).format(now);

      const header = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #0C1E3A;">
        <div style="flex: 0 0 auto;">
          <img src="assets/images/Logo-completo.jpeg" alt="Logo ALTEC" style="max-height: 80px;">
        </div>
        <div style="flex: 1; text-align: center; padding: 0 20px;">
          <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: bold; color: #0C1E3A;">COTIZACIÓN</h1>
          <div style="font-size: 11px; color: #555;">
            <p style="margin: 3px 0;"><strong>Fecha:</strong> ${fecha.trim()} | <strong>Hora:</strong> ${hora.trim()}</p>
            <p style="margin: 3px 0;"><strong>Ubicación:</strong> Quito, Villaflora, Rodrigo de Chávez</p>
            <p style="margin: 3px 0;"><strong>WhatsApp:</strong> (099) 515-9078</p>
          </div>
        </div>
        <div style="flex: 0 0 auto; width: 80px;"></div>
      </div>`;

      let tableRows = '';
      this.cotizacion.forEach((item, index) => {
        const totalFormatted = new Intl.NumberFormat('es-EC', {style: 'currency', currency: 'USD'}).format(item.total);
        const precioFormatted = new Intl.NumberFormat('es-EC', {
          style: 'currency',
          currency: 'USD'
        }).format(item.precio || 0);
        const bgColor = index % 2 === 0 ? '#f8f9fa' : '#ffffff';

        tableRows += `
        <tr style="background-color: ${bgColor};">
          <td style="border: 1px solid #dee2e6; padding: 8px; font-size: 11px;">${item.descripcion}</td>
          <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; font-size: 11px;">
            ${item.fotoBase64 ? `<img src="${item.fotoBase64}" alt="Producto" style="max-height: 50px; max-width: 50px; object-fit: contain;">`
          : item.foto ? `<img src="${item.foto}" alt="Producto" style="max-height: 50px; max-width: 50px; object-fit: contain;">`
            : '—'}
          </td>
          <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; font-size: 11px; font-weight: bold;">${item.cantidad}</td>
          <td style="border: 1px solid #dee2e6; padding: 8px; text-align: right; font-size: 11px;">${precioFormatted}</td>
          <td style="border: 1px solid #dee2e6; padding: 8px; text-align: right; font-size: 11px; font-weight: bold; color: #0C1E3A;">${totalFormatted}</td>
        </tr>`;
      });

      const table = `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
        <thead>
          <tr style="background: linear-gradient(135deg, #0C1E3A, #1a3a5c); color: white;">
            <th style="padding: 10px; border: 1px solid #0C1E3A; text-align: left;">Producto</th>
            <th style="padding: 10px; border: 1px solid #0C1E3A; width: 80px;">Imagen</th>
            <th style="padding: 10px; border: 1px solid #0C1E3A; width: 80px;">Cantidad</th>
            <th style="padding: 10px; border: 1px solid #0C1E3A; width: 100px; text-align: right;">Precio Unit.</th>
            <th style="padding: 10px; border: 1px solid #0C1E3A; width: 100px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
        <tfoot>
          <tr style="background: linear-gradient(135deg, #10B981, #059669); color: white;">
            <td colspan="4" style="text-align: right; font-weight: bold; padding: 12px; border: 1px solid #059669; font-size: 13px;">TOTAL GENERAL:</td>
            <td style="font-weight: bold; padding: 12px; border: 1px solid #059669; text-align: right; font-size: 15px;">
              ${new Intl.NumberFormat('es-EC', {style: 'currency', currency: 'USD'}).format(this.totalCotizacion)}
            </td>
          </tr>
        </tfoot>
      </table>`;

      const footer = `
      <div style="margin-top: 25px; padding: 15px; border: 2px dashed #0C1E3A; border-radius: 8px; background: linear-gradient(135deg, #f0f9ff, #e0f2fe);">
        <h3 style="color: #0C1E3A; font-weight: bold; margin: 0 0 10px 0; font-size: 14px; text-align: center;">
          INFORMACIÓN DE PAGO
        </h3>
        <div style="text-align: center; font-size: 11px; color: #333;">
          <p style="margin: 5px 0; font-weight: bold; font-size: 13px;">ALTEC MECATRÓNICA</p>
          <p style="margin: 5px 0;"><strong>Titular:</strong> JOSHUA ISAAC REYES HEREDIA</p>
          <p style="margin: 5px 0;"><strong>CI:</strong> 1718068578</p>
          <p style="margin: 5px 0;"><strong>Banco:</strong> PICHINCHA - Cuenta de Ahorros</p>
          <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #0C1E3A;">N° 2204742473</p>
        </div>
      </div>

      <div style="margin-top: 15px; padding: 10px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #dee2e6;">
        <p style="margin: 5px 0;">Gracias por su preferencia</p>
        <p style="margin: 5px 0;">Cotización generada el ${fecha.trim()} a las ${hora.trim()}</p>
        <p style="margin: 5px 0; font-weight: bold; color: #8B50FB;">Developed by SwiFt 2025</p>
      </div>`;

      // Cotización ya guardada en BD — generar PDF con el número recibido
      Notiflix.Notify.success(`Cotización N° ${quotationNumber} guardada exitosamente`);

      const pdfHeader = `
      <div style="text-align: center; margin-bottom: 15px; padding: 10px; background: #f0f4ff; border-radius: 6px; border: 1px solid #0C1E3A;">
        <h2 style="color: #0C1E3A; font-weight: bold; margin: 0; font-size: 18px;">N° DE COTIZACIÓN: ${quotationNumber}</h2>
      </div>`;

      container.innerHTML = pdfHeader + header + table + footer;

      const opciones = {
        margin: [10, 10, 10, 10],
        filename: `ALTEC-Cotizacion-${quotationNumber}.pdf`,
        image: {type: 'jpeg', quality: 0.98},
        html2canvas: {
          scale: 2,
          logging: false,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: {
          unit: 'mm',
          format: 'letter',
          orientation: 'portrait'
        },
        pagebreak: {mode: ['avoid-all', 'css', 'legacy']}
      };

      await html2pdf().from(container).set(opciones).save();
    } catch (error) {
      console.error('Error al generar el PDF:', error);
      Notiflix.Notify.failure('Error al generar el PDF. La cotización sí quedó guardada.');
    } finally {
      // Siempre cerrar el aviso "Generando PDF...", aunque falle la generación
      this.isDownloading = false;
    }
  }

  /** ---------- Ticket térmico 80 mm ---------- */

  /** Imprime la cotización como ticket de 80 mm (impresora térmica). No guarda nada en la BD. */
  async imprimirTicket(): Promise<void> {
    if (!this.cotizacion.length) {
      Notiflix.Notify.warning('Agrega productos a la cotización antes de imprimir');
      return;
    }

    Notiflix.Loading.standard('Preparando ticket...');
    try {
      const html = await this.ticket.buildDocument('Cotizacion ALTEC', this.buildTicketBody());
      Notiflix.Loading.remove();
      await this.ticket.print(html);
    } catch (error) {
      Notiflix.Loading.remove();
      console.error('Error al imprimir el ticket:', error);
      Notiflix.Notify.failure('No se pudo preparar el ticket para imprimir');
    }
  }

  private buildTicketBody(): string {
    const money = (v: number) => this.ticket.money(v);
    const esc = (t: any) => this.ticket.esc(t);
    const { fecha, hora } = this.ticket.fechaHora();

    const items = this.cotizacion.map(item => `
      <div class="item">
        <div class="desc">${esc(item.descripcion)}</div>
        <div class="row">
          <span>${item.cantidad} x ${money(item.precio)}</span>
          <span class="bold">${money(item.total)}</span>
        </div>
      </div>`).join('');

    const unidades = this.cotizacion.reduce((sum, i) => sum + (Number(i.cantidad) || 0), 0);
    const numero = this.cotizacionCargadaNumero ? ` N° ${esc(this.cotizacionCargadaNumero)}` : '';

    return `
  <div class="center brand">ALTEC MECATRÓNICA</div>
  <div class="center small">Quito, Villaflora, Rodrigo de Chávez</div>
  <div class="center small">WhatsApp: (099) 515-9078</div>
  <div class="sep-strong"></div>
  <div class="center title">COTIZACIÓN${numero}</div>
  <div class="row small"><span>Fecha: ${fecha}</span><span>Hora: ${hora}</span></div>
  <div class="sep"></div>
  ${items}
  <div class="sep"></div>
  <div class="row small"><span>Productos: ${this.cotizacion.length}</span><span>Unidades: ${unidades}</span></div>
  <div class="sep-strong"></div>
  <div class="row total"><span>TOTAL</span><span>${money(this.totalCotizacion)}</span></div>
  <div class="sep-strong"></div>
  <div class="center small">Precios en dólares (USD).</div>
  <div class="center small">Cotización referencial, sujeta a disponibilidad de stock.</div>
  <div class="center bold" style="margin-top:1mm">Vigencia de esta proforma: 72 horas.</div>
  <div class="center bold" style="margin-top:2mm">¡Gracias por su preferencia!</div>
  <div class="center small">altecmec.com</div>`;
  }

  incluirExtra() {
    this.extraDescription = '';
    this.extraCost = 0;

    const modalElement = document.getElementById('extraModal');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  confirmarExtra() {
    const desc = this.extraDescription.trim();
    if (!desc) {
      Notiflix.Notify.warning('Ingresa una descripción para el extra');
      return;
    }
    if (this.extraCost <= 0) {
      Notiflix.Notify.warning('Ingresa un costo válido');
      return;
    }

    this.cotizacion.push({
      descripcion: desc,
      cantidad: 1,
      precio: this.extraCost,
      total: this.extraCost
    });
    this.updateTotal();
    Notiflix.Notify.success(`Extra "${desc}" por $${this.extraCost.toFixed(2)} agregado`);

    const modalElement = document.getElementById('extraModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal?.hide();
    }
  }

  updateTotal() {
    this.cotizacion = [...this.cotizacion];
  }

  get cotizacionesFiltradas(): any[] {
    const q = this.busquedaHistorial.trim().toLowerCase();
    if (!q) return this.historialCotizaciones;
    return this.historialCotizaciones.filter(c =>
      c.quotationNumber.toLowerCase().includes(q)
    );
  }

  abrirHistorial(): void {
    this.cargandoHistorial = true;
    this.busquedaHistorial = '';
    const modalElement = document.getElementById('historialModal');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
    }
    this.http.get<any[]>(`${environment.apiALTEC}/api/cotizaciones`).subscribe({
      next: (data) => {
        this.historialCotizaciones = data;
        this.cargandoHistorial = false;
      },
      error: () => {
        Notiflix.Notify.failure('Error al cargar el historial de cotizaciones');
        this.cargandoHistorial = false;
      }
    });
  }

  async cargarCotizacion(summary: any): Promise<void> {
    if (!summary?.items?.length) {
      Notiflix.Notify.warning('Esta cotización no tiene productos');
      return;
    }

    // Cerramos el modal
    const modalElement = document.getElementById('historialModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal?.hide();
    }

    Notiflix.Loading.standard('Cargando cotización...');
    this.cotizacion = [];

    for (const item of summary.items) {
      // Buscar el producto actual en allProducts para obtener precio vigente
      const product = this.allProducts.find((p: any) => p.id === item.productId);
      if (!product) continue;

      // Usar el tipo de precio original (mayorista o pvp) con el valor ACTUAL del producto
      const esMayorista = item.priceType === 'mayorista';
      const precio = esMayorista ? product.precioMayorista : product.pvp;
      const total = item.quantity * precio;

      const nuevoItem: any = {
        ...product,
        cantidad: item.quantity,
        precio: precio,
        priceType: item.priceType || 'pvp',
        total: total,
        fotoBase64: null
      };

      // Cargar imagen en base64
      if (product.foto) {
        try {
          nuevoItem.fotoBase64 = await this.getBase64ImageFromURL(product.foto);
        } catch {
          nuevoItem.fotoBase64 = null;
        }
      }

      this.cotizacion.push(nuevoItem);
    }

    this.cotizacionCargadaNumero = summary.quotationNumber;
    Notiflix.Loading.remove();
    Notiflix.Notify.success(`Cotización N° ${summary.quotationNumber} cargada con precios actuales`);
  }

  async guardarCambiosCotizacion(): Promise<void> {
    if (!this.cotizacionCargadaNumero || !this.cotizacion.length) return;

    const quotationDetails = this.cotizacion.map(product => ({
      productId: product.id,
      quantity: product.cantidad,
      unitPrice: product.precio,
      priceType: product.priceType || 'pvp'
    }));

    Notiflix.Loading.standard('Guardando cambios...');
    try {
      await new Promise((resolve, reject) => {
        this.http.put(
          `${environment.apiALTEC}/api/cotizaciones/${this.cotizacionCargadaNumero}`,
          { quotationDetails }
        ).subscribe({ next: resolve, error: reject });
      });
      Notiflix.Loading.remove();
      Notiflix.Notify.success(`Cotización N° ${this.cotizacionCargadaNumero} actualizada correctamente`);
    } catch {
      Notiflix.Loading.remove();
      Notiflix.Notify.failure('Error al guardar los cambios');
    }
  }

  async descargarExcelConImagenes() {
    this.isDownloading = true;
    this.downloadMessage = 'Guardando cotización...';

    // Guardar o actualizar en BD
    const quotationDetails = this.cotizacion.map(product => ({
      productId: product.id,
      quantity: product.cantidad,
      unitPrice: product.precio,
      priceType: product.priceType || 'pvp'
    }));

    let quotationNumber: string;
    try {
      if (this.cotizacionCargadaNumero) {
        // Actualizar la cotización existente
        await new Promise((resolve, reject) => {
          this.http.put(
            `${environment.apiALTEC}/api/cotizaciones/${this.cotizacionCargadaNumero}`,
            { quotationDetails }
          ).subscribe({ next: resolve, error: reject });
        });
        quotationNumber = this.cotizacionCargadaNumero;
      } else {
        // Crear nueva cotización
        const response: any = await new Promise((resolve, reject) => {
          this.http.post(`${environment.apiALTEC}/api/cotizaciones`, { quotationDetails })
            .subscribe({ next: resolve, error: reject });
        });
        quotationNumber = response[0]?.quotationNumber;
        if (!quotationNumber) throw new Error('Número de cotización no recibido');
        this.cotizacionCargadaNumero = quotationNumber;
      }
    } catch {
      Notiflix.Notify.failure('Error al guardar la cotización en la base de datos');
      this.isDownloading = false;
      return;
    }

    this.downloadMessage = 'Generando Excel...';
    await new Promise(resolve => setTimeout(resolve, 300));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cotización ALTEC');

    // Estilos del header
    worksheet.mergeCells('A1:E1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'COTIZACIÓN - ALTEC MECATRÓNICA';
    titleCell.font = {size: 16, bold: true, color: {argb: 'FFFFFFFF'}};
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: 'FF0C1E3A'}
    };
    titleCell.alignment = {vertical: 'middle', horizontal: 'center'};
    worksheet.getRow(1).height = 30;

    // Cabeceras
    const headerRow = worksheet.addRow(['Producto', 'Imagen', 'Cantidad', 'Precio Unit.', 'Total']);
    headerRow.font = {bold: true, color: {argb: 'FFFFFFFF'}};
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: 'FF1a3a5c'}
    };
    headerRow.alignment = {vertical: 'middle', horizontal: 'center'};
    headerRow.height = 25;

    for (const item of this.cotizacion) {
      const row = worksheet.addRow([
        item.descripcion,
        '',
        item.cantidad,
        item.precio || 0,
        item.total
      ]);

      row.alignment = {vertical: 'middle', horizontal: 'left'};
      row.height = 60;

      if (item.foto) {
        try {
          const response = await fetch(item.foto);
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();

          const imageId = workbook.addImage({
            buffer: buffer,
            extension: 'jpeg'
          });

          worksheet.addImage(imageId, {
            tl: {col: 1, row: row.number - 1},
            ext: {width: 70, height: 50}
          });
        } catch (err) {
          console.warn('No se pudo cargar la imagen:', err);
        }
      }
    }

    // Fila de total
    const totalRow = worksheet.addRow(['', '', '', 'TOTAL:', this.totalCotizacion]);
    totalRow.font = {bold: true, size: 12};
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: 'FF10B981'}
    };
    totalRow.getCell(5).font = {bold: true, size: 14, color: {argb: 'FFFFFFFF'}};

    // Ajustar ancho de columnas
    worksheet.columns = [
      {width: 50},
      {width: 15},
      {width: 12},
      {width: 15},
      {width: 15}
    ];

    // Formatear como moneda
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber > 2) {
        row.getCell(4).numFmt = '$#,##0.00';
        row.getCell(5).numFmt = '$#,##0.00';
      }
    });

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `ALTEC-Cotizacion-${quotationNumber}.xlsx`);
      this.downloadMessage = '¡Excel descargado exitosamente!';
      await new Promise(resolve => setTimeout(resolve, 1000));
      Notiflix.Notify.success('Excel descargado correctamente');
    } catch (error) {
      console.error('Error al generar Excel:', error);
      Notiflix.Notify.failure('Error al generar el Excel');
    } finally {
      this.isDownloading = false;
    }
  }

}
