import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder } from '@angular/forms';
import { ProductService } from '../../services/warehouse.service';
import { SalesService } from 'src/app/services/sales.service';
import { SaleDto } from 'src/app/models/sale.dto';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import Notiflix from "notiflix";
declare var bootstrap: any;
import jsPDF from "jspdf";
import { forkJoin } from 'rxjs';
import { ProductEditModalComponent } from '../product-edit-modal/product-edit-modal.component';

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.component.html',
  styleUrls: ['./inventario.component.scss']
})
export class InventarioComponent implements OnInit, OnDestroy {
  @ViewChild('editModal') editModal!: ProductEditModalComponent;
  public formGroup!: UntypedFormGroup;
  allProducts: any[] = [];
  products: any[] = [];
  totalCount: number = 0;
  currentPage: number = 1;
  totalPages: number = 0;
  private pageSize: number = 5;

  // ↕️ Orden por columna (PVP o Stock); null = orden normal
  sortField: 'pvp' | 'stock' | '_margen' | '_margenPct' | null = null;
  sortDir: 'asc' | 'desc' = 'desc';
  selectedProduct: any;
  isFirstLoad: boolean = true;
  isLoading: boolean = true;
  tipoInventario: string = 'estudiante';
  selectedCategory: string = "";
  onlyImport: boolean = false;
  onlyLowStock: boolean = false;
  onlyNoImage: boolean = false;
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
  constructor(
    private productService: ProductService,
    private fb: UntypedFormBuilder,
    private salesService: SalesService // Inyectar el servicio de ventas
  ) { }

  ngOnInit(): void {
    this.formGroup = this.fb.group({
      searchControl: [''],
      importCheck: [false],
      lowStockCheck: [false],
      noImageCheck: [false]
    });
    this.getAllProducts();
    this.formGroup.get('searchControl')!.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.applyFilter();
      });

    // Inicializar neuronas animadas
    setTimeout(() => this.initNeurons(), 100);
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private animationId?: number;

  private initNeurons(): void {
    const canvas = document.getElementById('neuronCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const isMobile = window.innerWidth < 768;
    const neuronsCount = isMobile ? 15 : 45; // Reducido 3 veces en móvil
    const neurons: any[] = [];

    class Neuron {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.radius = Math.random() * 2 + 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 80, 251, 0.8)';
        ctx.fill();
      }
    }

    for (let i = 0; i < neuronsCount; i++) {
      neurons.push(new Neuron());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      neurons.forEach((neuron: any) => {
        neuron.update();
        neuron.draw();
      });

      for (let i = 0; i < neurons.length; i++) {
        for (let j = i + 1; j < neurons.length; j++) {
          const dx = neurons[i].x - neurons[j].x;
          const dy = neurons[i].y - neurons[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            ctx.beginPath();
            ctx.moveTo(neurons[i].x, neurons[i].y);
            ctx.lineTo(neurons[j].x, neurons[j].y);
            ctx.strokeStyle = `rgba(139, 80, 251, ${0.2 * (1 - distance / 150)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      this.animationId = requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }
  filtrarCategoria(categoria: string, event?: Event) {
    if (event) event.preventDefault();

    this.selectedCategory = categoria;
    this.currentPage = 1; // reinicia paginación al aplicar filtro
    this.applyFilter();
  }
  toggleNoImage() {
    this.onlyNoImage = this.formGroup.get('noImageCheck')?.value;
    this.currentPage = 1;
    this.applyFilter();
  }

  toggleLowStock() {
    this.onlyLowStock = this.formGroup.get('lowStockCheck')?.value;
    this.currentPage = 1;
    this.applyFilter();
  }
  toggleImport() {
    this.onlyImport = this.formGroup.get('importCheck')?.value;
    this.currentPage = 1;
    this.applyFilter();
  }



  getAllProducts(): void {
    if (this.isFirstLoad) {
      Notiflix.Loading.standard('Cargando productos...');
      this.isLoading = true;
    }

    this.productService.getProducts(1, 1000, '', 'descripcion', 'asc').subscribe({
      next: (data: any) => {
        this.allProducts = (data.items || []).map((p: any) => this.enrichProduct(p));
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

  /** 1er click: de mayor a menor · 2do: de menor a mayor · 3ro: sin orden. */
  toggleSort(field: 'pvp' | 'stock' | '_margen' | '_margenPct'): void {
    if (this.sortField !== field) {
      this.sortField = field;
      this.sortDir = 'desc';
    } else if (this.sortDir === 'desc') {
      this.sortDir = 'asc';
    } else {
      this.sortField = null;
    }
    this.currentPage = 1;
    this.applyFilter();
  }

  sortIcon(field: 'pvp' | 'stock' | '_margen' | '_margenPct'): string {
    if (this.sortField !== field) return 'bi-arrow-down-up';
    return this.sortDir === 'desc' ? 'bi-sort-down' : 'bi-sort-up';
  }

  applyFilter(): void {
    const raw = this.formGroup.get('searchControl')!.value || '';
    const tokens = this.tokenize(raw);

    let filtered = this.allProducts;

    // 🔹 Filtro por categoría
    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.categoria === this.selectedCategory);
    }

    // 🔹 Filtro por importación
    if (this.onlyImport) {
      filtered = filtered.filter(p => p.isImport === true || p.isImport === 1);
    }

    // 🔹 Filtro por stock bajo (< 5)
    if (this.onlyLowStock) {
      filtered = filtered.filter(p => p.stock < 5);
    }

    // 🔹 Sin imagen
    if (this.onlyNoImage) {
      filtered = filtered.filter(p => p.foto === 'NOT-IMAGE');
    }

    // 🔹 Filtro por texto
    if (tokens.length) {
      filtered = filtered
        .map(p => {
          const normDesc = p._normDesc as string;
          const normCode = p._normCode as string;

          const matchesAll = tokens.every(t =>
            this.textContainsToken(normDesc, t) || this.textContainsToken(normCode, t)
          );

          const score = matchesAll ? this.scoreMatch(normDesc, normCode, tokens) : -1;
          return { p, score };
        })
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.p);
    }

    // 🔹 Orden por PVP o Stock
    if (this.sortField) {
      const field = this.sortField;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        // Productos sin margen calculable (sin costo) siempre al final
        if (a[field] == null || b[field] == null) return (a[field] == null ? 1 : 0) - (b[field] == null ? 1 : 0);
        return ((Number(a[field]) || 0) - (Number(b[field]) || 0)) * dir;
      });
    }

    // 🔹 Actualiza contador y paginación
    this.totalCount = filtered.length;
    this.totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.products = filtered.slice(startIndex, startIndex + this.pageSize);
  }



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

  /** Agrega los campos calculados que usan la búsqueda y las columnas de margen. */
  private enrichProduct(p: any): any {
    return {
      ...p,
      // Margen = PVP − precio de importación (costo); sin costo registrado no se calcula
      _margen: Number(p.precioImportacion) > 0 ? Number(p.pvp) - Number(p.precioImportacion) : null,
      _margenPct: Number(p.precioImportacion) > 0
        ? (Number(p.pvp) - Number(p.precioImportacion)) / Number(p.precioImportacion) * 100
        : null,
      _normDesc: this.normalizeText(`${p.descripcion ?? ''}`),
      _normCode: this.normalizeText(`${p.codigo ?? ''}`)
    };
  }

  /** ➕ Abre la ventana vacía para cargar un producto nuevo. */
  openNewProduct(): void {
    this.editModal.openNew();
  }

  /** ✏️ Abre la ventana de edición (desde el botón de la fila). */
  openEditModal(product: any, event?: Event): void {
    event?.stopPropagation();
    this.editModal.open(product);
  }

  /** ✏️ Desde la ventana de detalle: la cierra y abre la de edición. */
  editFromDetails(): void {
    const product = this.selectedProduct;
    const detailEl = document.getElementById('productModal');
    const detail = detailEl ? bootstrap.Modal.getInstance(detailEl) : null;
    if (!product) return;
    if (!detail || !detailEl) {
      this.editModal.open(product);
      return;
    }
    detailEl.addEventListener('hidden.bs.modal', () => this.editModal.open(product), { once: true });
    detail.hide();
  }

  /** Producto guardado: se actualiza en la lista sin recargar. */
  onProductSaved(updated: any): void {
    const idx = this.allProducts.findIndex(p => p.id === updated.id);
    if (idx !== -1) {
      this.allProducts[idx] = this.enrichProduct(updated);
    }
    if (this.selectedProduct?.id === updated.id) {
      this.selectedProduct = this.allProducts[idx] ?? updated;
    }
    this.applyFilter();
  }

  /** Producto eliminado: se quita de la lista sin recargar. */
  onProductDeleted(id: string): void {
    this.allProducts = this.allProducts.filter(p => p.id !== id);
    if (this.currentPage > 1 && (this.currentPage - 1) * this.pageSize >= this.allProducts.length) {
      this.currentPage--;
    }
    this.applyFilter();
  }

  openProductModal(product: any): void {
    this.selectedProduct = product;
    const modalElement = document.getElementById('productModal');
    if (modalElement) {
      bootstrap.Modal.getOrCreateInstance(modalElement).show();
    }
  }

  private normalizeText(text: string): string {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    const norm = this.normalizeText(text);
    return norm.match(/[a-z0-9]+/gi)?.map(t => this.normalizeText(t)) ?? [];
  }

  private stem(token: string): string {
    return token.replace(/(es|s)$/i, '');
  }

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private textContainsToken(text: string, token: string): boolean {
    if (!text || !token) return false;
    const t = this.escapeRegExp(token);
    const stemmed = this.escapeRegExp(this.stem(token));

    return (
      text.includes(token) ||
      (stemmed && text.includes(stemmed)) ||
      new RegExp(`\\b${t}`, 'i').test(text) ||
      new RegExp(`${t}\\b`, 'i').test(text)
    );
  }
  private scoreMatch(normDesc: string, normCode: string, tokens: string[]): number {
    let score = 0;

    for (const t of tokens) {
      const inCode = this.textContainsToken(normCode, t);
      const inDesc = this.textContainsToken(normDesc, t);

      if (inCode) score += 10;
      if (inDesc) score += 4;

      const tEsc = this.escapeRegExp(t);
      if (new RegExp(`\\b${tEsc}\\b`).test(normDesc)) score += 2;
      if (new RegExp(`\\b${tEsc}\\b`).test(normCode)) score += 4;
      if (normDesc.startsWith(t)) score += 2;
      if (normCode.startsWith(t)) score += 3;
    }
    const allInDesc = tokens.every(t => this.textContainsToken(normDesc, t));
    const allInCode = tokens.every(t => this.textContainsToken(normCode, t));
    if (allInDesc) score += 5;
    if (allInCode) score += 8;

    return score;
  }

  onSubmit() { }
  async descargarPDF() {
    if (!this.allProducts || this.allProducts.length === 0) {
      console.warn("No hay productos en allProducts");
      return;
    }

    Notiflix.Loading.standard("Generando catálogo...");

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // 🔹 Cabecera
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    const fechaHoraFormateada = new Intl.DateTimeFormat("es-EC", options).format(now);
    const [fecha, hora] = fechaHoraFormateada.split(",");

    doc.addImage("assets/images/Logo-completo.jpeg", "JPEG", 10, 10, 40, 20);
    doc.setFontSize(16);
    doc.text(
      this.tipoInventario === "importador"
        ? "CATÁLOGO MAYORISTA"
        : "CATÁLOGO ESTUDIANTES",
      pageWidth / 2,
      20,
      { align: "center" }
    );
    doc.setFontSize(10);
    doc.text(`Fecha: ${fecha.trim()} | Hora: ${hora.trim()} (hora de Quito)`, pageWidth / 2, 27, { align: "center" });
    doc.text("Ubicación: Quito, Villaflora, Rodrigo de Chávez. | WhatsApp: (099) 515-9078", pageWidth / 2, 32, { align: "center" });

    y = 40;

    // 🔹 Iteramos categorías
    for (const categoria of this.categories) {
      const productosCat = this.allProducts.filter(
        (p) =>
          p.categoria === categoria &&
          (this.tipoInventario !== "importador" || p.isImport === true || p.isImport === 1)
      );
      if (productosCat.length === 0) continue;

      // Título categoría
      doc.setFontSize(14);
      doc.setTextColor(8, 39, 79);
      doc.text(categoria, 10, y);
      y += 8;

      // Encabezado tabla
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(8, 39, 79);
      doc.rect(10, y, pageWidth - 20, 8, "F");
      doc.text("Código", 12, y + 6);
      doc.text("Descripción", 45, y + 6);
      doc.text(
        this.tipoInventario === "importador" ? "Precio Mayorista" : "PVP",
        140,
        y + 6
      );
      doc.text("Imagen", 170, y + 6);
      y += 12;

      // Filas
      doc.setTextColor(0, 0, 0);
      for (const prod of productosCat) {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }

        // Código
        doc.text(prod.codigo || "", 12, y);

        // 🔹 Descripción multilínea
        const descripcion = prod.descripcion || "";
        const descLines = doc.splitTextToSize(descripcion, 90);
        const lineHeight = 6;
        const descHeight = descLines.length * lineHeight;
        doc.text(descLines, 45, y);

        // 🔹 Calculamos Y centrada para precio e imagen
        const centroFila = y + descHeight / 2;

        const precio =
          this.tipoInventario === "importador"
            ? prod.precioMayorista
            : prod.pvp;
        doc.text(
          new Intl.NumberFormat("es-EC", {
            style: "currency",
            currency: "USD",
          }).format(precio || 0),
          this.tipoInventario === "importador" ? 130 : 140,
          centroFila
        );

        if (prod.foto && prod.foto !== "NOT-IMAGE") {
          try {
            const imgData = await this.loadImageAsBase64(prod.foto);
            doc.addImage(imgData, "JPEG", 170, centroFila - 7, 20, 15);
          } catch (e) {
            console.warn("No se pudo cargar imagen:", prod.foto);
          }
        }

        // 🔹 Avanzamos según la descripción más alta
        y += Math.max(descHeight, 20);
      }

      // Salto entre categorías
      y += 10;
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
    }

    doc.save(
      `${this.tipoInventario === "importador" ? "catalogo-mayorista" : "catalogo-estudiantes"}-${new Date().toISOString().slice(0, 10)
      }.pdf`
    );

    Notiflix.Loading.remove();
  }


  // 🔹 Convierte URL a Base64
  private loadImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("No se pudo crear contexto");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg"));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // Ejemplo de método para guardar una venta
  guardarVentaEjemplo() {
    const venta: SaleDto = {
      invoiceNumber: 'INV-001',
      employeeID: null,
      productID: '3',
      saleDate: new Date().toISOString(),
      profit: 0,
      quantity: 1,
      unitPrice: 100,
      taxAmount: 12,
      totalAmount: 112,
      paymentMethod: 'Efectivo',
      status: 'Completada'
    };
    this.salesService.createSale(venta).subscribe({
      next: (saleId) => {
        Notiflix.Notify.success('Venta guardada con ID: ' + saleId);
      },
      error: (err) => {
        Notiflix.Notify.failure('Error al guardar venta');
        console.error('Error al guardar venta', err);
      }
    });
  }

  /**
   * Guarda todas las ventas de los productos seleccionados bajo la misma factura (invoiceNumber).
   * Llama al servicio tantas veces como productos haya, pero con el mismo invoiceNumber.
   * Úsalo en 'guardar en caja' o 'finalizar'.
   * @param cartProducts Array de productos a vender
   * @param employeeID ID del empleado
   * @param paymentMethod Método de pago
   */
  saveSale(cartProducts: any[], employeeID: string | null, paymentMethod: string) {
    if (!cartProducts || cartProducts.length === 0) {
      Notiflix.Notify.failure('No hay productos seleccionados para vender.');
      return;
    }
    const invoiceNumber = this.generateInvoiceNumber();
    const saleObservables = cartProducts.map(product => {
      const venta: SaleDto = {
        invoiceNumber: invoiceNumber,
        employeeID: employeeID,
        productID: String(product.id || product.productID || product.codigo || ''),
        saleDate: new Date().toISOString(),
        profit: 0, // Ajustar a la ganancia real calcular el profit
        quantity: product.quantity || 1,
        unitPrice: product.unitPrice || product.pvp || 0,
        taxAmount: product.taxAmount || 0,
        totalAmount: (product.unitPrice || product.pvp || 0) * (product.quantity || 1) + (product.taxAmount || 0),
        paymentMethod: paymentMethod,
        status: 'Completada'
      };
      return this.salesService.createSale(venta);
    });
    forkJoin(saleObservables).subscribe({
      next: (saleIds) => {
        Notiflix.Notify.success('Venta guardada correctamente. Factura: ' + invoiceNumber);
      },
      error: (err) => {
        Notiflix.Notify.failure('Error al guardar la venta');
        console.error('Error al guardar venta', err);
      }
    });
  }

  // Generador simple de número de factura (puedes mejorar esto según tu lógica de negocio)
  private generateInvoiceNumber(): string {
    return 'INV-' + Date.now();
  }
}
