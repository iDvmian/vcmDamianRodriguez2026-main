import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/user.model';

/** Nombre legible de cada rol, para mostrarlo junto al usuario en sesión. */
const ROL_ETIQUETA: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR_VCM: 'Gestor VCM',
  ENCARGADO_CARRERA: 'Encargado de Carrera',
  DOCENTE: 'Docente',
  DECANO: 'Decano',
  DIRECTOR_VCM: 'Director VCM',
  CLIENTE: 'Solicitante',
};

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  constructor(private authService: AuthService, private router: Router) {}

  get currentUser(): User | null {
    return this.authService.getCurrentUser();
  }

  /** Rol del usuario en sesión, en texto legible (ej: "Decano"). */
  get rolLabel(): string {
    const rol = this.currentUser?.rol ?? '';
    return ROL_ETIQUETA[rol] ?? rol;
  }

  /** Decano, Director de VCM y Admin ven el panel de indicadores; el resto, su pantalla de inicio. */
  get inicioLabel(): string {
    const rol = this.currentUser?.rol;
    return rol === 'DECANO' || rol === 'DIRECTOR_VCM' || rol === 'ADMIN' ? 'Panel de indicadores' : 'Inicio';
  }

  // Facultades es de configuración: solo para quienes ven toda la estructura.
  // Carreras y Usuarios también las ve el Decano, pero solo las de su facultad.
  get showFacultades(): boolean {
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM'].includes(this.authService.getCurrentUser()?.rol ?? '');
  }

  get showCarreras(): boolean {
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM', 'DECANO'].includes(this.authService.getCurrentUser()?.rol ?? '');
  }

  get showUsuarios(): boolean {
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM', 'DECANO'].includes(this.authService.getCurrentUser()?.rol ?? '');
  }

  get showAlumnosVoluntarios(): boolean {
    const rol = this.authService.getCurrentUser()?.rol;
    return !!rol && rol !== 'CLIENTE';
  }

  get showPlanteamientos(): boolean {
    const rol = this.authService.getCurrentUser()?.rol;
    return !!rol && rol !== 'CLIENTE';
  }

  /** Historial de vinculaciones propias: solo para docentes. */
  get showMisVinculaciones(): boolean {
    return this.authService.getCurrentUser()?.rol === 'DOCENTE';
  }

  get showProyectos(): boolean {
    const rol = this.authService.getCurrentUser()?.rol;
    return !!rol && rol !== 'CLIENTE';
  }

  // Reportes excluye también a DOCENTE (no solo a CLIENTE): roles distintos
  // a los de los demás links, por eso no se reutiliza showUsuarios.
  get showReportes(): boolean {
    const rol = this.authService.getCurrentUser()?.rol;
    return ['ADMIN', 'GESTOR_VCM', 'ENCARGADO_CARRERA', 'DECANO', 'DIRECTOR_VCM'].includes(rol ?? '');
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
