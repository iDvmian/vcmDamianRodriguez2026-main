export interface Programa {
  id: number;
  nombre: string;
  descripcion?: string | null;
  /** Actividades clave del programa, una por línea. */
  actividades?: string | null;
  orden: number;
  activo: boolean;
  /** Facultad a la que pertenece el programa. */
  facultadId?: number | null;
  facultad?: { id: number; nombre: string; etiqueta: string } | null;
  /** Solo en la vista de administración. */
  _count?: { solicitudes: number };
}
