/** Las 16 regiones de Chile. */
export const REGIONES_CHILE: string[] = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso',
  'Metropolitana de Santiago', 'Libertador General Bernardo O\'Higgins', 'Maule', 'Ñuble', 'Biobío',
  'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén del General Carlos Ibáñez del Campo',
  'Magallanes y de la Antártica Chilena',
];

/** Regiones para vinculaciones de alcance nacional (la del Maule es regional). */
export const REGIONES_FUERA_DEL_MAULE: string[] = REGIONES_CHILE.filter((r) => r !== 'Maule');
