import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'vcm_token';
  private readonly USER_KEY = 'vcm_user';

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<any> {
    return this.http
      .post<any>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          console.log('Respuesta completa del backend:', res);
          const token = res?.access_token;
          const user = res?.user;
          if (token && user) {
            localStorage.setItem(this.TOKEN_KEY, token);
            localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            console.log('Token guardado correctamente:', token);
          } else {
            console.error('Estructura inesperada de respuesta:', res);
            throw new Error('Respuesta inválida del servidor');
          }
        })
      );
  }

  register(data: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/auth/register`, data);
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/reset-password`, { token, password });
  }

  /** Actualiza el usuario guardado en el navegador (p. ej. tras editar el perfil). */
  updateStoredUser(user: Partial<User>): void {
    const current = this.getCurrentUser();
    if (!current) return;
    localStorage.setItem(this.USER_KEY, JSON.stringify({ ...current, ...user }));
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem(this.TOKEN_KEY);
    return !!token;
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }
}
