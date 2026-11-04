import { Component, ElementRef, HostListener } from '@angular/core';

interface Catalogo {
  nombre: string;
  icono: string;
  archivo?: string;   // ruta en assets (se abre y se descarga)
  enlace?: string;    // enlace externo (p. ej. video de YouTube); sin archivo ni enlace se muestra como "Próximamente"
  descarga?: string;  // nombre con el que se descarga
}

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss'
})
export class LandingPageComponent {

  // 📚 Catálogos descargables (archivos en src/assets/catalogos, sin base de datos)
  readonly catalogos: Catalogo[] = [
    { nombre: 'Kit chasis carro', icono: 'bi-car-front', enlace: 'https://www.youtube.com/watch?v=CY9wPJ4LN14' },
    {
      nombre: 'Brazo robótico',
      icono: 'bi-robot',
      archivo: 'assets/catalogos/Tutorial-Brazo.pdf',
      descarga: 'Tutorial-Brazo-Robotico-ALTEC.pdf'
    }
  ];
  catalogosAbierto = false;

  constructor(private el: ElementRef<HTMLElement>) { }

  toggleCatalogos(event: Event): void {
    event.stopPropagation();
    this.catalogosAbierto = !this.catalogosAbierto;
  }

  /** Abre el enlace en otra pestaña; si es un PDF, además lo descarga. */
  abrirCatalogo(c: Catalogo): void {
    if (c.enlace) {
      window.open(c.enlace, '_blank', 'noopener');
      this.catalogosAbierto = false;
      return;
    }
    if (!c.archivo) return;
    window.open(c.archivo, '_blank', 'noopener');

    const a = document.createElement('a');
    a.href = c.archivo;
    a.download = c.descarga || '';
    a.click();

    this.catalogosAbierto = false;
  }

  @HostListener('document:click', ['$event'])
  cerrarCatalogos(event: Event): void {
    const menu = this.el.nativeElement.querySelector('.catalogos');
    if (this.catalogosAbierto && menu && !menu.contains(event.target as Node)) {
      this.catalogosAbierto = false;
    }
  }

  @HostListener('document:keydown.escape')
  cerrarCatalogosEsc(): void {
    this.catalogosAbierto = false;
  }
}
