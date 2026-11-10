import{J as h}from"./chunk-V45XOT66.js";import{j as u}from"./chunk-K4ALXBGI.js";var b=(()=>{class g{constructor(){this.logo=null}money(a){return new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(a||0)}esc(a){return String(a??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}fechaHora(a=new Date){let i=new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",day:"2-digit",month:"2-digit",year:"numeric"}).format(a),e=new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",hour:"2-digit",minute:"2-digit",hour12:!0}).format(a);return{fecha:i,hora:e}}buildDocument(a,i){return u(this,null,function*(){let e=yield this.getLogo();return`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${this.esc(a)}</title>
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
  ${e?`<img class="logo" src="${e}" alt="ALTEC">`:""}
  ${i}
</body></html>`})}buildInvoiceTicketBody(a){let i=t=>this.money(t),e=t=>this.esc(t),[n,m,r]=(a.fechaEmision||"").substring(0,10).split("-"),p=n?`${r}/${m}/${n}`:"",l=a.fechaAutorizacion?this.fechaHora(new Date(a.fechaAutorizacion)):null,c={"01":"SIN UTILIZACION DEL SISTEMA FINANCIERO",20:"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO"},s=a.emisor,d=a.items.map(t=>`
      <div class="item">
        <div class="desc">${e(t.descripcion)}</div>
        <div class="row">
          <span>${t.cantidad} x ${i(t.precioUnitario)}${t.descuento>0?` - desc. ${i(t.descuento)}`:""}</span>
          <span class="bold">${i(t.total)}</span>
        </div>
      </div>`).join(""),v=a.pagos.map(t=>`
      <div class="row tiny"><span>${t.formaPago} - ${e(c[t.formaPago]||"")}</span><span>${i(t.total)}</span></div>`).join(""),o=a.comprador;return`
  <div class="center brand">${e(s.nombreComercial||s.razonSocial)}</div>
  <div class="center small bold">${e(s.razonSocial)}</div>
  <div class="center small">RUC: ${e(s.ruc)}</div>
  <div class="center tiny">Matriz: ${e(s.dirMatriz)}</div>
  ${s.dirEstablecimiento&&s.dirEstablecimiento!==s.dirMatriz?`<div class="center tiny">Sucursal: ${e(s.dirEstablecimiento)}</div>`:""}
  <div class="center tiny">Obligado a llevar contabilidad: ${e(s.obligadoContabilidad)}</div>
  ${s.contribuyenteRimpe?`<div class="center tiny bold">${e(s.contribuyenteRimpe)}</div>`:""}
  <div class="sep-strong"></div>
  <div class="center title">FACTURA</div>
  <div class="center bold">No. ${e(a.numeroFactura)}</div>
  <div class="row small"><span>Ambiente:</span><span>${a.ambiente===2?"PRODUCCI\xD3N":"PRUEBAS"}</span></div>
  <div class="row small"><span>Emisi\xF3n:</span><span>NORMAL</span></div>
  <div class="row small"><span>Fecha emisi\xF3n:</span><span>${p}</span></div>
  ${l?`<div class="row small"><span>Autorizaci\xF3n:</span><span>${l.fecha} ${l.hora}</span></div>`:""}
  <div class="small" style="margin-top:1mm">${a.numeroAutorizacion?"N\xB0 autorizaci\xF3n / clave de acceso:":"Clave de acceso:"}</div>
  <div class="mono tiny">${e(a.numeroAutorizacion||a.claveAcceso)}</div>
  <div class="sep"></div>
  <div class="small"><span class="bold">Cliente:</span> ${e(o.razonSocial)}</div>
  <div class="small"><span class="bold">CI/RUC:</span> ${e(o.identificacion)}</div>
  ${o.direccion?`<div class="small"><span class="bold">Direcci\xF3n:</span> ${e(o.direccion)}</div>`:""}
  ${o.telefono?`<div class="small"><span class="bold">Tel\xE9fono:</span> ${e(o.telefono)}</div>`:""}
  ${o.email?`<div class="small"><span class="bold">Email:</span> ${e(o.email)}</div>`:""}
  <div class="sep"></div>
  ${d}
  <div class="sep"></div>
  <div class="row small"><span>SUBTOTAL 0%</span><span>${i(a.totalSinImpuestos)}</span></div>
  ${a.totalDescuento>0?`<div class="row small"><span>DESCUENTO</span><span>${i(a.totalDescuento)}</span></div>`:""}
  <div class="row small"><span>IVA</span><span>${i(a.totalIva)}</span></div>
  <div class="sep-strong"></div>
  <div class="row total"><span>TOTAL</span><span>${i(a.importeTotal)}</span></div>
  <div class="sep-strong"></div>
  <div class="small bold">Forma de pago</div>
  ${v}
  <div class="sep"></div>
  <div class="center tiny">Copia impresa de la factura electr\xF3nica.</div>
  <div class="center tiny">El comprobante v\xE1lido es el XML autorizado por el SRI${o.email?", enviado a su correo":""}.</div>
  <div class="center bold" style="margin-top:2mm">\xA1Gracias por su compra!</div>
  <div class="center small">altecmec.com</div>`}getLogo(){return this.logo?Promise.resolve(this.logo):new Promise(a=>{let i=new Image;i.onload=()=>{let e=document.createElement("canvas");e.width=i.naturalWidth,e.height=i.naturalHeight;let n=e.getContext("2d");if(!n)return a(null);n.drawImage(i,0,0);let m=n.getImageData(0,0,e.width,e.height),r=m.data,p=e.width,l=e.height,c=-1,s=-1;for(let v=0;v<e.height;v++)for(let o=0;o<e.width;o++){let t=(v*e.width+o)*4;r[t+3]>60?(r[t]=r[t+1]=r[t+2]=0,r[t+3]=255,o<p&&(p=o),o>c&&(c=o),v<l&&(l=v),v>s&&(s=v)):r[t+3]=0}if(c<0)return a(null);n.putImageData(m,0,0);let d=document.createElement("canvas");d.width=c-p+1,d.height=s-l+1,d.getContext("2d")?.drawImage(e,p,l,d.width,d.height,0,0,d.width,d.height),this.logo=d.toDataURL("image/png"),a(this.logo)},i.onerror=()=>a(null),i.src="assets/images/LOGIN.png"})}print(a){return new Promise(i=>{let e=document.createElement("iframe");e.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",document.body.appendChild(e);let n=e.contentDocument,m=e.contentWindow;if(!n||!m)return e.remove(),i();let r=!1,p=()=>{r||(r=!0,setTimeout(()=>e.remove(),1e3),i())};n.open(),n.write(a),n.close();let l=Array.from(n.images);Promise.all(l.map(c=>c.complete?Promise.resolve():new Promise(s=>{c.onload=c.onerror=s}))).then(()=>{m.onafterprint=p,m.focus(),m.print(),setTimeout(p,6e4)})})}static{this.\u0275fac=function(i){return new(i||g)}}static{this.\u0275prov=h({token:g,factory:g.\u0275fac,providedIn:"root"})}}return g})();export{b as a};
