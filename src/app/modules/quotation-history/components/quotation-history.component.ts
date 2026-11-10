import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import Notiflix from 'notiflix';
import {
  ImportedQuotationDetail,
  ImportedQuotationItem,
  ImportedQuotationSummary,
  QuotationHistoryService
} from '../services/quotation-history.service';
import { UserSessionService } from '../../authentication/services/user-session.service';
import jsPDF from 'jspdf';
import { SmartSearchCache } from '../../../shared/utils/smart-search';

/** Fila de la proyección de ganancias: margen propio o, si es null, el margen general. */
interface ProjectionRow {
  fila: number;
  producto: string;
  cantidad: number;
  costo: number;           // costo unitario en Ecuador
  margen: number | null;   // % sobre el costo; null = usa el margen general
}

/** Datos que viajan dentro del PDF para poder volver a cargar la simulación. */
interface ProjectionBackup extends ProjectionState {
  v: 1;
  importId: string;
  nombre: string;
  generado: string;
}

/** Miniatura de una foto lista para el PDF. */
interface ProjectionThumb {
  data: string;  // data URL JPEG
  w: number;
  h: number;
}

/** Marca con la que se guardan los datos dentro del PDF (propiedad "Palabras clave"). */
const PROJECTION_MARK = 'ALTEC-PROY:';

/** Lo que se recuerda de la simulación de cada importación (solo en este navegador). */
interface ProjectionState {
  global: number;
  redondeo: number;
  margenes: Record<number, number>;
}

@Component({
  selector: 'app-quotation-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './quotation-history.component.html',
  styleUrls: ['./quotation-history.component.scss']
})
export class QuotationHistoryComponent implements OnInit, OnDestroy {
  readonly MAX_FILE_MB = 50;

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  uploadForm!: FormGroup;
  selectedFile: File | null = null;
  isDragging = false;
  isUploading = false;

  quotations: ImportedQuotationSummary[] = [];
  isLoading = false;
  downloadingId: string | null = null;

  // Detalle
  selectedDetail: ImportedQuotationDetail | null = null;
  loadingDetailId: string | null = null;
  itemSearch = '';
  imageRows = new Set<number>();   // filas del Excel con foto (si el servidor ya respondió)
  imageRowsKnown = false;          // true cuando se sabe qué filas tienen foto
  brokenPhotos = new Set<number>(); // filas cuya foto no cargó
  zoomImage: string | null = null; // foto ampliada

  // Filtros
  searchTerm = '';

  // Búsqueda inteligente en los productos del Excel (detalle y proyección)
  private itemSearchEngine = new SmartSearchCache<ImportedQuotationItem>(i => [i.producto]);
  private projSearchEngine = new SmartSearchCache<ProjectionRow>(r => [r.producto]);

  // Costos extras de importación
  costsTarget: ImportedQuotationSummary | null = null;
  costsAmount: number | null = null;
  costsNote = '';
  isSavingCosts = false;

  // Proyección de ganancias (simulación, no se guarda en el servidor)
  showProjection = false;
  projRows: ProjectionRow[] = [];
  projGlobalMargin = 50;
  projRounding = 0;           // 0 = sin redondeo; 0.05 / 0.10 / 0.50 / 1 = redondea el PVP hacia arriba
  projSearch = '';
  projSort: 'fila' | 'ganancia' | 'margen' = 'fila';
  readonly projMarginPresets = [30, 50, 80, 100, 150];
  readonly projRoundingOptions = [
    { value: 0, label: 'Sin redondeo' },
    { value: 0.05, label: 'A $0.05' },
    { value: 0.1, label: 'A $0.10' },
    { value: 0.5, label: 'A $0.50' },
    { value: 1, label: 'A $1.00' }
  ];

  private userName = 'ADMIN';
  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private quotationHistoryService: QuotationHistoryService,
    private userSessionService: UserSessionService
  ) {}

  ngOnInit(): void {
    this.uploadForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(200)]],
      fecha: [this.today(), Validators.required]
    });

    this.userSessionService.getUserInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe(info => {
        if (info) this.userName = info.name ?? info.username ?? 'ADMIN';
      });

    this.search$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadQuotations());

    this.loadQuotations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Listado ──────────────────────────────────────────────────────────────

  loadQuotations(): void {
    this.isLoading = true;
    this.quotationHistoryService.getAll({
      buscar: this.searchTerm || undefined
    }).subscribe({
      next: (data) => {
        this.quotations = data ?? [];
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        Notiflix.Notify.failure('No se pudo cargar el historial de importaciones.');
      }
    });
  }

  onSearchChange(value: string): void {
    this.search$.next(value);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.loadQuotations();
  }

  get totalMonto(): number {
    return this.quotations.reduce((sum, q) => sum + (q.totalMonto || 0), 0);
  }

  get totalExtras(): number {
    return this.quotations.reduce((sum, q) => sum + (q.costosExtras || 0), 0);
  }

  get totalProductos(): number {
    return this.quotations.reduce((sum, q) => sum + (q.totalItems || 0), 0);
  }

  // ── Archivo ──────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!this.isDragging) this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    // Ignorar el dragleave que se dispara al pasar sobre elementos hijos
    const zone = event.currentTarget as HTMLElement;
    if (zone.contains(event.relatedTarget as Node)) return;
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    this.setFile(event.dataTransfer?.files?.[0] ?? null);
  }

  removeFile(): void {
    this.selectedFile = null;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  private setFile(file: File | null): void {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      Notiflix.Notify.failure('Solo se permiten archivos Excel .xlsx');
      return;
    }
    if (file.size > this.MAX_FILE_MB * 1024 * 1024) {
      Notiflix.Notify.failure(`El archivo supera el máximo de ${this.MAX_FILE_MB} MB`);
      return;
    }

    this.selectedFile = file;
    // Sugerir el nombre del archivo como nombre de la importación si está vacío
    const nombreCtrl = this.uploadForm.get('nombre');
    if (!nombreCtrl?.value) {
      nombreCtrl?.setValue(file.name.replace(/\.xlsx$/i, ''));
    }
  }

  // ── Subida ───────────────────────────────────────────────────────────────

  upload(): void {
    if (this.uploadForm.invalid) {
      this.uploadForm.markAllAsTouched();
      Notiflix.Notify.warning('Completa el nombre y la fecha.');
      return;
    }
    if (!this.selectedFile) {
      Notiflix.Notify.warning('Selecciona el archivo Excel.');
      return;
    }

    const { nombre, fecha } = this.uploadForm.value;
    this.isUploading = true;
    // Los Excel con fotos pesan varios MB: avisar que puede tardar
    const sizeMb = this.selectedFile.size / (1024 * 1024);
    Notiflix.Loading.standard(sizeMb > 5
      ? `Guardando importación (${sizeMb.toFixed(1)} MB)... puede tardar hasta un minuto`
      : 'Guardando importación...');

    this.quotationHistoryService.upload(nombre.trim(), fecha, this.selectedFile, this.userName).subscribe({
      next: (res) => {
        this.isUploading = false;
        Notiflix.Loading.remove();
        Notiflix.Notify.success(`Importación "${res.nombre}" guardada: ${res.totalItems} productos.`);
        this.uploadForm.reset({ nombre: '', fecha: this.today() });
        this.removeFile();
        this.loadQuotations();
      },
      error: (err) => {
        this.isUploading = false;
        Notiflix.Loading.remove();
        Notiflix.Notify.failure(err?.error?.error ?? 'No se pudo guardar la importación.');
      }
    });
  }

  // ── Detalle ──────────────────────────────────────────────────────────────

  openDetail(q: ImportedQuotationSummary): void {
    this.loadingDetailId = q.id;
    this.itemSearch = '';
    this.imageRows = new Set();
    this.imageRowsKnown = false;
    this.brokenPhotos = new Set();
    // Saber qué filas tienen foto evita pedir las que no existen; si falla, igual se intenta cada foto
    this.quotationHistoryService.getImageRows(q.id).subscribe({
      next: (rows) => {
        if (this.loadingDetailId === q.id || this.selectedDetail?.id === q.id) {
          this.imageRows = new Set((rows ?? []).map(Number));
          this.imageRowsKnown = true;
        }
      },
      error: (err) => console.warn('No se pudo saber qué filas tienen foto', err)
    });
    this.quotationHistoryService.getDetail(q.id).subscribe({
      next: (detail) => {
        this.selectedDetail = detail;
        this.loadingDetailId = null;
      },
      error: () => {
        this.loadingDetailId = null;
        Notiflix.Notify.failure('No se pudo cargar el detalle de la importación.');
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.zoomImage) this.zoomImage = null;
    else if (this.costsTarget) this.closeCosts();
    else if (this.showProjection) this.closeProjection();
    else if (this.selectedDetail) this.closeDetail();
  }

  closeDetail(): void {
    if (this.showProjection) this.closeProjection();
    this.selectedDetail = null;
    this.imageRows = new Set();
    this.imageRowsKnown = false;
    this.brokenPhotos = new Set();
    this.itemSearch = '';
  }

  get filteredItems(): ImportedQuotationItem[] {
    const items = this.selectedDetail?.items ?? [];
    if (!this.itemSearch.trim()) return items;
    return this.itemSearchEngine.filter(items, items, this.itemSearch).items;
  }

  get filteredItemsTotal(): number {
    return this.filteredItems.reduce((sum, i) => sum + (i.total || 0), 0);
  }

  get filteredItemsQty(): number {
    return this.filteredItems.reduce((sum, i) => sum + (i.cantidad || 0), 0);
  }

  get filteredItemsTotalEcuador(): number {
    return this.filteredItems.reduce((sum, i) => sum + (i.costoEcuadorTotal || 0), 0);
  }

  // ── Fotos del Excel ─────────────────────────────────────────────────────

  photoUrl(fila: number): string | null {
    const id = this.selectedDetail?.id;
    if (!id || this.brokenPhotos.has(fila)) return null;
    if (this.imageRowsKnown && !this.imageRows.has(fila)) return null;
    return this.quotationHistoryService.imageUrl(id, fila);
  }

  /** La foto no existe o no cargó: se muestra el ícono vacío. */
  onPhotoError(fila: number): void {
    this.brokenPhotos.add(fila);
  }

  openZoom(fila: number, event?: Event): void {
    event?.stopPropagation();
    this.zoomImage = this.photoUrl(fila);
  }

  // ── Proyección de ganancias ──────────────────────────────────────────────

  openProjection(): void {
    const d = this.selectedDetail;
    if (!d) return;
    const saved = this.readProjection(d.id);
    this.projGlobalMargin = saved?.global ?? 50;
    this.projRounding = saved?.redondeo ?? 0;
    this.projSearch = '';
    this.projSort = 'fila';
    this.projRows = d.items.map(i => ({
      fila: i.fila,
      producto: i.producto,
      cantidad: i.cantidad || 0,
      // Costo en Ecuador con toda la precisión (total / cantidad)
      costo: i.cantidad ? i.costoEcuadorTotal / i.cantidad : i.costoEcuadorUnitario,
      margen: saved?.margenes?.[i.fila] ?? null
    }));
    this.showProjection = true;
  }

  closeProjection(): void {
    this.saveProjection();
    this.showProjection = false;
  }

  /** Margen que se aplica a la fila (el propio o el general). */
  rowMargin(r: ProjectionRow): number {
    return r.margen ?? (this.projGlobalMargin || 0);
  }

  rowPvp(r: ProjectionRow): number {
    const pvp = r.costo * (1 + this.rowMargin(r) / 100);
    if (!this.projRounding) return pvp;
    // Redondeo hacia arriba al múltiplo elegido (se resta un épsilon por errores de coma flotante)
    return Math.ceil(pvp / this.projRounding - 1e-9) * this.projRounding;
  }

  /** PVP para el campo editable (2 decimales). */
  rowPvpInput(r: ProjectionRow): number {
    return Math.round(this.rowPvp(r) * 100) / 100;
  }

  rowProfitUnit(r: ProjectionRow): number {
    return this.rowPvp(r) - r.costo;
  }

  rowProfitTotal(r: ProjectionRow): number {
    return this.rowProfitUnit(r) * r.cantidad;
  }

  /** Margen real después del redondeo (lo que de verdad se gana sobre el costo). */
  rowRealMargin(r: ProjectionRow): number {
    return r.costo > 0 ? (this.rowProfitUnit(r) / r.costo) * 100 : 0;
  }

  setRowMargin(r: ProjectionRow, value: any): void {
    const n = Number(value);
    r.margen = value === '' || value === null || !isFinite(n) ? null : n;
    this.saveProjection();
  }

  /** Editar el PVP de una fila recalcula su margen. */
  setRowPvp(r: ProjectionRow, value: any): void {
    const pvp = Number(value);
    if (!isFinite(pvp) || pvp <= 0 || r.costo <= 0) return;
    r.margen = Math.round(((pvp / r.costo) - 1) * 100 * 100) / 100;
    this.saveProjection();
  }

  resetRowMargin(r: ProjectionRow): void {
    r.margen = null;
    this.saveProjection();
  }

  setGlobalMargin(value: number): void {
    this.projGlobalMargin = value;
    this.saveProjection();
  }

  /** Aplica el margen general a todos: borra los márgenes individuales. */
  applyGlobalToAll(): void {
    this.projRows.forEach(r => r.margen = null);
    this.saveProjection();
    Notiflix.Notify.success(`Margen de ${this.projGlobalMargin}% aplicado a todos los productos`);
  }

  get filteredItemsQtyAll(): number {
    return this.projRows.reduce((s, r) => s + r.cantidad, 0);
  }

  trackByProjFila(_: number, r: ProjectionRow): number {
    return r.fila;
  }

  get projCustomCount(): number {
    return this.projRows.filter(r => r.margen !== null).length;
  }

  get projVisibleRows(): ProjectionRow[] {
    let rows = this.projSearch.trim()
      ? this.projSearchEngine.filter(this.projRows, this.projRows, this.projSearch).items
      : [...this.projRows];
    if (this.projSort === 'ganancia') rows.sort((a, b) => this.rowProfitTotal(b) - this.rowProfitTotal(a));
    else if (this.projSort === 'margen') rows.sort((a, b) => this.rowRealMargin(b) - this.rowRealMargin(a));
    return rows;
  }

  get projInversion(): number {
    return this.projRows.reduce((s, r) => s + r.costo * r.cantidad, 0);
  }

  get projVentas(): number {
    return this.projRows.reduce((s, r) => s + this.rowPvp(r) * r.cantidad, 0);
  }

  get projGanancia(): number {
    return this.projVentas - this.projInversion;
  }

  /** Ganancia sobre lo invertido (%). */
  get projRetorno(): number {
    return this.projInversion > 0 ? (this.projGanancia / this.projInversion) * 100 : 0;
  }

  /** Qué parte de cada venta es ganancia (%). */
  get projMargenVentas(): number {
    return this.projVentas > 0 ? (this.projGanancia / this.projVentas) * 100 : 0;
  }

  get projTop(): ProjectionRow[] {
    return [...this.projRows].sort((a, b) => this.rowProfitTotal(b) - this.rowProfitTotal(a)).slice(0, 5);
  }

  /** Porcentaje de la ganancia total que aporta una fila (para la barra). */
  rowShare(r: ProjectionRow): number {
    const total = this.projGanancia;
    return total > 0 ? Math.max(0, (this.rowProfitTotal(r) / total) * 100) : 0;
  }

  // ── PDF de la proyección (descargar y volver a cargar) ─────────────────

  /** Genera el PDF con el resumen, la tabla y las fotos; lleva dentro los márgenes para restaurarlos luego. */
  async exportProjectionPdf(): Promise<void> {
    const d = this.selectedDetail;
    if (!d || !this.projRows.length) return;

    Notiflix.Loading.standard('Generando PDF con fotos...');
    let thumbs = new Map<number, ProjectionThumb>();
    try {
      thumbs = await this.loadThumbs(d.id, this.projRows.map(r => r.fila));
    } catch {
      // Sin fotos: el PDF se genera igual
    }
    const conFoto = this.projRows.filter(r => !this.brokenPhotos.has(r.fila) && (!this.imageRowsKnown || this.imageRows.has(r.fila))).length;
    if (conFoto > 0 && thumbs.size === 0) {
      Notiflix.Notify.warning('No se pudieron cargar las fotos; el PDF se genera sin ellas.');
    }
    try {
      this.buildProjectionPdf(d, thumbs);
    } finally {
      Notiflix.Loading.remove();
    }
  }

  private buildProjectionPdf(d: ImportedQuotationDetail, thumbs: Map<number, ProjectionThumb>): void {

    const margenes: Record<number, number> = {};
    this.projRows.forEach(r => { if (r.margen !== null) margenes[r.fila] = r.margen; });
    const backup: ProjectionBackup = {
      v: 1, importId: d.id, nombre: d.nombre, generado: new Date().toISOString(),
      global: this.projGlobalMargin || 0, redondeo: this.projRounding, margenes
    };

    const money = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
    const doc = new jsPDF('l', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;

    doc.setDocumentProperties({
      title: `Proyección de ganancias - ${d.nombre}`,
      subject: 'Proyección de ganancias ALTEC',
      creator: 'ALTEC',
      keywords: PROJECTION_MARK + this.toBase64(JSON.stringify(backup))
    });

    // Encabezado
    doc.setFillColor(26, 35, 50);
    doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Proyección de ganancias', M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const redondeo = this.projRoundingOptions.find(o => o.value === this.projRounding)?.label ?? 'Sin redondeo';
    doc.text(`${d.nombre}  ·  ${this.dateOnly(d.fecha).toLocaleDateString('es-EC')}  ·  Margen general ${pct(this.projGlobalMargin)}  ·  Redondeo: ${redondeo}`, M, 19);
    doc.text(`Generado ${new Date().toLocaleString('es-EC')}`, W - M, 19, { align: 'right' });

    // Tarjetas de resumen
    const kpis: [string, string, string][] = [
      ['Inversión (costo en Ecuador)', money(this.projInversion), d.costosExtras ? `Incluye ${money(d.costosExtras)} de costos extras` : 'Sin costos extras'],
      ['Si vendes todo', money(this.projVentas), `${this.filteredItemsQtyAll.toLocaleString('en-US')} unidades`],
      ['Ganancia proyectada', money(this.projGanancia), `Retorno ${pct(this.projRetorno)} sobre lo invertido`],
      ['Margen sobre ventas', pct(this.projMargenVentas), `${this.projCustomCount} producto(s) con margen propio`]
    ];
    const kw = (W - M * 2 - 9) / 4;
    kpis.forEach(([label, value, hint], i) => {
      const x = M + i * (kw + 3);
      doc.setDrawColor(200, 205, 215);
      doc.setFillColor(i === 2 ? 236 : 245, i === 2 ? 253 : 247, i === 2 ? 243 : 250);
      doc.roundedRect(x, 31, kw, 22, 2, 2, 'FD');
      doc.setTextColor(110, 118, 129);
      doc.setFontSize(8);
      doc.text(label.toUpperCase(), x + 4, 37);
      doc.setTextColor(i === 2 ? 22 : 20, i === 2 ? 130 : 25, i === 2 ? 70 : 35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(value, x + 4, 45);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110, 118, 129);
      doc.text(hint, x + 4, 50);
    });

    // Tabla
    const hasPhotos = thumbs.size > 0;
    const cols = [
      { t: '#', w: 10, a: 'center' as const },
      { t: 'Foto', w: hasPhotos ? 16 : 0, a: 'center' as const },
      { t: 'Producto', w: 0, a: 'left' as const },
      { t: 'Cant.', w: 18, a: 'right' as const },
      { t: 'Costo Ecuador', w: 28, a: 'right' as const },
      { t: 'Margen', w: 20, a: 'right' as const },
      { t: 'PVP', w: 24, a: 'right' as const },
      { t: 'Ganancia unit.', w: 28, a: 'right' as const },
      { t: 'Ganancia total', w: 30, a: 'right' as const }
    ];
    const fixed = cols.reduce((s2, c) => s2 + c.w, 0);
    cols[2].w = W - M * 2 - fixed;
    const cellX = (i: number) => M + cols.slice(0, i).reduce((s2, c) => s2 + c.w, 0);
    const textAt = (txt: string, i: number, y: number) => {
      const c = cols[i];
      const x = c.a === 'right' ? cellX(i) + c.w - 2 : c.a === 'center' ? cellX(i) + c.w / 2 : cellX(i) + 2;
      doc.text(txt, x, y, { align: c.a });
    };
    const header = (y: number) => {
      doc.setFillColor(26, 35, 50);
      doc.rect(M, y, W - M * 2, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      cols.forEach((c, i) => { if (c.w > 0) textAt(c.t, i, y + 5.4); });
      doc.setFont('helvetica', 'normal');
      return y + 8;
    };

    let y = header(60);
    let n = 0;
    for (const r of this.projRows) {
      const name = doc.splitTextToSize(r.producto, cols[2].w - 4) as string[];
      const lines = Math.min(name.length, 2);
      const h = Math.max(4 + lines * 4, hasPhotos ? 14 : 0);
      if (y + h > H - 16) {
        doc.addPage();
        y = header(M);
      }
      if (n % 2 === 1) {
        doc.setFillColor(245, 247, 250);
        doc.rect(M, y, W - M * 2, h, 'F');
      }
      if (r.margen !== null) {
        doc.setFillColor(96, 165, 250);
        doc.rect(M, y, 1.2, h, 'F');
      }
      const base = y + (h - lines * 4) / 2 + 3;
      doc.setFontSize(8.5);
      doc.setTextColor(110, 118, 129);
      textAt(String(++n), 0, base);
      const thumb = thumbs.get(r.fila);
      if (thumb) {
        // Foto encajada en 12 × 12 mm sin deformar
        const box = 12;
        const k = Math.min(box / thumb.w, box / thumb.h);
        const iw = thumb.w * k, ih = thumb.h * k;
        doc.addImage(thumb.data, 'JPEG', cellX(1) + (cols[1].w - iw) / 2, y + (h - ih) / 2, iw, ih);
      }
      doc.setTextColor(20, 25, 35);
      doc.text(name.slice(0, 2), cellX(2) + 2, base);
      textAt(r.cantidad.toLocaleString('en-US'), 3, base);
      textAt(money(r.costo), 4, base);
      doc.setTextColor(r.margen !== null ? 37 : 20, r.margen !== null ? 99 : 25, r.margen !== null ? 235 : 35);
      textAt(pct(this.rowRealMargin(r)), 5, base);
      doc.setTextColor(20, 25, 35);
      textAt(money(this.rowPvp(r)), 6, base);
      const profit = this.rowProfitTotal(r);
      doc.setTextColor(profit < 0 ? 220 : 20, profit < 0 ? 38 : 25, profit < 0 ? 38 : 35);
      textAt(money(this.rowProfitUnit(r)), 7, base);
      doc.setTextColor(profit < 0 ? 220 : 22, profit < 0 ? 38 : 130, profit < 0 ? 38 : 70);
      doc.setFont('helvetica', 'bold');
      textAt(money(profit), 8, base);
      doc.setFont('helvetica', 'normal');
      y += h;
    }

    // Totales
    if (y + 9 > H - 16) { doc.addPage(); y = M; }
    doc.setFillColor(26, 35, 50);
    doc.rect(M, y, W - M * 2, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL', cellX(2) + 2, y + 5.4);
    textAt(money(this.projInversion), 4, y + 5.4);
    textAt(pct(this.projRetorno), 5, y + 5.4);
    textAt(money(this.projVentas), 6, y + 5.4);
    textAt(money(this.projGanancia), 8, y + 5.4);

    // Pie en todas las páginas
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 146, 156);
      doc.text('Simulación: PVP = costo en Ecuador x (1 + margen). Para seguir editando, carga este PDF en ALTEC: Proyección > Cargar PDF.', M, H - 7);
      doc.text(`Página ${p} de ${pages}`, W - M, H - 7, { align: 'right' });
    }

    const safe = d.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`Proyeccion-${safe || 'importacion'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    Notiflix.Notify.success('PDF de la proyección descargado');
  }

  /**
   * Descarga las fotos de las filas y las reduce a miniaturas JPEG (máx. 160 px)
   * para que el PDF no pese lo mismo que el Excel original.
   */
  private async loadThumbs(id: string, filas: number[]): Promise<Map<number, ProjectionThumb>> {
    const result = new Map<number, ProjectionThumb>();
    const pending = filas.filter(f => !this.brokenPhotos.has(f) && (!this.imageRowsKnown || this.imageRows.has(f)));
    const worker = async () => {
      while (pending.length) {
        const fila = pending.shift()!;
        try {
          // URL propia y sin caché: no reutiliza la copia guardada por las miniaturas de la tabla
          const res = await fetch(`${this.quotationHistoryService.imageUrl(id, fila)}?pdf=1`, { cache: 'no-store', mode: 'cors' });
          if (!res.ok) continue;
          const bitmap = await createImageBitmap(await res.blob());
          const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff'; // las PNG con fondo transparente quedan en blanco
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close();
          result.set(fila, { data: canvas.toDataURL('image/jpeg', 0.75), w: canvas.width, h: canvas.height });
        } catch (err) {
          // Si una foto falla, esa fila va sin foto
          console.warn(`No se pudo preparar la foto de la fila ${fila} para el PDF`, err);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return result;
  }

  /** Lee un PDF generado por ALTEC y vuelve a aplicar sus márgenes. */
  onProjectionFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    file.arrayBuffer().then(buf => {
      const text = new TextDecoder('latin1').decode(buf);
      const match = text.match(/ALTEC-PROY:([A-Za-z0-9+/=]+)/);
      let backup: ProjectionBackup | null = null;
      try {
        backup = match ? JSON.parse(this.fromBase64(match[1])) as ProjectionBackup : null;
      } catch {
        backup = null;
      }
      if (!backup || backup.v !== 1) {
        Notiflix.Notify.failure('Ese PDF no es una proyección generada por ALTEC.');
        return;
      }

      const apply = () => this.applyBackup(backup!);
      if (backup.importId !== this.selectedDetail?.id) {
        Notiflix.Confirm.show(
          'PDF de otra importación',
          `Este PDF es de "${backup.nombre}". ¿Aplicar igualmente sus márgenes (por número de fila del Excel)?`,
          'Sí, aplicar', 'Cancelar', apply
        );
      } else {
        apply();
      }
    }).catch(() => Notiflix.Notify.failure('No se pudo leer el archivo.'));
  }

  private applyBackup(b: ProjectionBackup): void {
    this.projGlobalMargin = Number(b.global) || 0;
    this.projRounding = Number(b.redondeo) || 0;
    this.projRows.forEach(r => {
      const m = b.margenes?.[r.fila];
      r.margen = m === undefined || m === null ? null : Number(m);
    });
    this.saveProjection();
    const fecha = new Date(b.generado);
    Notiflix.Notify.success(`Proyección restaurada (guardada el ${isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-EC')})`);
  }

  private toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  private fromBase64(b64: string): string {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  private projectionKey(id: string): string {
    return `altec.proyeccion.${id}`;
  }

  private readProjection(id: string): ProjectionState | null {
    try {
      const raw = localStorage.getItem(this.projectionKey(id));
      return raw ? JSON.parse(raw) as ProjectionState : null;
    } catch {
      return null;
    }
  }

  private saveProjection(): void {
    const id = this.selectedDetail?.id;
    if (!id || !this.projRows.length) return;
    const margenes: Record<number, number> = {};
    this.projRows.forEach(r => { if (r.margen !== null) margenes[r.fila] = r.margen; });
    const state: ProjectionState = { global: this.projGlobalMargin || 0, redondeo: this.projRounding, margenes };
    try { localStorage.setItem(this.projectionKey(id), JSON.stringify(state)); } catch { }
  }

  // ── Costos extras ────────────────────────────────────────────────────────

  openCosts(q: ImportedQuotationSummary): void {
    this.costsTarget = q;
    this.costsAmount = q.costosExtras ? q.costosExtras : null;
    this.costsNote = q.costosExtrasNota ?? '';
  }

  closeCosts(): void {
    if (this.isSavingCosts) return;
    this.costsTarget = null;
  }

  /** Recargo que quedaría con el monto escrito (vista previa en la ventana). */
  get costsPreviewPct(): number {
    const base = this.costsTarget?.totalMonto || 0;
    return base > 0 ? ((this.costsAmount || 0) / base) * 100 : 0;
  }

  saveCosts(): void {
    const q = this.costsTarget;
    if (!q || this.isSavingCosts) return;
    const monto = Number(this.costsAmount || 0);
    if (!isFinite(monto) || monto < 0) {
      Notiflix.Notify.failure('Ingresa un monto válido (0 o mayor).');
      return;
    }

    this.isSavingCosts = true;
    const nota = this.costsNote.trim() || null;
    this.quotationHistoryService.updateExtraCosts(q.id, monto, nota).subscribe({
      next: (detail) => {
        this.isSavingCosts = false;
        const row = this.quotations.find(x => x.id === q.id);
        if (row) {
          row.costosExtras = detail.costosExtras;
          row.costosExtrasNota = detail.costosExtrasNota;
        }
        if (this.selectedDetail?.id === q.id) this.selectedDetail = detail;
        // Si la proyección está abierta, toma los nuevos costos en Ecuador
        if (this.showProjection && this.selectedDetail?.id === q.id) {
          const costos = new Map(detail.items.map(i => [i.fila, i.cantidad ? i.costoEcuadorTotal / i.cantidad : i.costoEcuadorUnitario]));
          this.projRows.forEach(r => r.costo = costos.get(r.fila) ?? r.costo);
        }
        this.costsTarget = null;
        Notiflix.Notify.success(monto > 0 ? 'Costos extras guardados' : 'Costos extras quitados');
      },
      error: (err) => {
        this.isSavingCosts = false;
        Notiflix.Notify.failure(err?.error?.error ?? 'No se pudieron guardar los costos extras.');
      }
    });
  }

  // ── Descarga ─────────────────────────────────────────────────────────────

  download(q: ImportedQuotationSummary): void {
    this.downloadingId = q.id;
    this.quotationHistoryService.download(q.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = q.nombreArchivo || `${q.nombre}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingId = null;
      },
      error: () => {
        this.downloadingId = null;
        Notiflix.Notify.failure('No se pudo descargar el archivo.');
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  formatSize(bytes: number): string {
    if (!bytes) return '0 KB';
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** La fecha llega como 'yyyy-MM-ddT00:00:00'; se toma solo la parte de fecha para evitar desfases de zona horaria */
  dateOnly(value: string): Date {
    const [y, m, d] = (value || '').substring(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  trackByFila(_: number, i: ImportedQuotationItem): number {
    return i.fila;
  }

  private normalize(text: string): string {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  trackById(_: number, q: ImportedQuotationSummary): string {
    return q.id;
  }

  private today(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }
}
