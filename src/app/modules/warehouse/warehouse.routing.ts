import {Routes} from '@angular/router';
import {AuthGuard} from "../../core/guard/auth.guard";
import {InventarioComponent} from "./components/inventario/inventario.component";



export const WAREHOUSE_ROUTES: Routes = [
  {
    path: 'inventario',
    component: InventarioComponent,
    canActivate: [AuthGuard]
  },
  {
    // La carga de productos ahora está en Consultar Bodega ("Nuevo producto"); se mantiene la ruta para enlaces guardados
    path: 'add-product',
    redirectTo: 'inventario',
    pathMatch: 'full'
  },
  {
    // La edición de productos ahora está en Consultar Bodega; se mantiene la ruta para enlaces guardados
    path: 'edit-product',
    redirectTo: 'inventario',
    pathMatch: 'full'
  }
];
