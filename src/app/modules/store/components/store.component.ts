import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { FormsModule, ReactiveFormsModule, UntypedFormBuilder, UntypedFormGroup } from "@angular/forms";
import { NgForOf, CurrencyPipe, NgIf, NgClass } from '@angular/common';
import { ProductService } from "../../warehouse/services/warehouse.service";
import { LoaderService } from "../../../shared/services/LoaderService";
import { LoaderComponent } from "../../../shared/components/LoaderComponent";
import Notiflix from "notiflix";
import { CartService } from "../../../shared/services/CartService";
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SmartSearch } from '../../../shared/utils/smart-search';


@Component({
  selector: 'app-store',
  standalone: true,
  imports: [
    FormsModule,
    NgForOf,
    ReactiveFormsModule,
    CurrencyPipe,
    NgIf,
    NgClass,
    LoaderComponent
  ],
  templateUrl: './store.component.html',
  styleUrl: './store.component.scss'
})
export class StoreComponent implements OnInit {
  @ViewChild('resultsSection') resultsSection!: ElementRef<HTMLElement>;

  public formGroup!: UntypedFormGroup;
  allProducts: any[] = [];
  products: any[] = [];
  totalCount = 0;
  currentPage = 1;
  totalPages = 0;
  pageSize = 12;
  searchTerm = '';

  // Búsqueda inteligente (tildes, errores de tipeo, sinónimos…)
  private searchEngine: SmartSearch<any> | null = null;
  searchSuggestion: string | null = null;  // "¿Quisiste decir…?"
  searchRelated = false;                   // no hubo coincidencia exacta: se muestran parecidos
  searchedText = '';
  selectedProduct: any = null;
  selectedValue: string = '';

  // Vista previa de un producto (foto y nombre completos)
  previewProduct: any = null;

  // Filtros laterales (desktop): plegados hasta que se pulsa "Filtros"
  filtersOpen = false;

  // Vista de productos: cuadrícula o listado (se recuerda en este navegador)
  viewMode: 'grid' | 'list' = this.readViewMode();

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
  resistorModalTitle: string = '';

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
  selectedCategories: string[] = [];
  isDistribuidor: boolean = false;
  distribuidorName: string = '';
  public clienteName: string = '';
  public isCliente: boolean = false;
  constructor(
    private productService: ProductService,
    private fb: UntypedFormBuilder,
    private loaderService: LoaderService,
    private cartService: CartService
  ) { }

  openPreview(product: any): void {
    this.previewProduct = product;
  }

  @HostListener('document:keydown.escape')
  closePreview(): void {
    this.previewProduct = null;
  }

  /** Agrega desde la vista previa; se cierra antes por si el producto abre su propio modal (resistencias, LEDs). */
  addFromPreview(product: any): void {
    this.closePreview();
    this.addToCart(product);
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    try { localStorage.setItem('altec.storeView', mode); } catch { }
  }

  private readViewMode(): 'grid' | 'list' {
    try { return localStorage.getItem('altec.storeView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  }

  ngOnInit(): void {
    this.isDistribuidor = sessionStorage.getItem('isDistribuidor') === 'true';

    const userInfoString = sessionStorage.getItem('userInfo');
    if (userInfoString) {
      try {
        const parsedUser = JSON.parse(userInfoString);
        const role = parsedUser?.role;

        if (this.isDistribuidor) {
          this.distribuidorName = parsedUser.name ?? '';
        }

        // Detectar si es Cliente
        if (role === 'Cliente') {
          this.isCliente = true;
          this.clienteName = parsedUser.name ?? '';
        }

      } catch (err) {
        console.error('Error al parsear userInfo:', err);
      }
    }

    Notiflix.Notify.init({
      position: 'left-top',
      timeout: 1000,
      clickToClose: true
    });

    this.formGroup = this.fb.group({
      searchTerm: ['']
    });

    this.formGroup.get('searchTerm')!.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage = 1;
        this.applyFilter();
      });

    this.loaderService.start();
    this.loadProducts();
  }


  addToCart(product: any): void {
    const descripcion = product.descripcion?.toLowerCase() || '';

    // Modal para resistencias 1/4 W
    if (descripcion.includes('resistencia') && descripcion.includes('1/4')) {
      this.selectedProduct = product;
      this.selectedValue = '';
      this.activeResistorValues = this.resistorValues;
      this.resistorModalTitle = 'Resistencia ¼ Watt — Selecciona el valor';
      const modal = new (window as any).bootstrap.Modal(document.getElementById('resistorModal'));
      modal.show();
      return;
    }

    // Modal para resistencias 1/2 W
    if (descripcion.includes('resistencia') && descripcion.includes('1/2')) {
      this.selectedProduct = product;
      this.selectedValue = '';
      this.activeResistorValues = this.resistorHalfWattValues;
      this.resistorModalTitle = 'Resistencia ½ Watt — Selecciona el valor';
      const modal = new (window as any).bootstrap.Modal(document.getElementById('resistorModal'));
      modal.show();
      return;
    }

    // Modal para LEDs
    if (descripcion.includes('led') && descripcion.includes('diodo')) {
      this.selectedProduct = product;
      this.selectedValue = '';
      const modal = new (window as any).bootstrap.Modal(document.getElementById('ledModal')); // 👈 ESTE CAMBIO
      modal.show();
      return;
    }

    this.cartService.addToCart(product);
    Notiflix.Notify.success(`Agregado ${product.cantidad} x ${product.descripcion} al carrito`);
  }


  confirmAddResistor(): void {
    if (!this.selectedValue) {
      Notiflix.Notify.warning('Selecciona un valor de resistencia');
      return;
    }

    const newProduct = {
      ...this.selectedProduct,
      descripcion: `${this.selectedProduct.descripcion} - ${this.selectedValue}`
    };

    this.cartService.addToCart(newProduct);
    Notiflix.Notify.success(`Agregado ${newProduct.cantidad} x ${newProduct.descripcion} al carrito`);

    const modalElement = document.getElementById('resistorModal');
    const modalInstance = (window as any).bootstrap.Modal.getInstance(modalElement);
    modalInstance?.hide();

    modalInstance?.hide(); // solo si existe
  }


  loadProducts(): void {
    const isDistribuidor = sessionStorage.getItem('isDistribuidor') === 'true';

    const loadObservable = isDistribuidor
      ? this.productService.getProductsImport()
      : this.productService.getProductsClient(1, 1000, '');

    loadObservable.subscribe({
      next: (data: any) => {
        const items = Array.isArray(data) ? data : data?.items ?? [];

        this.allProducts = items.map((p: any) => ({ ...p, cantidad: 1 }));
        this.searchEngine = new SmartSearch<any>(
          this.allProducts,
          p => [p.descripcion, p.codigo, p.categoria],
          p => !this.isOutOfStock(p)
        );

        this.applyFilter();
        this.loaderService.finish();
      },
      error: (err) => {
        console.error('Error al obtener productos:', err);
        this.loaderService.finish();
      }
    });
  }

  confirmAddLed(): void {
    if (!this.selectedProduct || !this.selectedValue) return;

    const cloned = { ...this.selectedProduct };
    cloned.descripcion += ` - ${this.selectedValue}`;

    this.cartService.addToCart(cloned);
    Notiflix.Notify.success(`Agregado ${cloned.cantidad} x ${cloned.descripcion} al carrito`);

    const modalElement = document.getElementById('ledModal');
    const modalInstance = (window as any).bootstrap.Modal.getInstance(modalElement);
    modalInstance?.hide();
  }


  /**
   * Retorna true ÚNICAMENTE si el stock del producto es exactamente 0.
   * Soporta el valor como number o string, y maneja undefined/null como "hay stock".
   */
  isOutOfStock(product: any): boolean {
    if (!product) return false;
    const rawStock = product.stock !== undefined ? product.stock : product.Stock;
    if (rawStock === undefined || rawStock === null || rawStock === '') return false;
    return Number(rawStock) === 0;
  }


  applyFilter(): void {
    const raw = (this.formGroup.get('searchTerm')!.value || '').trim();
    let filtered = this.allProducts;
    this.searchSuggestion = null;
    this.searchRelated = false;
    this.searchedText = raw;

    if (raw && this.searchEngine) {
      const result = this.searchEngine.search(raw);
      filtered = result.items;
      this.searchRelated = result.related;
      this.searchSuggestion = result.suggestion;
    }

    if (this.selectedCategories.length > 0) {
      filtered = filtered.filter(p => this.selectedCategories.includes(p.categoria));
    }
    this.totalCount = filtered.length;
    this.totalPages = Math.ceil(this.totalCount / this.pageSize) || 1;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.products = filtered.slice(startIndex, startIndex + this.pageSize);
  }

  /** Aplica la búsqueda corregida de "¿Quisiste decir…?". */
  useSuggestion(): void {
    if (!this.searchSuggestion) return;
    this.formGroup.get('searchTerm')?.setValue(this.searchSuggestion);
    this.currentPage = 1;
    this.applyFilter();
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.applyFilter();
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

  onSubmit() {
    this.applyFilter();
  }
  onCategoryChange(event: any): void {
    const value = event.target.value;
    const checked = event.target.checked;

    if (checked) {
      if (!this.selectedCategories.includes(value)) {
        this.selectedCategories.push(value);
      }
    } else {
      this.selectedCategories = this.selectedCategories.filter(cat => cat !== value);
    }
    this.formGroup.get('searchTerm')?.setValue('');
    this.currentPage = 1;
    this.applyFilter();
  }
  clearFilters(): void {
    this.formGroup.get('searchTerm')?.setValue('');
    this.selectedCategories = [];
    this.currentPage = 1;
    this.applyFilter();
  }

  incrementQuantity(product: any): void {
    if (!product.cantidad) {
      product.cantidad = 1;
    }
    product.cantidad++;
  }

  decrementQuantity(product: any): void {
    if (!product.cantidad) {
      product.cantidad = 1;
    } else if (product.cantidad > 1) {
      product.cantidad--;
    }
  }
}
