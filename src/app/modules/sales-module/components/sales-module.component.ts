import { Component, OnInit } from '@angular/core';
import { SmartSearchCache } from '../../../shared/utils/smart-search';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProductService } from '../../warehouse/services/warehouse.service';
import { SalesService, SaleDto } from '../../../services/sales.service';
import {
  ElectronicInvoiceService,
  CreateElectronicInvoiceRequest,
  ElectronicInvoiceResult
} from '../../../services/electronic-invoice.service';
import { ThermalTicketService } from '../../../services/thermal-ticket.service';
import { forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import Notiflix from 'notiflix';

interface CartItem {
  id?: string;
  descripcion: string;
  pvp: number;              // precio unitario de ESTA venta (puede cambiarse sin tocar el PVP del producto)
  precioOriginal?: number;  // precio del sistema al agregarlo
  precioManual?: boolean;   // true si se cambió a mano
  priceType: string;
  cantidad: number;
  subtotal?: number;
}

/** Lo necesario para imprimir el recibo después de limpiar el carrito. */
interface ReceiptSnapshot {
  numero: string;
  fecha: Date;
  items: { descripcion: string; cantidad: number; precio: number; total: number }[];
  total: number;
  paymentMethod: string;
  recibido: number;
  cambio: number;
}

interface PaymentMethod {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sales-module',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './sales-module.component.html',
  styleUrls: ['./sales-module.component.scss']
})
export class SalesModuleComponent implements OnInit {
  private smartSearch = new SmartSearchCache<any>(p => [p.descripcion, p.codigo, p.categoria], p => Number(p.stock) > 0);

  formGroup!: FormGroup;

  // 🧑 Cliente
  cliente = {
    nombre: '',
    celular: '',
    rol: 'cliente'
  };

  // 📦 Productos
  allProducts: any[] = [];
  products: any[] = [];

  // ⚡ Resistencias
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
  showResistorModal = false;
  resistorModalTitle = '';
  activeResistorValues: string[] = [];
  selectedResistorValue = '';
  pendingResistorProduct: any = null;
  pendingResistorPriceType = 'pvp';

  // 🛒 Carrito
  cartItems: CartItem[] = [];

  // 💳 Métodos de pago
  paymentMethods: PaymentMethod[] = [
    { id: 'efectivo', label: 'Efectivo', icon: 'cash' },
    { id: 'transferencia', label: 'Transferencia', icon: 'bank' }
  ];
  selectedPaymentMethod: string = 'efectivo';

  // 🔢 Cálculos (Negocio Popular RIMPE: IVA 0%, el total es igual al subtotal)
  subtotal: number = 0;
  total: number = 0;

  // 🧾 Comprobante: recibo (sin datos del cliente) o factura electrónica SRI
  tipoComprobante: 'recibo' | 'factura' = 'recibo';

  // 🧾 Resultado de la factura electrónica
  showFacturaModal = false;
  facturaProcesando = false;
  facturaResultado: ElectronicInvoiceResult | null = null;
  facturaError = '';
  facturaEmailReenvio = '';
  private facturaRequest: CreateElectronicInvoiceRequest | null = null;

  // 🖨️ Ticket térmico: se imprime solo al terminar la venta (preferencia guardada en este equipo)
  private readonly PRINT_PREF_KEY = 'altec.imprimirTicket';
  imprimirTicketAuto = this.readPrintPref();

  // 📱 UI State
  showCart: boolean = true;
  cartCollapsed: boolean = false;

  private readonly MAX_RESULTS = 10;

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private salesService: SalesService,
    private invoiceService: ElectronicInvoiceService,
    private ticket: ThermalTicketService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.formGroup = this.fb.group({
      searchControl: ['', [Validators.maxLength(100)]],
      clientName: ['', [Validators.minLength(2)]],
      clientDocument: ['', [Validators.pattern(/^[A-Za-z0-9]{5,20}$/)]],
      clientPhone: ['', [Validators.pattern(/^[0-9]{7,15}$/)]],
      clientAddress: ['', [Validators.maxLength(300)]],
      clientEmail: ['', [Validators.email]]
    });

    this.getAllProducts();

    // Autocompleta los datos de un cliente ya facturado al escribir su cédula/RUC
    this.formGroup.get('clientDocument')!
      .valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(value => this.buscarClienteFactura(value));

    this.formGroup.get('searchControl')!
      .valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(value => {
        this.applyFilter(value);
      });
  }

  confirmVenta(): void {
    // 📋 Validaciones
    if (this.cartItems.length === 0) {
      Notiflix.Notify.warning('El carrito está vacío. Agrega productos antes de confirmar.');
      return;
    }

    if (this.tipoComprobante === 'factura') {
      const error = this.validarDatosFactura();
      if (error) {
        Notiflix.Notify.warning(error);
        return;
      }
    }

    // Confirmar y vender (cualquier método de pago)
    const clientName = this.formGroup.get('clientName')?.value || 'Cliente General';

    Notiflix.Confirm.show(
      'Confirmar Venta',
      `¿Completar venta a <strong>${clientName}</strong> por <strong>$${this.total.toFixed(2)}</strong>?`,
      'Sí, Vender',
      'Cancelar',
      () => {
        this.realizarVenta();
      },
      () => {
        // ❌ CANCELADO
      },
      {
        titleColor: '#ffffff',
        messageColor: '#ffffff',
        backgroundColor: '#1e1e2f',
        okButtonBackground: '#28a745',
        cancelButtonBackground: '#dc3545',
        okButtonColor: '#ffffff',
        cancelButtonColor: '#ffffff',
        borderRadius: '12px',
        width: '380px'
      }
    );
  }

  realizarVenta(): void {
    if (this.cartItems.length === 0) {
      Notiflix.Notify.warning('El carrito está vacío');
      return;
    }

    Notiflix.Loading.standard('Procesando venta...');

    const invoiceNumber = `INV-${Date.now()}`;
    const saleDate = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // UTC-5 Ecuador
    const paymentMethod = this.selectedPaymentMethod;

    // TODO: Ajustar employeeID real cuando exista autenticación
    const employeeID = null; // Enviar null si no hay ninguno.

    // La factura se arma antes de limpiar el carrito y se emite después de guardar la venta
    const facturaRequest = this.tipoComprobante === 'factura'
      ? this.buildFacturaRequest(invoiceNumber, paymentMethod)
      : null;

    const recibo: ReceiptSnapshot | null = this.tipoComprobante === 'recibo'
      ? {
          numero: invoiceNumber,
          fecha: new Date(),
          items: this.cartItems.map(i => ({
            descripcion: i.descripcion, cantidad: i.cantidad, precio: i.pvp, total: i.pvp * i.cantidad
          })),
          total: this.total,
          paymentMethod,
          recibido: 0,
          cambio: 0
        }
      : null;

    // Crear un arreglo de peticiones concurrentes para cada item del carrito
    const salesObservables = this.cartItems.map(item => {
      const product = this.allProducts.find(p => p.id === item.id);
      const precioImportacion = product?.precioImportacion || 0; // Obtener precioImportacion del producto

      const subtotalItem = item.pvp * item.cantidad;

      // Calcular ganancia total (PVP - precioImportacion) * cantidad
      const profit = (item.pvp - precioImportacion) * item.cantidad;

      const sale: SaleDto = {
        invoiceNumber: invoiceNumber,
        employeeID: employeeID,
        productID: item.id || '',
        saleDate: saleDate,
        profit: profit,
        quantity: item.cantidad,
        unitPrice: item.pvp,
        taxAmount: 0,
        totalAmount: subtotalItem,
        paymentMethod: paymentMethod,
        status: 'Completed'
      };

      return this.salesService.createSale(sale);
    });

    // Capturar items antes de limpiar el carrito
    const itemsVendidos = this.cartItems.map(i => ({ id: i.id!, cantidad: i.cantidad }));

    forkJoin(salesObservables).subscribe({
      next: () => {
        // Descontar stock de cada producto vendido
        const stockObservables = itemsVendidos
          .filter(i => i.id)
          .map(i => this.productService.reducirStock(i.id, i.cantidad));

        forkJoin(stockObservables).subscribe({
          next: () => {
            Notiflix.Loading.remove();
            Notiflix.Notify.success('✓ Venta realizada con éxito');
            this.limpiarVenta();
            this.getAllProducts(); // refresca stock en tiempo real
            if (facturaRequest) this.emitirFactura(facturaRequest);
            if (recibo && this.imprimirTicketAuto) this.imprimirRecibo(recibo);
          },
          error: () => {
            Notiflix.Loading.remove();
            Notiflix.Notify.success('✓ Venta guardada, pero hubo un error al actualizar el stock.');
            this.limpiarVenta();
            this.getAllProducts(); // refresca de todas formas para mostrar estado real
            if (facturaRequest) this.emitirFactura(facturaRequest);
            if (recibo && this.imprimirTicketAuto) this.imprimirRecibo(recibo);
          }
        });
      },
      error: (err) => {
        Notiflix.Loading.remove();
        console.error('Error procesando la venta:', err);
        Notiflix.Notify.failure('Error al procesar la venta');
      }
    });
  }

  limpiarVenta(): void {
    this.cartItems = [];
    this.formGroup.reset();
    this.selectedPaymentMethod = 'efectivo';
    this.tipoComprobante = 'recibo';
    this.recalculate();
    this.applyFilter('');
  }

  getAllProducts(): void {
    this.productService.getProducts(1, 1000, '', 'descripcion', 'asc')
      .subscribe({
        next: (data: any) => {
          this.allProducts = data.items || [];
          // Preserva el filtro activo para que el stock se actualice
          // en la vista que el usuario ya tiene abierta
          const currentSearch = this.formGroup.get('searchControl')?.value || '';
          if (currentSearch.trim()) {
            this.applyFilter(currentSearch);
          } else {
            this.showDefaultProducts();
          }
        },
        error: (err) => {
          console.error('Error loading products:', err);
        }
      });
  }

  /* =========================
     🔍 FILTRO INTELIGENTE
     ========================= */

  applyFilter(value: any): void {
    const raw = this.formGroup.get('searchControl')!.value || '';

    if (!raw.trim()) {
      this.showDefaultProducts();
      return;
    }

    // Búsqueda inteligente: tildes, errores de tipeo, palabras pegadas y sinónimos
    const filtered = this.smartSearch.filter(this.allProducts, this.allProducts, raw).items;
    this.products = filtered.slice(0, this.MAX_RESULTS);
  }







  private showDefaultProducts(): void {
    this.products = this.allProducts.slice(0, this.MAX_RESULTS);
  }

  /* =========================
     🛒 CARRITO
     ========================= */

  addProductToCart(product: any, priceType: string = 'pvp'): void {
    const desc = (product.descripcion || '').toLowerCase();

    // Interceptar resistencias 1/4W para pedir el valor
    if (desc.includes('resistencia') && desc.includes('1/4')) {
      this.pendingResistorProduct = product;
      this.pendingResistorPriceType = priceType;
      this.activeResistorValues = this.resistorValues;
      this.resistorModalTitle = 'Resistencia ¼ Watt';
      this.selectedResistorValue = '';
      this.showResistorModal = true;
      return;
    }

    // Interceptar resistencias 1/2W para pedir el valor
    if (desc.includes('resistencia') && desc.includes('1/2')) {
      this.pendingResistorProduct = product;
      this.pendingResistorPriceType = priceType;
      this.activeResistorValues = this.resistorHalfWattValues;
      this.resistorModalTitle = 'Resistencia ½ Watt';
      this.selectedResistorValue = '';
      this.showResistorModal = true;
      return;
    }

    this.doAddToCart(product, priceType);
  }

  /** Confirmación desde el modal de resistencias */
  confirmResistorSales(): void {
    if (!this.selectedResistorValue) {
      Notiflix.Notify.warning('Selecciona el valor de la resistencia');
      return;
    }
    const product = {
      ...this.pendingResistorProduct,
      descripcion: `${this.pendingResistorProduct.descripcion} - ${this.selectedResistorValue}`
    };
    this.showResistorModal = false;
    this.doAddToCart(product, this.pendingResistorPriceType);
  }

  /** Agrega directamente al carrito (sin verificación de resistencias) */
  private doAddToCart(product: any, priceType: string): void {
    const precio = priceType === 'mayorista'
      ? (product.precioMayorista || product.pvp || 0)
      : (product.pvp || 0);

    const productId = product.idProducto?.toString() || product.id?.toString() || '0';
    const desc = (product.descripcion || '').toLowerCase();
    const isResistor = desc.includes('resistencia');

    // Resistencias se diferencian por descripción completa (incluye el valor)
    const existing = isResistor
      ? this.cartItems.find(p => p.id === productId && p.descripcion === product.descripcion && p.priceType === priceType)
      : this.cartItems.find(p => p.id === productId && p.priceType === priceType);

    if (existing) {
      existing.cantidad++;
    } else {
      this.cartItems.push({
        id: productId,
        descripcion: product.descripcion,
        pvp: precio,
        precioOriginal: precio,
        priceType: priceType,
        cantidad: 1
      });
    }

    this.recalculate();
    Notiflix.Notify.success('Producto agregado al carrito', { position: 'right-bottom', timeout: 1500 });
  }

  incrementQuantity(index: number): void {
    if (index >= 0 && index < this.cartItems.length) {
      this.cartItems[index].cantidad++;
      this.recalculate();
    }
  }

  decrementQuantity(index: number): void {
    if (index >= 0 && index < this.cartItems.length) {
      if (this.cartItems[index].cantidad > 1) {
        this.cartItems[index].cantidad--;
      } else {
        this.removeItem(index);
      }
      this.recalculate();
    }
  }

  /** Solo permite teclas numéricas, borrar, flechas y tabulador */
  onQtyKeydown(event: KeyboardEvent): void {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab'];
    if (allowed.includes(event.key)) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  /** Actualiza la cantidad mientras el usuario escribe */
  onQtyInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1) {
      this.cartItems[index].cantidad = val;
      this.recalculate();
    }
  }

  /** Al perder el foco: si queda vacío o 0, fuerza 1 */
  onQtyBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) {
      this.cartItems[index].cantidad = 1;
      input.value = '1';
      this.recalculate();
    }
  }

  removeItem(index: number): void {
    if (index >= 0 && index < this.cartItems.length) {
      this.cartItems.splice(index, 1);
      this.recalculate();
      Notiflix.Notify.info('Producto removido', { position: 'right-bottom', timeout: 1200 });
    }
  }

  clearCart(): void {
    this.cartItems = [];
    this.recalculate();
  }

  recalculate(): void {
    const rawTotal = this.cartItems.reduce(
      (sum, item) => sum + (item.pvp * item.cantidad),
      0
    );

    this.subtotal = rawTotal;
    this.total = rawTotal;

    // Actualizar subtotal en items
    this.cartItems.forEach(item => {
      item.subtotal = item.pvp * item.cantidad;
    });
  }

  /**
   * Cambia el precio unitario SOLO en esta venta. El PVP del producto no se toca:
   * cada línea del carrito tiene su propio precio, que es el que se guarda en la venta,
   * en la ganancia y en la factura.
   */
  setPrecioCarrito(item: any, event: any): void {
    const input = event?.target as HTMLInputElement;
    const valor = Math.round(parseFloat(String(input?.value ?? '').replace(',', '.')) * 100) / 100;
    if (!isFinite(valor) || valor < 0) {
      if (input) input.value = String(item.pvp);
      return;
    }
    if (item.precioOriginal === undefined) item.precioOriginal = item.pvp;
    item.pvp = valor;
    item.precioManual = valor !== item.precioOriginal;
    this.recalculate();
  }

  restaurarPrecioCarrito(item: any): void {
    if (item.precioOriginal === undefined) return;
    item.pvp = item.precioOriginal;
    item.precioManual = false;
    this.recalculate();
  }

  getTotal(): number {
    return this.total;
  }

  toggleCart(): void {
    this.cartCollapsed = !this.cartCollapsed;
  }

  selectPaymentMethod(methodId: string): void {
    this.selectedPaymentMethod = methodId;
  }

  selectTipoComprobante(tipo: 'recibo' | 'factura'): void {
    this.tipoComprobante = tipo;
  }

  // 🔍 Limpiar búsqueda al hacer focus
  onSearchFocus(): void {
    const searchControl = this.formGroup.get('searchControl');
    if (searchControl && searchControl.value) {
      searchControl.setValue('');
    }
  }

  /* =========================
     📋 CARGAR COTIZACIÓN
     ========================= */

  numeroCotizacion: string = '';
  buscandoCotizacion: boolean = false;
  cotizacionCargada: any[] | null = null;

  // Sugerencias mientras se escribe el número de cotización
  private cotizacionesGuardadas: any[] | null = null;
  private cargandoCotizaciones = false;
  sugerenciasCotizacion: any[] = [];
  mostrarSugerencias = false;

  /** Trae una sola vez las cotizaciones guardadas (número, fecha, productos y total). */
  private cargarCotizacionesGuardadas(): void {
    if (this.cotizacionesGuardadas || this.cargandoCotizaciones) return;
    this.cargandoCotizaciones = true;
    this.http.get<any[]>(`${environment.apiALTEC}/api/cotizaciones`).subscribe({
      next: (data) => {
        this.cotizacionesGuardadas = data ?? [];
        this.cargandoCotizaciones = false;
        this.filtrarCotizaciones();
      },
      error: () => {
        this.cargandoCotizaciones = false;
      }
    });
  }

  onNumeroCotizacionFocus(): void {
    this.cargarCotizacionesGuardadas();
    this.mostrarSugerencias = true;
    this.filtrarCotizaciones();
  }

  onNumeroCotizacionChange(value: string): void {
    this.numeroCotizacion = value;
    this.cotizacionCargada = null;
    this.mostrarSugerencias = true;
    this.cargarCotizacionesGuardadas();
    this.filtrarCotizaciones();
  }

  /** Las que empiezan con lo escrito primero, luego las que lo contienen; las más recientes arriba. */
  private filtrarCotizaciones(): void {
    const term = (this.numeroCotizacion || '').replace(/\D/g, '');
    const lista = [...(this.cotizacionesGuardadas ?? [])]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!term) {
      this.sugerenciasCotizacion = lista.slice(0, 6);
      return;
    }
    const empiezan = lista.filter(c => String(c.quotationNumber).startsWith(term));
    const contienen = lista.filter(c => !String(c.quotationNumber).startsWith(term) && String(c.quotationNumber).includes(term));
    this.sugerenciasCotizacion = [...empiezan, ...contienen].slice(0, 8);
  }

  elegirCotizacion(c: any): void {
    this.numeroCotizacion = String(c.quotationNumber);
    this.mostrarSugerencias = false;
    if (c.items?.length) {
      this.cotizacionCargada = c.items;
    } else {
      this.buscarCotizacion();
    }
  }

  ocultarSugerencias(): void {
    // Espera un instante para que el click en una sugerencia alcance a registrarse
    setTimeout(() => this.mostrarSugerencias = false, 150);
  }

  buscarCotizacion(): void {
    this.mostrarSugerencias = false;
    const numero = this.numeroCotizacion.trim();
    if (!numero) {
      Notiflix.Notify.warning('Ingresa un número de cotización.');
      return;
    }

    this.buscandoCotizacion = true;
    this.cotizacionCargada = null;

    this.http.get<any[]>(`${environment.apiALTEC}/api/cotizaciones/${numero}`).subscribe({
      next: (items) => {
        this.buscandoCotizacion = false;
        if (!items || items.length === 0) {
          Notiflix.Notify.warning('No se encontró la cotización.');
          return;
        }
        this.cotizacionCargada = items;
      },
      error: () => {
        this.buscandoCotizacion = false;
        Notiflix.Notify.failure('No se encontró la cotización o ocurrió un error.');
      }
    });
  }

  getProductName(productId: string): string {
    const product = this.allProducts.find(p => p.id === productId);
    return product ? product.descripcion : productId;
  }

  getPrecioParaCotizacion(item: any): number {
    const product = this.allProducts.find(p => p.id === item.productId);
    if (!product) return item.unitPrice ?? 0;
    // Precio puesto a mano en el cotizador: se respeta
    if ((item.priceType ?? '').toLowerCase() === 'manual') return Number(item.unitPrice) || 0;
    const esMayorista = (item.priceType ?? '').toLowerCase() === 'mayorista';
    return esMayorista && product.precioMayorista > 0
      ? product.precioMayorista
      : product.pvp;
  }

  cargarCotizacionAlCarrito(): void {
    if (!this.cotizacionCargada) return;

    let cargados = 0;
    for (const item of this.cotizacionCargada) {
      const product = this.allProducts.find(p => p.id === item.productId);
      if (!product) continue;

      const tipo = (item.priceType ?? '').toLowerCase();
      const esMayorista = tipo === 'mayorista';
      const esManual = tipo === 'manual';
      const precioSistema = esMayorista && product.precioMayorista > 0
        ? product.precioMayorista
        : product.pvp;
      // Si en el cotizador se cambió el precio, la venta usa ese precio
      const precio = esManual ? (Number(item.unitPrice) || precioSistema) : precioSistema;
      const tipoCarrito = esMayorista ? 'mayorista' : 'pvp';

      const existing = this.cartItems.find(c => c.id === product.id && c.priceType === tipoCarrito && c.pvp === precio);
      if (existing) {
        existing.cantidad += item.quantity;
      } else {
        this.cartItems.push({
          id: product.id,
          descripcion: product.descripcion,
          pvp: precio,
          precioOriginal: precioSistema,
          precioManual: precio !== precioSistema,
          priceType: tipoCarrito,
          cantidad: item.quantity
        });
      }
      cargados++;
    }

    this.recalculate();

    if (cargados > 0) {
      Notiflix.Notify.success(`${cargados} producto(s) cargado(s) al carrito.`);
      this.cotizacionCargada = null;
      this.numeroCotizacion = '';
    } else {
      Notiflix.Notify.warning('No se encontraron productos de la cotización en el inventario.');
    }
  }

  /* =========================
     🧾 FACTURA ELECTRÓNICA SRI
     ========================= */

  private buscarClienteFactura(value: string): void {
    const id = (value || '').trim();
    if (!/^[0-9]{10}$|^[0-9]{13}$/.test(id)) return;

    this.invoiceService.buscarCliente(id).subscribe({
      next: (c) => {
        // Solo si el usuario no cambió la identificación mientras se buscaba
        if ((this.formGroup.get('clientDocument')?.value || '').trim() !== id) return;
        this.formGroup.patchValue({
          clientName: c.razonSocial,
          clientAddress: c.direccion || '',
          clientEmail: c.email || '',
          clientPhone: c.telefono || ''
        }, { emitEvent: false });
        Notiflix.Notify.info('Cliente encontrado: datos cargados', { position: 'right-bottom', timeout: 1500 });
      },
      error: () => { /* cliente nuevo: se registra al emitir la factura */ }
    });
  }

  /** Mismas reglas que el backend, para no guardar la venta con datos que el SRI rechazaría. */
  private validarDatosFactura(): string | null {
    const f = this.formGroup.value;
    const id = (f.clientDocument || '').trim();
    const nombre = (f.clientName || '').trim();
    const email = (f.clientEmail || '').trim();

    if (!id) return 'Para facturar ingresa la cédula o RUC del cliente.';
    if (/^[0-9]{10}$/.test(id) && !this.cedulaValida(id)) return 'La cédula ingresada no es válida.';
    if (/^[0-9]+$/.test(id) && id.length !== 10 && !(id.length === 13 && id.endsWith('001')))
      return 'El RUC debe tener 13 dígitos y terminar en 001.';
    if (!/^[A-Za-z0-9]{5,20}$/.test(id)) return 'La identificación del cliente no es válida.';
    if (nombre.length < 2) return 'Para facturar ingresa el nombre o razón social del cliente.';
    if (!(f.clientAddress || '').trim()) return 'Para facturar ingresa la dirección del cliente.';
    if (email && this.formGroup.get('clientEmail')?.invalid) return 'El correo del cliente no es válido.';
    if (this.formGroup.get('clientPhone')?.invalid) return 'El teléfono del cliente no es válido.';
    return null;
  }

  /** Cédula ecuatoriana: provincia 01-24 (o 30), tercer dígito < 6 y verificador módulo 10. */
  private cedulaValida(id: string): boolean {
    const provincia = parseInt(id.substring(0, 2), 10);
    if (((provincia < 1 || provincia > 24) && provincia !== 30) || parseInt(id[2], 10) >= 6) return false;

    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let v = parseInt(id[i], 10) * (i % 2 === 0 ? 2 : 1);
      if (v > 9) v -= 9;
      suma += v;
    }
    return (10 - (suma % 10)) % 10 === parseInt(id[9], 10);
  }

  private buildFacturaRequest(invoiceNumber: string, paymentMethod: string): CreateElectronicInvoiceRequest {
    const f = this.formGroup.value;
    const isGuid = (v?: string) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    return {
      saleInvoiceNumber: invoiceNumber,
      formaPago: paymentMethod === 'transferencia' ? '20' : '01',
      cliente: {
        identificacion: (f.clientDocument || '').trim(),
        razonSocial: (f.clientName || '').trim(),
        direccion: (f.clientAddress || '').trim() || null,
        email: (f.clientEmail || '').trim() || null,
        telefono: (f.clientPhone || '').trim() || null
      },
      items: this.cartItems.map(item => {
        const product = this.allProducts.find(p => p.id === item.id);
        return {
          productId: isGuid(item.id) ? item.id : null,
          codigo: product?.codigo || null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precioUnitario: item.pvp,
          descuento: 0
        };
      }),
      createdBy: null
    };
  }

  private emitirFactura(request: CreateElectronicInvoiceRequest): void {
    this.facturaRequest = request;
    this.facturaResultado = null;
    this.facturaError = '';
    this.facturaEmailReenvio = request.cliente.email || '';
    this.showFacturaModal = true;
    this.facturaProcesando = true;

    this.invoiceService.emitir(request).subscribe({
      next: (res) => this.onFacturaResultado(res),
      error: (err) => {
        this.facturaProcesando = false;
        this.facturaError = err?.error?.error || 'No se pudo emitir la factura. La venta quedó guardada; puedes reintentar.';
      }
    });
  }

  private onFacturaResultado(res: ElectronicInvoiceResult): void {
    this.facturaProcesando = false;
    this.facturaResultado = res;
    this.facturaError = '';
    if (res.autorizada) {
      this.facturaRequest = null;
      Notiflix.Notify.success(`Factura ${res.numeroFactura} autorizada por el SRI`);
      if (this.imprimirTicketAuto) this.imprimirTicketFactura();
    }
  }

  /** Reintenta: si la factura ya existe consulta/envía de nuevo al SRI; si no se llegó a crear, la emite otra vez. */
  reintentarFactura(): void {
    if (this.facturaResultado) {
      this.facturaProcesando = true;
      this.facturaError = '';
      this.invoiceService.reintentar(this.facturaResultado.id).subscribe({
        next: (res) => this.onFacturaResultado(res),
        error: (err) => {
          this.facturaProcesando = false;
          this.facturaError = err?.error?.error || 'No se pudo contactar al SRI. Intenta de nuevo en unos minutos.';
        }
      });
    } else if (this.facturaRequest) {
      this.emitirFactura(this.facturaRequest);
    }
  }

  descargarFacturaPdf(): void {
    const res = this.facturaResultado;
    if (!res) return;
    this.invoiceService.descargarPdf(res.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Factura-${res.numeroFactura}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => Notiflix.Notify.failure('No se pudo descargar el PDF de la factura.')
    });
  }

  reenviarFacturaEmail(): void {
    const res = this.facturaResultado;
    if (!res) return;
    Notiflix.Loading.standard('Enviando correo...');
    this.invoiceService.enviarEmail(res.id, this.facturaEmailReenvio.trim() || undefined).subscribe({
      next: (r) => {
        Notiflix.Loading.remove();
        this.facturaResultado = r;
        Notiflix.Notify.success('Factura enviada por correo');
      },
      error: (err) => {
        Notiflix.Loading.remove();
        Notiflix.Notify.failure(err?.error?.error || 'No se pudo enviar el correo.');
      }
    });
  }

  cerrarFacturaModal(): void {
    if (this.facturaProcesando) return;
    this.showFacturaModal = false;
  }

  /* =========================
     🖨️ TICKET TÉRMICO (RECIBO / FACTURA)
     ========================= */

  private readPrintPref(): boolean {
    try {
      return localStorage.getItem(this.PRINT_PREF_KEY) !== 'no';
    } catch {
      return true;
    }
  }

  onImprimirTicketAutoChange(): void {
    try {
      localStorage.setItem(this.PRINT_PREF_KEY, this.imprimirTicketAuto ? 'si' : 'no');
    } catch { /* sin almacenamiento: solo dura esta sesión */ }
  }

  private async imprimirRecibo(r: ReceiptSnapshot): Promise<void> {
    try {
      const html = await this.ticket.buildDocument('Recibo ALTEC', this.buildReciboBody(r));
      await this.ticket.print(html);
    } catch (error) {
      console.error('Error al imprimir el recibo:', error);
      Notiflix.Notify.failure('No se pudo imprimir el recibo');
    }
  }

  private buildReciboBody(r: ReceiptSnapshot): string {
    const money = (v: number) => this.ticket.money(v);
    const esc = (t: any) => this.ticket.esc(t);
    const { fecha, hora } = this.ticket.fechaHora(r.fecha);
    const unidades = r.items.reduce((sum, i) => sum + i.cantidad, 0);

    const items = r.items.map(i => `
      <div class="item">
        <div class="desc">${esc(i.descripcion)}</div>
        <div class="row">
          <span>${i.cantidad} x ${money(i.precio)}</span>
          <span class="bold">${money(i.total)}</span>
        </div>
      </div>`).join('');

    const pago = r.paymentMethod === 'transferencia'
      ? `<div class="row"><span>Forma de pago</span><span class="bold">Transferencia</span></div>`
      : `<div class="row"><span>Forma de pago</span><span class="bold">Efectivo</span></div>
         ${r.recibido > 0 ? `<div class="row"><span>Recibido</span><span>${money(r.recibido)}</span></div>
         <div class="row"><span>Cambio</span><span>${money(r.cambio)}</span></div>` : ''}`;

    return `
  <div class="center brand">ALTEC MECATRÓNICA</div>
  <div class="center small">Quito, Villaflora, Rodrigo de Chávez</div>
  <div class="center small">WhatsApp: (099) 515-9078</div>
  <div class="sep-strong"></div>
  <div class="center title">RECIBO DE VENTA</div>
  <div class="center small">N° ${esc(r.numero)}</div>
  <div class="row small"><span>Fecha: ${fecha}</span><span>Hora: ${hora}</span></div>
  <div class="sep"></div>
  ${items}
  <div class="sep"></div>
  <div class="row small"><span>Productos: ${r.items.length}</span><span>Unidades: ${unidades}</span></div>
  <div class="sep-strong"></div>
  <div class="row total"><span>TOTAL</span><span>${money(r.total)}</span></div>
  <div class="sep-strong"></div>
  <div class="small">${pago}</div>
  <div class="sep"></div>
  <div class="center small">Precios en dólares (USD).</div>
  <div class="center small">Este documento no es una factura.</div>
  <div class="center bold" style="margin-top:2mm">¡Gracias por su compra!</div>
  <div class="center small">altecmec.com</div>`;
  }

  /** Imprime la copia física de la factura (RIDE en 80 mm). */
  imprimirTicketFactura(): void {
    const res = this.facturaResultado;
    if (!res) return;

    this.invoiceService.getTicket(res.id).subscribe({
      next: async (data) => {
        try {
          const html = await this.ticket.buildDocument(`Factura ${data.numeroFactura}`, this.ticket.buildInvoiceTicketBody(data));
          await this.ticket.print(html);
        } catch (error) {
          console.error('Error al imprimir la factura:', error);
          Notiflix.Notify.failure('No se pudo imprimir el ticket de la factura');
        }
      },
      error: () => Notiflix.Notify.failure('No se pudieron obtener los datos de la factura para imprimir')
    });
  }

}
