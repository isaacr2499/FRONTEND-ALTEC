import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Notiflix from 'notiflix';
import { ProductService } from '../../services/warehouse.service';
import { UserSessionService } from '../../../authentication/services/user-session.service';

declare var bootstrap: any;

/**
 * Ventana de producto: edición (open) con guardar y eliminar, o alta de un
 * producto nuevo (openNew) con las mismas validaciones que tenía "Cargar Productos".
 */
@Component({
  selector: 'app-product-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-edit-modal.component.html',
  styleUrl: './product-edit-modal.component.scss'
})
export class ProductEditModalComponent {
  /** Producto ya guardado, tal como lo devuelve el backend. */
  @Output() saved = new EventEmitter<any>();
  /** Id del producto eliminado. */
  @Output() deleted = new EventEmitter<string>();
  /** Se creó un producto nuevo (el backend le asigna el código). */
  @Output() created = new EventEmitter<void>();

  isNew = false;
  private userName = '';

  selectedProduct: any = null;
  categoriaActual = '';
  imagePreview: string | null = null;
  isDragging = false;
  isSaving = false;

  categoriasValidas: string[] = [
    'Audio y video',
    'Baquelitas',
    'Compuertas e Integrados',
    'Componentes Electrónicos',
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
    'Proyectos Y kits',
    'Protoboards',
    'Redes y Comunicación',
    'Transformadores',
    'Otros'
  ];

  constructor(
    private productService: ProductService,
    private userSessionService: UserSessionService
  ) {
    this.userSessionService.getUserInfo().subscribe(userInfo => {
      if (userInfo) this.userName = userInfo.name;
    });
  }

  /** ➕ Abre la ventana vacía para un producto nuevo. */
  openNew(): void {
    this.isNew = true;
    this.selectedProduct = {
      categoria: '',
      codigo: '',
      isImport: false,
      descripcion: '',
      stock: null,
      pvp: null,
      precioMayorista: null,
      precioImportacion: null,
      foto: 'NOT-IMAGE',
      archivo: null
    };
    this.categoriaActual = '';
    this.imagePreview = null;
    this.isDragging = false;
    this.showModal();
  }

  open(producto: any): void {
    this.isNew = false;
    // Se edita una copia: si se cancela, la lista no cambia
    const { _normDesc, _normCode, _margen, _margenPct, ...datos } = producto;
    this.selectedProduct = {
      ...datos,
      isImport: this.convertToBoolean(producto.isImport)
    };
    this.categoriaActual = producto.categoria || '';
    this.imagePreview = null;
    this.isDragging = false;
    this.showModal();
  }

  private showModal(): void {
    const modalElement = document.getElementById('productEditModal');
    if (modalElement) {
      bootstrap.Modal.getOrCreateInstance(modalElement).show();
    }
  }

  /** Mismas reglas que el formulario de "Cargar Productos". */
  private validarNuevo(): string | null {
    const p = this.selectedProduct;
    const precio = /^[0-9]+([.,][0-9]{1,2})?$/;
    const vacio = (v: any) => v === null || v === undefined || String(v).trim() === '';

    if (vacio(p.categoria)) return 'Selecciona una categoría.';
    if (vacio(p.descripcion)) return 'Escribe la descripción del producto.';
    if (vacio(p.stock) || !/^[0-9]*$/.test(String(p.stock))) return 'El stock debe ser un número entero.';
    if (vacio(p.pvp) || !precio.test(String(p.pvp))) return 'Ingresa un PVP válido (máximo 2 decimales).';
    if (vacio(p.precioMayorista) || !precio.test(String(p.precioMayorista))) return 'Ingresa un precio mayorista válido (máximo 2 decimales).';
    if (p.isImport && vacio(p.precioImportacion)) return 'Para un producto importado, el precio de compra es obligatorio.';
    if (!vacio(p.precioImportacion) && !precio.test(String(p.precioImportacion))) return 'Ingresa un precio de compra válido (máximo 2 decimales).';
    return null;
  }

  /** ➕ Crea el producto con el mismo formato que enviaba "Cargar Productos". */
  crearProducto(): void {
    if (!this.selectedProduct || this.isSaving) return;
    const error = this.validarNuevo();
    if (error) {
      Notiflix.Notify.failure(error);
      return;
    }

    Notiflix.Confirm.show(
      'Confirmación',
      '¿Estás seguro de que deseas subir este producto?',
      'Sí',
      'No',
      () => {
        const p = this.selectedProduct;
        const formDataToSend = new FormData();

        if (p.archivo) {
          formDataToSend.append('Foto', p.archivo, p.archivo.name);
        } else {
          formDataToSend.append('Foto', 'NOT-IMAGE');
        }

        // El backend espera los decimales con coma
        const conComa = (v: any) => String(v).replace('.', ',');
        const tieneCompra = p.precioImportacion !== null && p.precioImportacion !== undefined && String(p.precioImportacion).trim() !== '';

        formDataToSend.append('Pvp', conComa(p.pvp));
        formDataToSend.append('Descripcion', p.descripcion);
        formDataToSend.append('Categoria', p.categoria);
        formDataToSend.append('IsImport', String(!!p.isImport));
        formDataToSend.append('Stock', String(p.stock));
        formDataToSend.append('PrecioMayorista', conComa(p.precioMayorista));
        formDataToSend.append('Codigo', p.codigo || '');
        formDataToSend.append('PrecioImportacion', tieneCompra ? conComa(p.precioImportacion) : '0');
        formDataToSend.append('CreatedBy', this.userName);

        this.isSaving = true;
        Notiflix.Loading.arrows('Subiendo producto...');
        this.productService.createProduct(formDataToSend).subscribe(
          () => {
            // Pausa para que el backend asigne el código antes de recargar la lista
            setTimeout(() => {
              this.isSaving = false;
              Notiflix.Loading.remove();
              Notiflix.Notify.success('¡Producto subido exitosamente!');
              this.closeModal();
              this.created.emit();
            }, 2000);
          },
          () => {
            this.isSaving = false;
            Notiflix.Loading.remove();
            Notiflix.Notify.failure('Error al subir el producto.');
          }
        );
      },
      () => {
        Notiflix.Notify.info('Carga cancelada.');
      }
    );
  }

  private convertToBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    return false;
  }

  guardarEdicion(): void {
    if (!this.selectedProduct || this.isSaving) return;
    this.isSaving = true;
    this.productService.updateProduct(this.selectedProduct.id, this.selectedProduct).subscribe(
      (updatedProduct: any) => {
        this.isSaving = false;
        this.saved.emit(updatedProduct);
        this.closeModal();
        Notiflix.Report.success(
          'Producto actualizado',
          'El producto ha sido actualizado correctamente.',
          'Aceptar'
        );
      },
      (error: any) => {
        this.isSaving = false;
        console.error('Error al actualizar el producto', error);
        Notiflix.Report.failure(
          'Error',
          'Hubo un problema al actualizar el producto.',
          'Cerrar'
        );
      }
    );
  }

  eliminarProducto(): void {
    if (!this.selectedProduct) return;
    const product = this.selectedProduct;

    Notiflix.Confirm.show(
      'Eliminar producto',
      `¿Seguro que deseas eliminar "${product.descripcion}"? Esta acción no se puede deshacer.`,
      'Sí, eliminar',
      'Cancelar',
      () => {
        Notiflix.Loading.standard('Eliminando producto...');
        this.productService.deactivateProduct(product.id).subscribe({
          next: () => {
            Notiflix.Loading.remove();
            this.deleted.emit(product.id);
            this.closeModal();
            Notiflix.Report.success(
              'Producto eliminado',
              'El producto ha sido eliminado correctamente.',
              'Aceptar'
            );
          },
          error: () => {
            Notiflix.Loading.remove();
            Notiflix.Report.failure(
              'Error',
              'No se pudo eliminar el producto. Intenta de nuevo.',
              'Cerrar'
            );
          }
        });
      },
      () => { },
      {
        titleColor: '#ef4444',
        okButtonColor: '#fff',
        okButtonBackground: '#ef4444',
      }
    );
  }

  closeModal(): void {
    const modalElement = document.getElementById('productEditModal');
    if (modalElement) {
      bootstrap.Modal.getInstance(modalElement)?.hide();
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    this.processImageFile(file);
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
    // Ignorar el dragleave que se dispara al pasar sobre elementos hijos (overlay, imagen, texto)
    const zone = event.currentTarget as HTMLElement;
    if (zone.contains(event.relatedTarget as Node)) return;
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      this.processImageFile(file);
    }
  }

  private processImageFile(file: File): void {
    if (this.isNew && file && !['image/jpeg', 'image/png'].includes(file.type)) {
      Notiflix.Notify.failure('Solo se permiten archivos JPG y PNG');
      return;
    }
    if (file && this.selectedProduct) {
      this.selectedProduct.archivo = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
}
