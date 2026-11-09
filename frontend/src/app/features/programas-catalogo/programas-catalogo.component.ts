import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProgramasService } from '../../core/services/programas.service';
import { AuthService } from '../../core/services/auth.service';
import { Programa } from '../../core/models/programa.model';

@Component({
  selector: 'app-programas-catalogo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './programas-catalogo.component.html',
  styleUrl: './programas-catalogo.component.scss',
})
export class ProgramasCatalogoComponent implements OnInit {
  programas: Programa[] = [];
  loading = true;
  error = false;
  busqueda = '';

  private cdr = inject(ChangeDetectorRef);

  constructor(private service: ProgramasService, private authService: AuthService) {}

  /** Quienes administran los programas ven un acceso para editarlos. */
  get puedeAdministrar(): boolean {
    return ['ADMIN', 'GESTOR_VCM', 'DIRECTOR_VCM'].includes(this.authService.getCurrentUser()?.rol ?? '');
  }

  get filtrados(): Programa[] {
    const q = this.normalizar(this.busqueda);
    if (!q) return this.programas;
    return this.programas.filter((p) => this.normalizar(`${p.nombre} ${p.descripcion ?? ''} ${p.actividades ?? ''}`).includes(q));
  }

  ngOnInit(): void {
    this.service.getProgramas().subscribe({
      next: (p) => {
        this.programas = p;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = true;
        this.cdr.detectChanges();
      },
    });
  }

  actividadesDe(p: Programa): string[] {
    return (p.actividades ?? '').split('\n').map((a) => a.trim()).filter(Boolean);
  }

  private normalizar(t: string): string {
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
}
