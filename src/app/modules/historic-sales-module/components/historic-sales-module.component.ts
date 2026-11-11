import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SalesService } from '../../../services/sales.service';
import { ProductService } from '../../warehouse/services/warehouse.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ElectronicInvoiceService, ElectronicInvoiceListItem } from '../../../services/electronic-invoice.service';
import Notiflix from 'notiflix';

interface HistoricSaleRow {
    invoiceNumber: string;
    totalAmount: number;
    totalProfit: number;
    date: string;
    dateStr: string;
    itemCount: number;
    sales: any[];
    cancelled: boolean;
    /** Factura electrónica emitida para esta venta (si no hay, es un recibo). */
    factura?: { numero: string; estado: string };
}

@Component({
    selector: 'app-historic-sales-module',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './historic-sales-module.component.html',
    styleUrls: ['./historic-sales-module.component.scss'],
})
export class HistoricSalesModuleComponent implements OnInit {
    historicSales: HistoricSaleRow[] = [];
    filteredSales: HistoricSaleRow[] = [];

    // Chart
    chartView: 'day' | 'month' | 'year' = 'month';
    readonly CHART_PX = 148;   // max bar px — deja 30px de margen para el valor en la parte superior
    chartData: { label: string; amount: number; profit: number; hAmount: number; hProfit: number; isMax: boolean; }[] = [];

    // KPIs
    totalVentas: number = 0;
    totalGanancia: number = 0;
    totalFacturas: number = 0;   // ventas aprobadas (no canceladas)
    totalConFactura: number = 0;
    totalRecibos: number = 0;

    // Facturas electrónicas por número de venta
    private facturasPorVenta = new Map<string, { numero: string; estado: string }>();
    tipoFiltro: '' | 'factura' | 'recibo' = '';
    margen: number = 0;

    // Pagination
    currentPage: number = 1;
    pageSize: number = 100;

    // Search
    startDate: string = '';
    endDate: string = '';
    searchQuery: string = '';

    isLoading: boolean = false;
    showChartModal: boolean = false;

    // Modal detalle
    selectedSale: HistoricSaleRow | null = null;
    allProducts: any[] = [];

    constructor(
        private salesService: SalesService,
        private productService: ProductService,
        private einvService: ElectronicInvoiceService
    ) { }

    ngOnInit(): void {
        this.loadHistoricSales();
        this.loadFacturasElectronicas();
        this.productService.getProducts(1, 1000, '', 'descripcion', 'asc').subscribe({
            next: (data: any) => { this.allProducts = data.items || []; },
            error: () => {}
        });
    }

    openDetail(sale: HistoricSaleRow): void {
        this.selectedSale = sale;
    }

    closeDetail(): void {
        this.selectedSale = null;
    }

    getProduct(productId: string): any {
        return this.allProducts.find(p => p.id === productId) || null;
    }

    cancelarVenta(sale: HistoricSaleRow): void {
        Notiflix.Confirm.show(
            'Cancelar Venta',
            `¿Seguro que desea cancelar la factura <strong>${sale.invoiceNumber}</strong>?<br>Se devolverá el stock de todos los productos.`,
            'Sí, Cancelar',
            'No',
            () => {
                Notiflix.Loading.standard('Cancelando venta...');

                // 1. Marcar como Cancelled en BD
                this.salesService.cancelInvoice(sale.invoiceNumber).subscribe({
                    next: () => {
                        // 2. Restaurar stock de cada producto
                        const restoreObs = sale.sales.map(s =>
                            this.productService.aumentarStock(s.productId, s.quantity)
                        );
                        forkJoin(restoreObs).subscribe({
                            next: () => {
                                Notiflix.Loading.remove();
                                Notiflix.Notify.success(`Factura ${sale.invoiceNumber} cancelada. Stock restaurado.`);
                                // Marcar como cancelada en la lista local sin quitarla
                                const row = this.historicSales.find(h => h.invoiceNumber === sale.invoiceNumber);
                                if (row) {
                                    row.cancelled = true;
                                    row.totalAmount = 0;
                                    row.totalProfit = 0;
                                }
                                this.closeDetail();
                                this.filterSales();
                            },
                            error: () => {
                                Notiflix.Loading.remove();
                                Notiflix.Notify.failure('Factura cancelada pero hubo un error al restaurar el stock.');
                                this.closeDetail();
                            }
                        });
                    },
                    error: () => {
                        Notiflix.Loading.remove();
                        Notiflix.Notify.failure('Error al cancelar la factura. Intenta de nuevo.');
                    }
                });
            },
            () => {},
            {
                titleColor: '#ffffff',
                messageColor: '#ffffff',
                backgroundColor: '#1e1e2f',
                okButtonBackground: '#d63031',
                cancelButtonBackground: '#2d3561',
                okButtonColor: '#ffffff',
                cancelButtonColor: '#ffffff',
                borderRadius: '12px',
                width: '380px'
            }
        );
    }

    /** Carga todas las facturas electrónicas (páginas de 100) para saber qué ventas se facturaron. */
    private loadFacturasElectronicas(): void {
        const pageSize = 100;
        this.einvService.listar({ page: 1, pageSize }).pipe(
            switchMap(first => {
                const pages = Math.ceil((first.total || 0) / pageSize);
                const rest = [];
                for (let p = 2; p <= pages; p++) rest.push(this.einvService.listar({ page: p, pageSize }));
                return rest.length
                    ? forkJoin(rest).pipe(map(r => [first, ...r].flatMap(x => x.items)))
                    : of(first.items);
            }),
            catchError(() => of([] as ElectronicInvoiceListItem[]))
        ).subscribe(items => {
            this.facturasPorVenta.clear();
            items
                .filter(f => f.saleInvoiceNumber && f.estado !== 'DEVUELTA' && f.estado !== 'NO AUTORIZADO')
                .forEach(f => {
                    // Si una venta tiene varias, gana la que no está anulada
                    const prev = this.facturasPorVenta.get(f.saleInvoiceNumber!);
                    if (!prev || prev.estado === 'ANULADA') {
                        this.facturasPorVenta.set(f.saleInvoiceNumber!, { numero: f.numeroFactura, estado: f.estado });
                    }
                });
            this.historicSales.forEach(h => h.factura = this.facturasPorVenta.get(h.invoiceNumber));
            this.filterSales();
        });
    }

    estadoFactura(estado: string): { label: string; css: string } {
        switch (estado) {
            case 'AUTORIZADO': return { label: 'Autorizada', css: 'ok' };
            case 'ANULADA': return { label: 'Anulada', css: 'anulada' };
            default: return { label: 'Pendiente SRI', css: 'pendiente' };
        }
    }

    loadHistoricSales(): void {
        this.isLoading = true;
        Notiflix.Loading.standard('Cargando historial...');

        this.salesService.getHistoricSales(this.currentPage, this.pageSize).subscribe({
            next: (data: any) => {
                Notiflix.Loading.remove();
                this.isLoading = false;

                const results = Array.isArray(data) ? data : data.items || [data];
                this.processSales(results);
            },
            error: (err) => {
                Notiflix.Loading.remove();
                this.isLoading = false;
                console.error(err);
                Notiflix.Notify.failure('Error cargando el historial.');
            },
        });
    }

    processSales(data: any[]): void {
        this.historicSales = [];
        data.forEach(invoiceData => {
            const invoice = invoiceData.invoiceNumber || 'N/A';
            const salesArr = Array.isArray(invoiceData.sales) ? invoiceData.sales : invoiceData;

            // Calculate totals for invoice
            let totalAmount = 0;
            let totalProfit = 0;
            let saleDate = '';

            if (Array.isArray(salesArr)) {
                salesArr.forEach((s: any) => {
                    totalAmount += (s.totalAmount || 0);
                    totalProfit += (s.profit || 0);
                    if (!saleDate && s.saleDate) {
                        saleDate = s.saleDate;
                    }
                });

                const isCancelled = salesArr.some((s: any) => s.status === 'Cancelled');

                this.historicSales.push({
                    invoiceNumber: invoice,
                    totalAmount: isCancelled ? 0 : totalAmount,
                    totalProfit: isCancelled ? 0 : totalProfit,
                    itemCount: salesArr.length,
                    date: saleDate,
                    dateStr: saleDate ? new Date(saleDate).toLocaleDateString() : 'N/A',
                    sales: salesArr,
                    cancelled: isCancelled,
                    factura: this.facturasPorVenta.get(invoice)
                });
            }
        });

        // Default Sorting descend
        this.historicSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        this.filterSales();
    }

    filterSales(): void {
        let temp = [...this.historicSales];

        if (this.startDate) {
            const sDate = new Date(this.startDate).getTime();
            temp = temp.filter(s => new Date(s.date).getTime() >= sDate);
        }
        if (this.endDate) {
            const eDate = new Date(this.endDate).getTime();
            temp = temp.filter(s => new Date(s.date).getTime() <= eDate);
        }
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase().trim();
            temp = temp.filter(s => s.invoiceNumber.toLowerCase().includes(query)
                || (s.factura?.numero || '').toLowerCase().includes(query));
        }
        if (this.tipoFiltro === 'factura') temp = temp.filter(s => !!s.factura);
        if (this.tipoFiltro === 'recibo') temp = temp.filter(s => !s.factura);

        this.filteredSales = temp;
        this.generateChartData();
    }

    setChartView(view: 'day' | 'month' | 'year'): void {
        this.chartView = view;
        this.generateChartData();
    }

    generateChartData(): void {
        let entries: { label: string; amount: number; profit: number }[] = [];

        if (this.chartView === 'day') {
            // Cada factura individual = su propio par de barras
            entries = this.filteredSales
                .filter(s => !s.cancelled && s.date)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map(s => {
                    const d = new Date(s.date);
                    const hh = d.getHours().toString().padStart(2, '0');
                    const mm = d.getMinutes().toString().padStart(2, '0');
                    return { label: `${hh}:${mm}`, amount: s.totalAmount, profit: s.totalProfit };
                });
        } else {
            const map = new Map<string, { amount: number; profit: number }>();
            this.filteredSales.filter(s => !s.cancelled && s.date).forEach(s => {
                const d = new Date(s.date);
                const key = this.chartView === 'year'
                    ? `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
                    : `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                const curr = map.get(key) || { amount: 0, profit: 0 };
                curr.amount += s.totalAmount;
                curr.profit += s.totalProfit;
                map.set(key, curr);
            });
            entries = Array.from(map.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([key, val]) => ({ label: this.formatLabel(key), ...val }));
        }

        // Un solo máximo compartido: ganancia crece proporcionalmente al total
        const maxValue      = Math.max(1, ...entries.map(e => e.amount), ...entries.map(e => e.profit));
        const peakAmount    = Math.max(...entries.map(e => e.amount));

        this.chartData = entries.map(e => ({
            label:   e.label,
            amount:  e.amount,
            profit:  e.profit,
            isMax:   e.amount === peakAmount,   // barra más alta siempre muestra su valor
            hAmount: Math.max(6, (e.amount / maxValue) * this.CHART_PX),
            hProfit: Math.max(6, (e.profit / maxValue) * this.CHART_PX)
        }));

        // KPIs
        this.totalVentas   = this.filteredSales.reduce((s, r) => s + r.totalAmount, 0);
        this.totalGanancia = this.filteredSales.reduce((s, r) => s + r.totalProfit, 0);
        const aprobadas = this.filteredSales.filter(s => !s.cancelled);
        this.totalFacturas   = aprobadas.length;
        this.totalConFactura = aprobadas.filter(s => !!s.factura).length;
        this.totalRecibos    = this.totalFacturas - this.totalConFactura;
        this.margen = this.totalVentas > 0 ? (this.totalGanancia / this.totalVentas) * 100 : 0;
    }

    private formatLabel(key: string): string {
        if (this.chartView === 'month') {
            const parts = key.split('-');
            return `${parts[2]}/${parts[1]}`;
        }
        if (this.chartView === 'year') {
            const [, m] = key.split('-');
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            return months[parseInt(m, 10) - 1] ?? key;
        }
        return key;
    }

    clearFilters(): void {
        this.startDate = '';
        this.endDate = '';
        this.searchQuery = '';
        this.tipoFiltro = '';
        this.filterSales();
    }
}
