import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApplicationBaseService } from '../../utils/base/application-base-service';

export interface ImportedQuotationSummary {
  id: string;
  nombre: string;
  fecha: string;
  nombreArchivo: string;
  tamanoBytes: number;
  totalItems: number;
  totalMonto: number;
  /** Gastos para que la mercadería llegue (aduana, IVA, Alibaba, impuesto TC...). */
  costosExtras: number;
  costosExtrasNota?: string | null;
  createdAt: string;
  createdBy: string;
}

export interface ImportedQuotationItem {
  fila: number;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  /** Costo en China + su parte de los costos extras (repartidos según el valor de cada fila). */
  costoEcuadorUnitario: number;
  costoEcuadorTotal: number;
}

export interface ImportedQuotationDetail extends ImportedQuotationSummary {
  items: ImportedQuotationItem[];
  porcentajeRecargo: number;
  totalEcuador: number;
}

export interface ImportedQuotationFilters {
  desde?: string;
  hasta?: string;
  buscar?: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuotationHistoryService extends ApplicationBaseService {

  private readonly endpoint = 'api/cotizaciones-importadas';

  constructor(protected override http: HttpClient) {
    super(http);
  }

  getAll(filters: ImportedQuotationFilters = {}): Observable<ImportedQuotationSummary[]> {
    let params = new HttpParams();
    if (filters.desde) params = params.set('desde', filters.desde);
    if (filters.hasta) params = params.set('hasta', filters.hasta);
    if (filters.buscar?.trim()) params = params.set('buscar', filters.buscar.trim());
    const query = params.toString();
    return this.genericSend('get', query ? `${this.endpoint}?${query}` : this.endpoint);
  }

  getDetail(id: string): Observable<ImportedQuotationDetail> {
    return this.genericSend('get', `${this.endpoint}/${id}`);
  }

  upload(nombre: string, fecha: string, archivo: File, createdBy: string): Observable<ImportedQuotationSummary> {
    const formData = new FormData();
    formData.append('Nombre', nombre);
    formData.append('Fecha', fecha);
    formData.append('Archivo', archivo, archivo.name);
    formData.append('CreatedBy', createdBy);
    return this.genericSend('post', this.endpoint, formData);
  }

  /** Guarda los costos extras y devuelve el detalle recalculado. */
  updateExtraCosts(id: string, costosExtras: number, nota: string | null): Observable<ImportedQuotationDetail> {
    return this.genericSend('put', `${this.endpoint}/${id}/costos-extras`, { costosExtras, nota });
  }

  /** Filas del Excel que tienen foto incrustada. */
  getImageRows(id: string): Observable<number[]> {
    return this.genericSend('get', `${this.endpoint}/${id}/imagenes`);
  }

  /** URL de la foto de una fila (se usa directo en <img>). */
  imageUrl(id: string, fila: number): string {
    return `${this.apiUrl}/${this.endpoint}/${id}/imagenes/${fila}`;
  }

  download(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${this.endpoint}/${id}/archivo`, { responseType: 'blob' });
  }
}
