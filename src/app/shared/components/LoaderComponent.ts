import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoaderService } from '../services/LoaderService';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loader-overlay" *ngIf="isLoading">
      <div class="loader-spinner"></div>
      <span class="loader-text">Cargando</span>
      <div class="loader-bar"><div class="loader-bar-fill" [style.width.%]="progress"></div></div>
    </div>
  `,
  styleUrls: ['./loader.component.scss']
})
export class LoaderComponent implements OnInit {
  isLoading = false;
  progress = 0;

  constructor(public loaderService: LoaderService) {}

  ngOnInit() {
    this.loaderService.isLoading$.subscribe(status => {
      this.isLoading = status;
    });
    this.loaderService.progress$.subscribe(value => {
      this.progress = value;
    });
  }
}
