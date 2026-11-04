import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterModule} from '@angular/router';
import {AppMaterialModule} from "../../app-material.module";
import {AppTranslationLanguageModule} from "../../app-translation-language.module";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {WAREHOUSE_ROUTES} from "./warehouse.routing";
import {InventarioComponent} from "./components/inventario/inventario.component";
import {ExtraProductInfoComponent} from "./components/extra-product-info/extra-product-info.component";
import {ProductEditModalComponent} from "./components/product-edit-modal/product-edit-modal.component";

@NgModule({
  declarations: [
    InventarioComponent,
    ExtraProductInfoComponent
  ],
  imports: [
    CommonModule,
    AppMaterialModule,
    AppTranslationLanguageModule,
    RouterModule.forChild(WAREHOUSE_ROUTES),
    ReactiveFormsModule,
    FormsModule,
    ProductEditModalComponent,
  ]
})
export class WarehouseModule {}
