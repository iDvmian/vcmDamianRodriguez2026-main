export interface Programa {
  id: number;
  nombre: string;
  descripcion?: string | null;
  /** Actividades clave del programa, una por línea. */
  actividades?: string | null;
  orden: number;
  activo: boolean;
  /** Solo en la vista de administración. */
  _count?: { solicitudes: number };
}
