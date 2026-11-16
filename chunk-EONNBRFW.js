import{J as f}from"./chunk-V45XOT66.js";import{j as h}from"./chunk-K4ALXBGI.js";var b=(()=>{class v{constructor(){this.logo=null}money(e){return new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(e||0)}esc(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}fechaHora(e=new Date){let a=new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",day:"2-digit",month:"2-digit",year:"numeric"}).format(e),t=new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",hour:"2-digit",minute:"2-digit",hour12:!0}).format(e);return{fecha:a,hora:t}}buildDocument(e,a){return h(this,null,function*(){let t=yield this.getLogo();return`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${this.esc(e)}</title>
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
  ${t?`<img class="logo" src="${t}" alt="ALTEC">`:""}
  ${a}
</body></html>`})}buildInvoiceTicketBody(e){let a=i=>this.money(i),t=i=>this.esc(i),[n,d,l]=(e.fechaEmision||"").substring(0,10).split("-"),r=n?`${l}/${d}/${n}`:"",c=e.fechaAutorizacion?this.fechaHora(new Date(e.fechaAutorizacion)):null,m={"01":"SIN UTILIZACION DEL SISTEMA FINANCIERO",20:"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO"},s=e.emisor,p=e.items.map(i=>`
      <div class="item">
        <div class="desc">${t(i.descripcion)}</div>
        <div class="row">
          <span>${i.cantidad} x ${a(i.precioUnitario)}${i.descuento>0?` - desc. ${a(i.descuento)}`:""}</span>
          <span class="bold">${a(i.total)}</span>
        </div>
      </div>`).join(""),g=e.pagos.map(i=>`
      <div class="row tiny"><span>${i.formaPago} - ${t(m[i.formaPago]||"")}</span><span>${a(i.total)}</span></div>`).join(""),o=e.comprador;return`
  <div class="center brand">${t(s.nombreComercial||s.razonSocial)}</div>
  <div class="center small bold">${t(s.razonSocial)}</div>
  <div class="center small">RUC: ${t(s.ruc)}</div>
  <div class="center tiny">Matriz: ${t(s.dirMatriz)}</div>
  ${s.dirEstablecimiento&&s.dirEstablecimiento!==s.dirMatriz?`<div class="center tiny">Sucursal: ${t(s.dirEstablecimiento)}</div>`:""}
  <div class="center tiny">Obligado a llevar contabilidad: ${t(s.obligadoContabilidad)}</div>
  ${s.contribuyenteRimpe?`<div class="center tiny bold">${t(s.contribuyenteRimpe)}</div>`:""}
  <div class="sep-strong"></div>
  <div class="center title">FACTURA</div>
  <div class="center bold">No. ${t(e.numeroFactura)}</div>
  <div class="row small"><span>Ambiente:</span><span>${e.ambiente===2?"PRODUCCI\xD3N":"PRUEBAS"}</span></div>
  <div class="row small"><span>Emisi\xF3n:</span><span>NORMAL</span></div>
  <div class="row small"><span>Fecha emisi\xF3n:</span><span>${r}</span></div>
  ${c?`<div class="row small"><span>Autorizaci\xF3n:</span><span>${c.fecha} ${c.hora}</span></div>`:""}
  <div class="small" style="margin-top:1mm">${e.numeroAutorizacion?"N\xB0 autorizaci\xF3n / clave de acceso:":"Clave de acceso:"}</div>
  <div class="mono tiny">${t(e.numeroAutorizacion||e.claveAcceso)}</div>
  <div class="sep"></div>
  <div class="small"><span class="bold">Cliente:</span> ${t(o.razonSocial)}</div>
  <div class="small"><span class="bold">CI/RUC:</span> ${t(o.identificacion)}</div>
  ${o.direccion?`<div class="small"><span class="bold">Direcci\xF3n:</span> ${t(o.direccion)}</div>`:""}
  ${o.telefono?`<div class="small"><span class="bold">Tel\xE9fono:</span> ${t(o.telefono)}</div>`:""}
  ${o.email?`<div class="small"><span class="bold">Email:</span> ${t(o.email)}</div>`:""}
  <div class="sep"></div>
  ${p}
  <div class="sep"></div>
  <div class="row small"><span>SUBTOTAL 0%</span><span>${a(e.totalSinImpuestos)}</span></div>
  ${e.totalDescuento>0?`<div class="row small"><span>DESCUENTO</span><span>${a(e.totalDescuento)}</span></div>`:""}
  <div class="row small"><span>IVA</span><span>${a(e.totalIva)}</span></div>
  <div class="sep-strong"></div>
  <div class="row total"><span>TOTAL</span><span>${a(e.importeTotal)}</span></div>
  <div class="sep-strong"></div>
  <div class="small bold">Forma de pago</div>
  ${g}
  <div class="sep"></div>
  <div class="center tiny">Copia impresa de la factura electr\xF3nica.</div>
  <div class="center tiny">El comprobante v\xE1lido es el XML autorizado por el SRI${o.email?", enviado a su correo":""}.</div>
  <div class="center bold" style="margin-top:2mm">\xA1Gracias por su compra!</div>
  <div class="center small">altecmec.com</div>`}buildCodeLabel(e){return h(this,null,function*(){let a=String(e||"").trim(),t=yield this.getLogo(),n=68*96/25.4,d="900 100px 'Arial Black', Arial, Helvetica, sans-serif",l=110,r=document.createElement("canvas").getContext("2d");if(r&&a){r.font=d;let c=r.measureText(a).width;c>0&&(l=Math.min(150,Math.floor(100*n/c)))}return`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>C\xF3digo ${this.esc(a)}</title>
<style>
  @page { size: 72mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 72mm; padding: 3mm 2mm 4mm; text-align: center; }
  .code {
    font-family: 'Arial Black', Arial, Helvetica, sans-serif;
    font-weight: 900;
    font-size: ${l}px;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0;
  }
  .logo { display: block; width: 25mm; margin: 3mm auto 0; }
  .brand { font-family: Arial, sans-serif; font-size: 11px; font-weight: 800; margin-top: 3mm; }
</style></head>
<body>
  <div class="code">${this.esc(a)}</div>
  ${t?`<img class="logo" src="${t}" alt="ALTEC">`:'<div class="brand">\u26A1 ALTEC</div>'}
</body></html>`})}getLogo(){return this.logo?Promise.resolve(this.logo):new Promise(e=>{let a=new Image;a.onload=()=>{let t=document.createElement("canvas");t.width=a.naturalWidth,t.height=a.naturalHeight;let n=t.getContext("2d");if(!n)return e(null);n.drawImage(a,0,0);let d=n.getImageData(0,0,t.width,t.height),l=d.data,r=t.width,c=t.height,m=-1,s=-1;for(let g=0;g<t.height;g++)for(let o=0;o<t.width;o++){let i=(g*t.width+o)*4;l[i+3]>60?(l[i]=l[i+1]=l[i+2]=0,l[i+3]=255,o<r&&(r=o),o>m&&(m=o),g<c&&(c=g),g>s&&(s=g)):l[i+3]=0}if(m<0)return e(null);n.putImageData(d,0,0);let p=document.createElement("canvas");p.width=m-r+1,p.height=s-c+1,p.getContext("2d")?.drawImage(t,r,c,p.width,p.height,0,0,p.width,p.height),this.logo=p.toDataURL("image/png"),e(this.logo)},a.onerror=()=>e(null),a.src="assets/images/LOGIN.png"})}print(e){return new Promise(a=>{let t=document.createElement("iframe");t.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",document.body.appendChild(t);let n=t.contentDocument,d=t.contentWindow;if(!n||!d)return t.remove(),a();let l=!1,r=()=>{l||(l=!0,setTimeout(()=>t.remove(),1e3),a())};n.open(),n.write(e),n.close();let c=Array.from(n.images);Promise.all(c.map(m=>m.complete?Promise.resolve():new Promise(s=>{m.onload=m.onerror=s}))).then(()=>{d.onafterprint=r,d.focus(),d.print(),setTimeout(r,6e4)})})}static{this.\u0275fac=function(a){return new(a||v)}}static{this.\u0275prov=f({token:v,factory:v.\u0275fac,providedIn:"root"})}}return v})();export{b as a};
