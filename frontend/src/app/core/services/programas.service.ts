import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Programa } from '../models/programa.model';

export interface ProgramaDto {
  nombre?: string;
  descripcion?: string | null;
  actividades?: string | null;
  orden?: number;
  activo?: boolean;
  facultadId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ProgramasService {
  private readonly apiUrl = `${environment.apiUrl}/programas`;

  constructor(private http: HttpClient) {}

  /** Programas vigentes (para elegir al crear una solicitud). */
  getProgramas(): Observable<Programa[]> {
    return this.http.get<any>(this.apiUrl).pipe(map((r) => r.data));
  }

  /** Todos, también los desactivados (administración). */
  getTodos(): Observable<Programa[]> {
    return this.http.get<any>(`${this.apiUrl}/admin`).pipe(map((r) => r.data));
  }

  crear(dto: ProgramaDto): Observable<Programa> {
    return this.http.post<any>(this.apiUrl, dto).pipe(map((r) => r.data));
  }

  actualizar(id: number, dto: ProgramaDto): Observable<Programa> {
    return this.http.patch<any>(`${this.apiUrl}/${id}`, dto).pipe(map((r) => r.data));
  }
}
