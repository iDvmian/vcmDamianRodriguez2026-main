import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { NivelPlan, PlanEstrategico } from '../models/plan-estrategico.model';

@Injectable({ providedIn: 'root' })
export class PlanEstrategicoService {
  private readonly apiUrl = `${environment.apiUrl}/plan-estrategico`;

  constructor(private http: HttpClient) {}

  getMiFacultad(): Observable<{ id: number; nombre: string; etiqueta: string } | null> {
    return this.http.get<any>(`${this.apiUrl}/mi-facultad`).pipe(map((r) => r.data));
  }

  getPlanes(facultadId?: number | null): Observable<PlanEstrategico[]> {
    let params = new HttpParams();
    if (facultadId != null) params = params.set('facultadId', String(facultadId));
    return this.http.get<any>(`${this.apiUrl}/planes`, { params }).pipe(map((r) => r.data));
  }

  getPlan(id: number): Observable<PlanEstrategico> {
    return this.http.get<any>(`${this.apiUrl}/planes/${id}`).pipe(map((r) => r.data));
  }

  crearPlan(dto: { facultadId: number; periodo: string }): Observable<PlanEstrategico> {
    return this.http.post<any>(`${this.apiUrl}/planes`, dto).pipe(map((r) => r.data));
  }

  actualizarPlan(id: number, dto: { periodo: string }): Observable<PlanEstrategico> {
    return this.http.patch<any>(`${this.apiUrl}/planes/${id}`, dto).pipe(map((r) => r.data));
  }

  subirArchivoPlan(id: number, file: File): Observable<PlanEstrategico> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<any>(`${this.apiUrl}/planes/${id}/archivo`, form).pipe(map((r) => r.data));
  }

  quitarArchivoPlan(id: number): Observable<void> {
    return this.http.delete<any>(`${this.apiUrl}/planes/${id}/archivo`).pipe(map(() => undefined));
  }

  eliminarPlan(id: number): Observable<void> {
    return this.http.delete<any>(`${this.apiUrl}/planes/${id}`).pipe(map(() => undefined));
  }

  crearNodo(nivel: NivelPlan, dto: { padreId: number; descripcion: string; referenciaUcm?: string | null }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/nodos/${nivel}`, dto).pipe(map((r) => r.data));
  }

  actualizarNodo(nivel: NivelPlan, id: number, dto: { descripcion?: string; referenciaUcm?: string | null }): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/nodos/${nivel}/${id}`, dto).pipe(map((r) => r.data));
  }

  eliminarNodo(nivel: NivelPlan, id: number): Observable<void> {
    return this.http.delete<any>(`${this.apiUrl}/nodos/${nivel}/${id}`).pipe(map(() => undefined));
  }
}
