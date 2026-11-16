import { Injectable } from '@angular/core';
import { InvoiceTicketData } from './electronic-invoice.service';

/**
 * Tickets para la impresora térmica de 80 mm (área imprimible 72 mm).
 * En la ventana ALTEC POS (Chrome con --kiosk-printing) se imprimen directo, sin diálogo.
 */
@Injectable({
  providedIn: 'root'
})
export class ThermalTicketService {
  private logo: string | null = null;

  money(v: number): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(v || 0);
  }

  esc(t: any): string {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Fecha y hora en Ecuador: { fecha: dd/mm/aaaa, hora: hh:mm a. m. } */
  fechaHora(date: Date = new Date()): { fecha: string; hora: string } {
    const fecha = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(date);
    const hora = new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: true
    }).format(date);
    return { fecha, hora };
  }

  /** Documento completo del ticket: estilos comunes + logo + contenido. */
  async buildDocument(title: string, body: string): Promise<string> {
    const logo = await this.getLogo();
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${this.esc(title)}</title>
<style>
  @page { size: 72mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 72mm; padding: 2mm 2.5mm; font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.3; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .logo { display: block; width: 52mm; margin: 1mm auto 2mm; }
  .brand { font-size: 15px; font-weight: 800; letter-spacing: 0.5px; }
  .small { font-size: 10.5px; }
  .tiny { font-size: 9.5px; }
  .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  .sep-strong { border-top: 2px solid #000; margin: 2mm 0; }
  .title { font-size: 14px; font-weight: 800; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .item { margin-bottom: 1.5mm; }
  .desc { font-weight: 700; word-break: break-word; }
  .total { font-size: 16px; font-weight: 800; }
  .mono { font-family: 'Courier New', monospace; word-break: break-all; letter-spacing: 0.3px; }
</style></head>
<body>
  ${logo ? `<img class="logo" src="${logo}" alt="ALTEC">` : ''}
  ${body}
</body></html>`;
  }

  /** Copia física de la factura electrónica (RIDE en 80 mm). */
  buildInvoiceTicketBody(d: InvoiceTicketData): string {
    const money = (v: number) => this.money(v);
    const esc = (t: any) => this.esc(t);
    // FechaEmision es una fecha local de Ecuador sin zona: se toma tal cual (aaaa-mm-dd)
    const [y, m, dd] = (d.fechaEmision || '').substring(0, 10).split('-');
    const emision = y ? `${dd}/${m}/${y}` : '';
    const autorizacion = d.fechaAutorizacion ? this.fechaHora(new Date(d.fechaAutorizacion)) : null;
    const formasPago: Record<string, string> = {
      '01': 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
      '20': 'OTROS CON UTILIZACION DEL SISTEMA FINANCIERO'
    };
    const e = d.emisor;

    const items = d.items.map(i => `
      <div class="item">
        <div class="desc">${esc(i.descripcion)}</div>
        <div class="row">
          <span>${i.cantidad} x ${money(i.precioUnitario)}${i.descuento > 0 ? ` - desc. ${money(i.descuento)}` : ''}</span>
          <span class="bold">${money(i.total)}</span>
        </div>
      </div>`).join('');

    const pagos = d.pagos.map(p => `
      <div class="row tiny"><span>${p.formaPago} - ${esc(formasPago[p.formaPago] || '')}</span><span>${money(p.total)}</span></div>`).join('');

    const comprador = d.comprador;
    return `
  <div class="center brand">${esc(e.nombreComercial || e.razonSocial)}</div>
  <div class="center small bold">${esc(e.razonSocial)}</div>
  <div class="center small">RUC: ${esc(e.ruc)}</div>
  <div class="center tiny">Matriz: ${esc(e.dirMatriz)}</div>
  ${e.dirEstablecimiento && e.dirEstablecimiento !== e.dirMatriz ? `<div class="center tiny">Sucursal: ${esc(e.dirEstablecimiento)}</div>` : ''}
  <div class="center tiny">Obligado a llevar contabilidad: ${esc(e.obligadoContabilidad)}</div>
  ${e.contribuyenteRimpe ? `<div class="center tiny bold">${esc(e.contribuyenteRimpe)}</div>` : ''}
  <div class="sep-strong"></div>
  <div class="center title">FACTURA</div>
  <div class="center bold">No. ${esc(d.numeroFactura)}</div>
  <div class="row small"><span>Ambiente:</span><span>${d.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}</span></div>
  <div class="row small"><span>Emisión:</span><span>NORMAL</span></div>
  <div class="row small"><span>Fecha emisión:</span><span>${emision}</span></div>
  ${autorizacion ? `<div class="row small"><span>Autorización:</span><span>${autorizacion.fecha} ${autorizacion.hora}</span></div>` : ''}
  <div class="small" style="margin-top:1mm">${d.numeroAutorizacion ? 'N° autorización / clave de acceso:' : 'Clave de acceso:'}</div>
  <div class="mono tiny">${esc(d.numeroAutorizacion || d.claveAcceso)}</div>
  <div class="sep"></div>
  <div class="small"><span class="bold">Cliente:</span> ${esc(comprador.razonSocial)}</div>
  <div class="small"><span class="bold">CI/RUC:</span> ${esc(comprador.identificacion)}</div>
  ${comprador.direccion ? `<div class="small"><span class="bold">Dirección:</span> ${esc(comprador.direccion)}</div>` : ''}
  ${comprador.telefono ? `<div class="small"><span class="bold">Teléfono:</span> ${esc(comprador.telefono)}</div>` : ''}
  ${comprador.email ? `<div class="small"><span class="bold">Email:</span> ${esc(comprador.email)}</div>` : ''}
  <div class="sep"></div>
  ${items}
  <div class="sep"></div>
  <div class="row small"><span>SUBTOTAL 0%</span><span>${money(d.totalSinImpuestos)}</span></div>
  ${d.totalDescuento > 0 ? `<div class="row small"><span>DESCUENTO</span><span>${money(d.totalDescuento)}</span></div>` : ''}
  <div class="row small"><span>IVA</span><span>${money(d.totalIva)}</span></div>
  <div class="sep-strong"></div>
  <div class="row total"><span>TOTAL</span><span>${money(d.importeTotal)}</span></div>
  <div class="sep-strong"></div>
  <div class="small bold">Forma de pago</div>
  ${pagos}
  <div class="sep"></div>
  <div class="center tiny">Copia impresa de la factura electrónica.</div>
  <div class="center tiny">El comprobante válido es el XML autorizado por el SRI${comprador.email ? ', enviado a su correo' : ''}.</div>
  <div class="center bold" style="margin-top:2mm">¡Gracias por su compra!</div>
  <div class="center small">altecmec.com</div>`;
  }

  /**
   * Etiqueta de producto: el código lo más grande posible a lo ancho del papel
   * (72 mm imprimibles) y debajo el logo ALTEC con el rayo.
   */
  async buildCodeLabel(codigo: string): Promise<string> {
    const code = String(codigo || '').trim();
    const logo = await this.getLogo();

    // Ancho útil ≈ 68 mm en px CSS (96 dpi); se ajusta la letra para que el código lo llene
    const anchoPx = 68 * 96 / 25.4;
    const font = "900 100px 'Arial Black', Arial, Helvetica, sans-serif";
    let size = 110;
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx && code) {
      ctx.font = font;
      const w = ctx.measureText(code).width;
      if (w > 0) size = Math.min(150, Math.floor(100 * anchoPx / w));
    }

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Código ${this.esc(code)}</title>
<style>
  @page { size: 72mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 72mm; padding: 3mm 2mm 4mm; text-align: center; }
  .code {
    font-family: 'Arial Black', Arial, Helvetica, sans-serif;
    font-weight: 900;
    font-size: ${size}px;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0;
  }
  .logo { display: block; width: 25mm; margin: 3mm auto 0; }
  .brand { font-family: Arial, sans-serif; font-size: 11px; font-weight: 800; margin-top: 3mm; }
</style></head>
<body>
  <div class="code">${this.esc(code)}</div>
  ${logo ? `<img class="logo" src="${logo}" alt="ALTEC">` : '<div class="brand">⚡ ALTEC</div>'}
</body></html>`;
  }

  /** Logo de la barra (letras blancas) convertido a negro y recortado, para papel térmico. */
  getLogo(): Promise<string | null> {
    if (this.logo) return Promise.resolve(this.logo);

    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (px[i + 3] > 60) {
              px[i] = px[i + 1] = px[i + 2] = 0;
              px[i + 3] = 255;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            } else {
              px[i + 3] = 0;
            }
          }
        }

        if (maxX < 0) return resolve(null);
        ctx.putImageData(data, 0, 0);

        const crop = document.createElement('canvas');
        crop.width = maxX - minX + 1;
        crop.height = maxY - minY + 1;
        crop.getContext('2d')?.drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
        this.logo = crop.toDataURL('image/png');
        resolve(this.logo);
      };
      img.onerror = () => resolve(null);
      img.src = 'assets/images/LOGIN.png';
    });
  }

  /** Imprime un HTML en un iframe oculto (en ALTEC POS sale directo a la impresora predeterminada). */
  print(html: string): Promise<void> {
    return new Promise(resolve => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        iframe.remove();
        return resolve();
      }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        setTimeout(() => iframe.remove(), 1000);
        resolve();
      };

      doc.open();
      doc.write(html);
      doc.close();

      const images = Array.from(doc.images);
      Promise.all(images.map(img => img.complete
        ? Promise.resolve()
        : new Promise(r => { img.onload = img.onerror = r; })))
        .then(() => {
          win.onafterprint = finish;
          win.focus();
          win.print();
          setTimeout(finish, 60000);
        });
    });
  }
}
