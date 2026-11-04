import { Component, OnInit } from '@angular/core';
import {
  R_ALTEC_POINTS,
  R_AUTHENTICATION,
  R_LOGIN,
  R_PRODUCT_QUOTE,
  R_WAREHOUSE,
  R_SALES_MODULE,
  R_HISTORIC_SALES,
  R_QUOTATION_HISTORY,
  R_ELECTRONIC_INVOICES
} from "../../../constants/route.constants";
import {Router} from "@angular/router";
import {UserSessionService} from "../../../modules/authentication/services/user-session.service";
import {CartService} from "../../../shared/services/CartService";
import Notiflix from "notiflix";

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  public role: string | null = null;
  public isExternal: boolean = false;
  cartItemCount: number = 0;
  public altecPoints: number = 0;
  public showPoints: boolean = false;
  constructor(private _router: Router, private _userSessionService: UserSessionService,private cartService: CartService) { }

  ngOnInit(): void {
    const token = sessionStorage.getItem('token');

    if (token) {
      this.isExternal = false;
      this._userSessionService.getUserInfo().subscribe(userInfo => {
        this.role = userInfo?.role ?? this.role;
        this.altecPoints = userInfo.altec_Points ?? 0;
        this.showPoints = this.role?.toLowerCase() === 'cliente';
      });
      const sUser = sessionStorage.getItem('userInfo');
      if (sUser) {
        try { this.role = JSON.parse(sUser).role ?? this.role; } catch {}
      }
    } else {
      this.isExternal = true;
      this.role = 'Invitado';
    }

    this.cartService.cartItemCount$.subscribe(c => (this.cartItemCount = c));
  }

  public logout(): void {
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('isDistribuidor');
    this.cartService.switchScope();
    this._router.navigate(['/']);
  }


  navigateToCotizador(): void {
    this._router.navigate([`/${R_PRODUCT_QUOTE}`]);

  }
  navigateToAltecPoints(): void {
    this._router.navigate([`/${R_ALTEC_POINTS}`]);

  }
  navigateToQuotationHistory(): void {
    this._router.navigate([`/${R_QUOTATION_HISTORY}`]);
  }
  navigateToBodega(): void {
    this._router.navigate(['/warehouse/inventario']);
  }

  navigateToSalesModule(): void {
    this._router.navigate([`/${R_SALES_MODULE}`]);
  }

  navigateToHistoricSales(): void {
    this._router.navigate([`/${R_HISTORIC_SALES}`]);
  }
  navigateToElectronicInvoices(): void {
    this._router.navigate([`/${R_ELECTRONIC_INVOICES}`]);
  }
  navigateToCart(): void {
    const cart = this.cartService.getCart();

    if (cart.length === 0) {
      Notiflix.Report.info(
        'Carrito vacío',
        '¡Aún no has agregado productos!<br>Explora nuestra tienda y encuentra lo que necesitas 😊',
        'Ir a la tienda',
        () => this._router.navigate(['/store'])
      );

      return;
    }

    this._router.navigate(['/store/detail-purchase']);
  }


}
