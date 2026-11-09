/**
 * Datos de DEMOSTRACIÓN para probar el panel de indicadores.
 *
 * Uso (desde la carpeta backend):   node prisma/seed-demo.js
 * Para borrarlos después:           node prisma/borrar-demo.js
 *
 * Todo lo que crea queda marcado para poder borrarlo sin tocar datos reales:
 *   - usuarios y alumnos con correo @demo.vcm.test
 *   - solicitudes con el título que empieza con "[DEMO]"
 * Cada solicitud queda asociada a un programa de vinculación y a un alcance (regional, nacional o internacional).
 * Requiere las migraciones aplicadas (tabla de programas y campo alcance).
 * Contraseña de todos los usuarios demo: Demo1234
 */
try { require('dotenv').config(); } catch (_) { /* Prisma también lee el .env por su cuenta */ }
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ─── Cantidades ──────────────────────────────────────────────────────────────
const N_DOCENTES = 250;
const N_CLIENTES = 150;
const N_ALUMNOS = 40;
const N_SOLICITUDES = 450;

// ─── Generador pseudoaleatorio con semilla (resultados repetibles) ──────────
let seed = 20261026;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function pickWeighted(items) { // items: [valor, peso][]
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
  return items[items.length - 1][0];
}
const DIA = 24 * 60 * 60 * 1000;
const addDias = (d, n) => new Date(d.getTime() + n * DIA);

// ─── Utilidades de datos ─────────────────────────────────────────────────────
function dvRut(cuerpo) {
  let suma = 0, mult = 2;
  for (let i = String(cuerpo).length - 1; i >= 0; i--) {
    suma += Number(String(cuerpo)[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
const rutDe = (cuerpo) => `${cuerpo}-${dvRut(cuerpo)}`;

const NOMBRES = ['Juan','María','Pedro','Camila','Diego','Javiera','Matías','Constanza','Felipe','Valentina','Sebastián','Fernanda','Cristóbal','Catalina','Nicolás','Daniela','Rodrigo','Francisca','Andrés','Paulina','Ignacio','Carolina','Tomás','Alejandra','Gonzalo','Natalia','Pablo','Sofía','Claudio','Macarena','Héctor','Karina','Marcelo','Pamela','Ricardo','Verónica','Eduardo','Lorena','Luis','Patricia'];
const APELLIDOS = ['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela','Castillo','Tapia','Reyes','Gutiérrez','Castro','Pizarro','Álvarez','Vásquez','Sánchez','Fernández','Ramírez','Carrasco','Gómez','Cortés','Herrera','Núñez','Jara','Vergara','Rivera','Figueroa'];
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const COMUNAS = [
  ['Talca', 30], ['Curicó', 14], ['Linares', 12], ['Constitución', 6], ['Cauquenes', 5],
  ['San Clemente', 4], ['Maule', 4], ['Molina', 4], ['Parral', 3], ['San Javier', 3],
  ['Pelarco', 2], ['Colbún', 2], ['Teno', 2], ['Villa Alegre', 2], ['Longaví', 2],
  ['Río Claro', 1], ['Curepto', 1], ['Chanco', 1], ['Romeral', 1], ['Sagrada Familia', 1],
];

const pickW = pickWeighted;

// ─── Programas de vinculación y alcance territorial ─────────────────────────
// [nombre, peso, orden]: los programas más conocidos reciben más solicitudes
const PROGRAMAS = [
  ['KineTransForma', 6, 1], ['Comercio Justo para el Desarrollo Rural', 7, 2], ['Tejiendo Redes', 9, 3],
  ['Programa de Español para Migrantes', 5, 4], ['Club de Lectura del Adulto Mayor', 8, 5], ['Telecuidado UCM', 10, 6],
  ['Escuela de Formación Comunitaria', 9, 7], ['Prosalud UCM', 14, 8], ['Programa de Educación Rural', 12, 9],
  ['Akoluthía: Acompañando al Profesor de Religión en su Crecimiento Profesional', 4, 10],
  ['Convivencia Escolar Formando Líderes para el Cambio', 8, 11], ['Clínica Jurídica UCM', 6, 12],
  ['Jornadas de Didáctica de las Ciencias Experimentales', 4, 13],
];
// Comunas de otras regiones, para las solicitudes de alcance nacional
const COMUNAS_NACIONAL = [
  ['Metropolitana de Santiago', 5, ['Santiago', 'Maipú', 'Puente Alto', 'La Florida', 'Providencia', 'Ñuñoa']],
  ['Biobío', 4, ['Concepción', 'Los Ángeles', 'Talcahuano', 'Coronel']],
  ['Valparaíso', 3, ['Valparaíso', 'Viña del Mar', 'Quilpué', 'San Antonio']],
  ['Ñuble', 3, ['Chillán', 'San Carlos', 'Bulnes']],
  ["Libertador General Bernardo O'Higgins", 3, ['Rancagua', 'San Fernando', 'Rengo', 'Pichilemu']],
  ['La Araucanía', 2, ['Temuco', 'Villarrica', 'Angol']],
  ['Los Lagos', 1, ['Puerto Montt', 'Osorno', 'Castro']],
  ['Coquimbo', 1, ['La Serena', 'Coquimbo', 'Ovalle']],
  ['Antofagasta', 1, ['Antofagasta', 'Calama']],
];
// Países para las solicitudes de alcance internacional
const PAISES = [
  ['Argentina', 4, ['Mendoza', 'Buenos Aires', 'Neuquén']], ['Perú', 3, ['Lima', 'Arequipa']],
  ['Colombia', 2, ['Bogotá', 'Medellín']], ['España', 2, ['Madrid', 'Valencia']],
  ['México', 1, ['Ciudad de México', 'Guadalajara']], ['Ecuador', 1, ['Quito']],
];
/** Alcance de una solicitud: casi todas son regionales (comunas del Maule); algunas nacionales o internacionales. */
function ubicacionAleatoria(comunaMaule) {
  const alcance = pickW([['REGIONAL', 82], ['NACIONAL', 12], ['INTERNACIONAL', 6]]);
  if (alcance === 'NACIONAL') {
    const [region, , comunas] = pickW(COMUNAS_NACIONAL.map((r) => [r, r[1]]));
    return { alcance, region, pais: 'Chile', ciudad: pick(comunas) };
  }
  if (alcance === 'INTERNACIONAL') {
    const [pais, , ciudades] = pickW(PAISES.map((r) => [r, r[1]]));
    return { alcance, region: null, pais, ciudad: pick(ciudades) };
  }
  return { alcance, region: 'Maule', pais: 'Chile', ciudad: comunaMaule };
}
/** Se asegura que existan los programas (la migración ya los carga) y se devuelven con su id. */
async function cargarProgramas() {
  await prisma.programa.createMany({ data: PROGRAMAS.map(([nombre, , orden]) => ({ nombre, orden })), skipDuplicates: true });
  const filas = await prisma.programa.findMany({ select: { id: true, nombre: true } });
  const idDe = new Map(filas.map((f) => [f.nombre, f.id]));
  return PROGRAMAS.filter(([nombre]) => idDe.has(nombre)).map(([nombre, peso]) => [idDe.get(nombre), peso]);
}

const TIPOS = [
  ['CHARLA', 16], ['TALLER', 18], ['CURSO_CAPACITACION', 9], ['SEMINARIO', 7],
  ['ASESORIA_TECNICA', 14], ['OPERATIVO_TERRENO', 8], ['APRENDIZAJE_SERVICIO', 10],
  ['ACTIVIDAD_CULTURAL', 6], ['VOLUNTARIADO', 7], ['INVESTIGACION_APLICADA', 3], ['OTRO', 2],
];
const TIPO_TEXTO = {
  CHARLA: 'Charla', TALLER: 'Taller', CURSO_CAPACITACION: 'Curso de capacitación',
  SEMINARIO: 'Jornada', ASESORIA_TECNICA: 'Asesoría técnica', OPERATIVO_TERRENO: 'Operativo en terreno',
  APRENDIZAJE_SERVICIO: 'Proyecto de aprendizaje-servicio', ACTIVIDAD_CULTURAL: 'Actividad cultural',
  VOLUNTARIADO: 'Voluntariado', INVESTIGACION_APLICADA: 'Estudio aplicado', OTRO: 'Actividad',
};
const TEMAS = ['alfabetización digital','uso de energías renovables','automatización de procesos','seguridad informática','electrónica básica','robótica educativa','gestión de residuos','eficiencia energética','programación para jóvenes','mantención de equipos','diseño de redes','emprendimiento tecnológico','domótica','internet de las cosas','proyectos eléctricos domiciliarios'];
const UNIDADES = ['DIAS', 'SEMANAS', 'MESES'];
const UNIDAD_TEXTO = { DIAS: ['día', 'días'], SEMANAS: ['semana', 'semanas'], MESES: ['mes', 'meses'] };
const UNIDAD_DIAS = { DIAS: 1, SEMANAS: 7, MESES: 30 };

async function main() {
  const yaHay = await prisma.user.count({ where: { email: { endsWith: '@demo.vcm.test' } } });
  if (yaHay > 0) {
    console.log(`Ya existen ${yaHay} usuarios demo. Ejecuta primero: node prisma/borrar-demo.js`);
    return;
  }

  const carreras = await prisma.carrera.findMany({ select: { id: true } });
  if (!carreras.length) {
    console.log('No hay carreras en la base de datos. Crea al menos una carrera y vuelve a ejecutar.');
    return;
  }
  const carreraIds = carreras.map((c) => c.id);
  // algunas carreras concentran más actividad
  const carreraPeso = carreraIds.map((id, i) => [id, Math.max(1, carreraIds.length - i)]);

  const ahora = new Date();
  const passwordHash = await bcrypt.hash('Demo1234', 10);

  const persona = (i, base) => {
    const nombres = `${pick(NOMBRES)}${rand() < 0.3 ? ' ' + pick(NOMBRES) : ''}`;
    const a1 = pick(APELLIDOS), a2 = pick(APELLIDOS);
    return { nombres, apellidos: `${a1} ${a2}`, correoBase: sinTildes(`${nombres.split(' ')[0]}.${a1}`).replace(/\s/g, '') + i, rut: null };
  };

  // ── Usuarios: docentes y clientes ─────────────────────────────────────────
  const usuarios = [];
  for (let i = 1; i <= N_DOCENTES; i++) {
    const p = persona(i);
    usuarios.push({
      rut: rutDe(70000000 + i * 13), nombres: p.nombres, apellidos: p.apellidos,
      email: `docente${i}@demo.vcm.test`, telefono: `+569${int(10000000, 99999999)}`,
      password: passwordHash, rol: 'DOCENTE', carreraId: pickWeighted(carreraPeso),
    });
  }
  for (let i = 1; i <= N_CLIENTES; i++) {
    const p = persona(i);
    usuarios.push({
      rut: rutDe(80000000 + i * 17), nombres: p.nombres, apellidos: p.apellidos,
      email: `cliente${i}@demo.vcm.test`, telefono: `+569${int(10000000, 99999999)}`,
      password: passwordHash, rol: 'CLIENTE', carreraId: null,
    });
  }
  await prisma.user.createMany({ data: usuarios, skipDuplicates: true });

  const docentes = await prisma.user.findMany({
    where: { email: { startsWith: 'docente', endsWith: '@demo.vcm.test' } }, select: { id: true },
  });
  const clientes = await prisma.user.findMany({
    where: { email: { startsWith: 'cliente', endsWith: '@demo.vcm.test' } }, select: { id: true },
  });

  // ── Alumnos voluntarios ───────────────────────────────────────────────────
  const alumnosData = [];
  for (let i = 1; i <= N_ALUMNOS; i++) {
    const p = persona(i);
    alumnosData.push({
      rut: rutDe(90000000 + i * 19), nombres: p.nombres, apellidos: p.apellidos,
      email: `alumno${i}@demo.vcm.test`, telefono: `+569${int(10000000, 99999999)}`,
      carreraId: pickWeighted(carreraPeso),
    });
  }
  await prisma.alumnoVoluntario.createMany({ data: alumnosData, skipDuplicates: true });
  const alumnos = await prisma.alumnoVoluntario.findMany({
    where: { email: { endsWith: '@demo.vcm.test' } }, select: { id: true },
  });

  // ── Solicitudes ───────────────────────────────────────────────────────────
  const programas = await cargarProgramas();
  const solicitudesData = [];
  for (let i = 1; i <= N_SOLICITUDES; i++) {
    const ub = ubicacionAleatoria(pickWeighted(COMUNAS));
    const ciudad = ub.ciudad;
    // más solicitudes en los meses recientes (tendencia de crecimiento)
    const dias = Math.floor(420 * (1 - Math.sqrt(rand())));
    const createdAt = addDias(ahora, -dias - rand());
    const estado = pickWeighted([['APROBADA', 70], ['PENDIENTE', 15], ['RECHAZADA', 15]]);
    const updatedAt = estado === 'PENDIENTE' ? createdAt : addDias(createdAt, int(1, 18));
    solicitudesData.push({
      titulo: `[DEMO] ${pick(['Apoyo en','Capacitación en','Taller de','Asesoría en','Charla sobre'])} ${pick(TEMAS)} - ${ciudad} (${i})`,
      descripcion: `Solicitud de demostración. La organización requiere apoyo en ${pick(TEMAS)} para beneficiarios de ${ciudad}.`,
      programaId: pickW(programas),
      alcance: ub.alcance, ciudad, region: ub.region, pais: ub.pais,
      direccion: `Calle ${int(1, 99)}`, numeroDireccion: String(int(10, 2999)),
      telefono: `+569${int(10000000, 99999999)}`,
      estado, carreraId: pickWeighted(carreraPeso), clienteId: pick(clientes).id,
      createdAt, updatedAt,
    });
  }
  await prisma.solicitud.createMany({ data: solicitudesData });
  const solicitudes = await prisma.solicitud.findMany({
    where: { titulo: { startsWith: '[DEMO]' }, estado: 'APROBADA' },
    select: { id: true, createdAt: true },
  });

  // ── Planteamientos (de las solicitudes aprobadas) ─────────────────────────
  const plantData = [];
  for (const s of solicitudes) {
    const tipo = pickWeighted(TIPOS);
    const unidad = pickWeighted([['DIAS', 25], ['SEMANAS', 45], ['MESES', 30]]);
    const cantidad = unidad === 'DIAS' ? int(1, 20) : unidad === 'SEMANAS' ? int(1, 12) : int(1, 6);
    const [sing, plur] = UNIDAD_TEXTO[unidad];
    const createdAt = addDias(s.createdAt, int(2, 12));
    const docente = docentes[Math.floor(docentes.length * Math.pow(rand(), 1.8))]; // pocos docentes muy activos
    plantData.push({
      descripcion: `Propuesta de demostración: ${TIPO_TEXTO[tipo]} sobre ${pick(TEMAS)}.`,
      tiempoEstimado: `${cantidad} ${cantidad === 1 ? sing : plur}`,
      duracionCantidad: cantidad, duracionUnidad: unidad,
      horasHombre: int(8, 420), tipoIntervencion: tipo,
      tipoIntervencionOtro: tipo === 'OTRO' ? 'Mentoría grupal' : null,
      estado: pickWeighted([['APROBADO', 78], ['PENDIENTE', 12], ['RECHAZADO', 10]]),
      solicitudId: s.id, docenteId: docente.id, createdAt, updatedAt: createdAt,
    });
  }
  await prisma.planteamiento.createMany({ data: plantData });
  const aprobados = await prisma.planteamiento.findMany({
    where: { estado: 'APROBADO', solicitud: { titulo: { startsWith: '[DEMO]' } } },
    select: { id: true, createdAt: true, duracionCantidad: true, duracionUnidad: true },
  });

  // ── Proyectos (de los planteamientos aprobados) ───────────────────────────
  const proyData = [];
  for (const p of aprobados) {
    const fechaInicio = addDias(p.createdAt, int(3, 15));
    const fechaFin = addDias(fechaInicio, Math.max(1, p.duracionCantidad * UNIDAD_DIAS[p.duracionUnidad] + int(-2, 10)));
    let estado = pickWeighted([['FINALIZADO', 45], ['EN_PROCESO', 30], ['PAUSADO', 10], ['CANCELADO', 15]]);
    if (estado === 'FINALIZADO' && fechaFin > ahora) estado = 'EN_PROCESO'; // no se finaliza en el futuro
    proyData.push({
      estado, fechaInicio, fechaFin,
      participantesDocentes: int(1, 6), participantesEstudiantes: int(3, 45), participantesDocentesExternos: int(0, 12), participantesAlumnosExternos: int(5, 100), participantesOtrosExternos: int(0, 60),
      planteamientoId: p.id, createdAt: fechaInicio, updatedAt: fechaInicio,
    });
  }
  await prisma.proyecto.createMany({ data: proyData });
  const proyectos = await prisma.proyecto.findMany({
    where: { planteamiento: { solicitud: { titulo: { startsWith: '[DEMO]' } } } },
    select: { id: true },
  });

  // ── Alumnos voluntarios por proyecto ──────────────────────────────────────
  const paData = [];
  for (const pr of proyectos) {
    const n = int(1, 5);
    const usados = new Set();
    for (let k = 0; k < n; k++) {
      const a = alumnos[Math.floor(alumnos.length * Math.pow(rand(), 1.4))];
      if (!usados.has(a.id)) { usados.add(a.id); paData.push({ proyectoId: pr.id, alumnoId: a.id }); }
    }
  }
  await prisma.proyectoAlumno.createMany({ data: paData, skipDuplicates: true });

  console.log('Datos demo creados:');
  console.log(`  Docentes:            ${docentes.length}`);
  console.log(`  Clientes:            ${clientes.length}`);
  console.log(`  Alumnos voluntarios: ${alumnos.length}`);
  console.log(`  Solicitudes:         ${N_SOLICITUDES}`);
  console.log(`  Planteamientos:      ${plantData.length}`);
  console.log(`  Proyectos:           ${proyData.length}`);
  console.log('Contraseña de los usuarios demo: Demo1234');
}

main()
  .catch((e) => { console.error('Error al crear datos demo:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
