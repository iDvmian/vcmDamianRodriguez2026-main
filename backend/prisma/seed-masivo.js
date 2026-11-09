/**
 * RESET TOTAL + DATOS MASIVOS de demostración.
 *
 * ¡DESTRUCTIVO! Borra TODOS los datos (solicitudes, planteamientos, proyectos, alumnos,
 * usuarios, carreras y facultades). Solo se conservan las cuentas con rol ADMIN
 * (si no hay ninguna, se crea admin@demo.vcm.test).
 *
 * Uso (desde la carpeta backend, con las migraciones ya aplicadas):
 *     node prisma/seed-masivo.js --confirmar
 *
 * Crea: 7 facultades con sus carreras, 1 decano por facultad, 1 director de VCM,
 * gestores, 1 encargado por carrera, docentes, clientes, 150 alumnos voluntarios y
 * 600 solicitudes repartidas en planteamientos y proyectos (con historial de seguimiento).
 * Cada solicitud queda asociada a uno de los programas de vinculación y a un alcance
 * (regional, nacional o internacional). Los programas no se borran.
 * Contraseña de todos los usuarios creados: Demo1234
 */
try { require('dotenv').config(); } catch (_) {}
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const N_SOLICITUDES = 600;
const N_ALUMNOS = 150;
const N_CLIENTES = 220;
const DOCENTES_POR_CARRERA = 4;
const N_GESTORES = 3;

if (!process.argv.includes('--confirmar')) {
  console.log('Este script BORRA TODOS LOS DATOS de la base. Para continuar ejecuta:\n  node prisma/seed-masivo.js --confirmar');
  process.exit(0);
}

// ─── Aleatorio con semilla ───────────────────────────────────────────────────
let seed = 20261027;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function pickW(items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
  return items[items.length - 1][0];
}
const DIA = 86400000;
const addDias = (d, n) => new Date(d.getTime() + n * DIA);
const chunk = (arr, n = 1000) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
async function bulk(model, data) { for (const c of chunk(data)) await prisma[model].createMany({ data: c }); }

function dvRut(cuerpo) {
  let suma = 0, mult = 2;
  for (let i = String(cuerpo).length - 1; i >= 0; i--) { suma += Number(String(cuerpo)[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
const rutDe = (c) => `${c}-${dvRut(c)}`;
const tel = () => `+569${int(10000000, 99999999)}`;

const NOMBRES = ['Juan','María','Pedro','Camila','Diego','Javiera','Matías','Constanza','Felipe','Valentina','Sebastián','Fernanda','Cristóbal','Catalina','Nicolás','Daniela','Rodrigo','Francisca','Andrés','Paulina','Ignacio','Carolina','Tomás','Alejandra','Gonzalo','Natalia','Pablo','Sofía','Claudio','Macarena','Héctor','Karina','Marcelo','Pamela','Ricardo','Verónica','Eduardo','Lorena','Luis','Patricia'];
const APELLIDOS = ['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela','Castillo','Tapia','Reyes','Gutiérrez','Castro','Pizarro','Álvarez','Vásquez','Sánchez','Fernández','Ramírez','Carrasco','Gómez','Cortés','Herrera','Núñez','Jara','Vergara','Rivera','Figueroa'];
const persona = () => ({ nombres: pick(NOMBRES), apellidos: `${pick(APELLIDOS)} ${pick(APELLIDOS)}` });

// ─── Facultades y carreras ───────────────────────────────────────────────────
const FACULTADES = [
  { nombre: 'Facultad de Ciencias de la Salud', etiqueta: 'FCS', decano: ['Mauricio','Lagos Pinto'], carreras: [
    ['Enfermería','ENF'],['Kinesiología','KIN'],['Nutrición y Dietética','NUT'],['Fonoaudiología','FON'],['Obstetricia y Puericultura','OBS'],['Medicina','MED'],['Tecnología Médica','TMED'],['Terapia Ocupacional','TOC'],['Odontología','ODO']] },
  { nombre: 'Facultad de Ciencias Agrarias y Forestales', etiqueta: 'FCAF', decano: ['Roberto','Alarcón Tobar'], carreras: [
    ['Agronomía','AGR'],['Ingeniería Forestal','FOR'],['Ingeniería en Recursos Naturales Renovables','IRNR'],['Medicina Veterinaria','VET'],['Ingeniería en Producción Agroindustrial','IPA'],['Ingeniería en Viticultura y Enología','VIT']] },
  { nombre: 'Facultad de Ciencias Básicas', etiqueta: 'FCB', decano: ['Patricio','Meza Aravena'], carreras: [
    ['Química y Farmacia','QYF'],['Bioquímica','BQ'],['Biotecnología','BIOT'],['Licenciatura en Física','FIS'],['Licenciatura en Matemática','MAT'],['Ingeniería en Estadística','EST'],['Licenciatura en Química','QUI']] },
  { nombre: 'Facultad de Ciencias de la Ingeniería', etiqueta: 'FCI', decano: ['Álvaro','Cerda Bravo'], carreras: [
    ['Ingeniería Civil Industrial','ICI'],['Ingeniería Civil Informática','INF'],['Ingeniería Civil Mecánica','ICM'],['Ingeniería Civil Eléctrica','ICE'],['Ingeniería Civil en Obras Civiles','ICO'],['Ingeniería en Construcción','CON'],['Ingeniería Civil en Minas','IMIN'],['Ingeniería Civil Química','IQ'],['Ingeniería en Prevención de Riesgos','PRE']] },
  { nombre: 'Facultad de Ciencias Religiosas y Filosóficas', etiqueta: 'FCRF', decano: ['Joaquín','Paredes Salinas'], carreras: [
    ['Pedagogía en Religión','PRE-REL'],['Teología','TEO'],['Licenciatura en Filosofía','FIL'],['Licenciatura en Ciencias Religiosas','LCR']] },
  { nombre: 'Facultad de Ciencias Sociales y Económicas', etiqueta: 'FCSE', decano: ['Gustavo','Ibáñez Cornejo'], carreras: [
    ['Trabajo Social','TSO'],['Psicología','PSI'],['Derecho','DER'],['Contador Público y Auditor','CPA'],['Ingeniería Comercial','ICOM'],['Administración Pública','ADP'],['Sociología','SOC'],['Periodismo','PER'],['Ingeniería en Gestión Turística','TUR'],['Publicidad','PUB']] },
  { nombre: 'Facultad de Ciencias de la Educación', etiqueta: 'FCE', decano: ['Hernán','Villalobos Ortiz'], carreras: [
    ['Pedagogía en Educación Parvularia','EPA'],['Pedagogía en Educación Básica','EBA'],['Pedagogía en Educación Media en Matemática','PMAT'],['Pedagogía en Educación Media en Lenguaje y Comunicación','PLEN'],['Pedagogía en Educación Física','PEF'],['Pedagogía en Inglés','PING'],['Pedagogía en Educación Diferencial','PDIF'],['Pedagogía en Historia y Geografía','PHG']] },
];
const COMUNAS = [['Talca',30],['Curicó',14],['Linares',12],['Constitución',6],['Cauquenes',5],['San Clemente',4],['Maule',4],['Molina',4],['Parral',3],['San Javier',3],['Pelarco',2],['Colbún',2],['Teno',2],['Villa Alegre',2],['Longaví',2],['Río Claro',1],['Curepto',1],['Chanco',1],['Romeral',1],['Sagrada Familia',1],['Empedrado',1],['Pencahue',1]];
const TIPOS_CLIENTE = [['JUNTA_VECINOS',22],['ONG',14],['ESTABLECIMIENTO_EDUCACIONAL',24],['EMPRESA_PRIVADA',10],['ORGANISMO_PUBLICO',14],['PERSONA_NATURAL',10],['OTRO',6]];
const ORG = {
  JUNTA_VECINOS: ['Junta de Vecinos','Villa','Población'],
  ONG: ['Fundación','Corporación','Agrupación'],
  ESTABLECIMIENTO_EDUCACIONAL: ['Escuela','Liceo','Colegio','Jardín Infantil'],
  EMPRESA_PRIVADA: ['Agrícola','Comercial','Constructora','Servicios'],
  ORGANISMO_PUBLICO: ['Municipalidad de','CESFAM','Servicio Local de'],
  PERSONA_NATURAL: [''], OTRO: ['Club','Comité','Cooperativa'],
};
const NOM_ORG = ['Los Aromos','El Maitén','Las Rosas','San Miguel','Esperanza','Nueva Aurora','Los Copihues','Santa Marta','El Roble','Vista Hermosa','Los Olivos','Villa Futuro','Andalién','Rayén','Mirador del Maule','Los Notros','Alborada','Piedra Azul'];
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

const TIPOS = [['CHARLA',16],['TALLER',18],['CURSO_CAPACITACION',9],['SEMINARIO',7],['ASESORIA_TECNICA',14],['OPERATIVO_TERRENO',8],['APRENDIZAJE_SERVICIO',10],['ACTIVIDAD_CULTURAL',6],['VOLUNTARIADO',7],['INVESTIGACION_APLICADA',3],['OTRO',2]];
const TIPO_TEXTO = { CHARLA:'Charla', TALLER:'Taller', CURSO_CAPACITACION:'Curso de capacitación', SEMINARIO:'Jornada', ASESORIA_TECNICA:'Asesoría técnica', OPERATIVO_TERRENO:'Operativo en terreno', APRENDIZAJE_SERVICIO:'Proyecto de aprendizaje-servicio', ACTIVIDAD_CULTURAL:'Actividad cultural', VOLUNTARIADO:'Voluntariado', INVESTIGACION_APLICADA:'Estudio aplicado', OTRO:'Actividad' };
const TEMAS = ['salud preventiva','alfabetización digital','energías renovables','educación financiera','manejo de residuos','huertos comunitarios','primeros auxilios','nutrición infantil','orientación vocacional','derechos y deberes ciudadanos','seguridad en el hogar','apoyo escolar','envejecimiento activo','emprendimiento local','salud mental comunitaria','comprensión lectora','cuidado del agua','buenas prácticas agrícolas','ergonomía laboral','ciberseguridad básica','arte y expresión','deporte y vida saludable','mediación y convivencia','asesoría legal básica'];
const MOTIVOS_SOL = ['La iniciativa excede la capacidad actual de la carrera.','Falta información para evaluar la solicitud; se sugiere reenviarla con más detalle.','No corresponde al ámbito de vinculación con el medio de la universidad.','Ya existe una iniciativa similar en ejecución con el mismo solicitante.','No hay docentes disponibles este semestre para atender la solicitud.'];
const MOTIVOS_PLA = ['La duración propuesta no es compatible con el calendario académico.','Se requiere detallar mejor los recursos y el equipo participante.','Las horas estimadas no se ajustan al alcance descrito.','El planteamiento no explicita los resultados esperados para la comunidad.'];
const OBSERVACIONES = ['Se realizó la primera visita a terreno sin inconvenientes.','Los estudiantes completaron la planificación de actividades.','Se coordinó con el solicitante el cambio de fecha de la sesión.','Alta asistencia de la comunidad en la última jornada.','Se entregó material de apoyo impreso a los participantes.','Pendiente la autorización de acceso al recinto; se reprograma.','Se aplicó encuesta de satisfacción con buenos resultados.','Se incorporaron dos estudiantes voluntarios adicionales.','Se detectó la necesidad de una sesión de refuerzo.'];

async function main() {
  const ahora = new Date();
  const hash = await bcrypt.hash('Demo1234', 10);

  // ── 1. Reset ────────────────────────────────────────────────────────────────
  console.log('Borrando datos actuales...');
  for (const m of ['observacion','archivoProyecto','proyectoAlumno','proyecto','archivoPlanteamiento','planteamiento','archivoSolicitud','historialEtapa','solicitud','registroDepuracion','alumnoVoluntario']) {
    await prisma[m].deleteMany({});
  }
  await prisma.user.deleteMany({ where: { rol: { not: 'ADMIN' } } });
  await prisma.user.updateMany({ where: { rol: 'ADMIN' }, data: { carreraId: null, facultadId: null } });
  await prisma.carrera.deleteMany({});
  await prisma.facultad.deleteMany({});
  if (!(await prisma.user.count({ where: { rol: 'ADMIN' } }))) {
    await prisma.user.create({ data: { rut: rutDe(10000001), nombres: 'Administrador', apellidos: 'Sistema', email: 'admin@demo.vcm.test', telefono: tel(), password: hash, rol: 'ADMIN' } });
    console.log('Se creó el administrador admin@demo.vcm.test');
  }

  // ── 2. Facultades, carreras, autoridades ────────────────────────────────────
  const carreras = []; // {id, facultadId, nombre}
  let nUser = 0;
  const usuarios = [];
  const nuevoUsuario = (rol, base, extra = {}, nombre) => {
    nUser++;
    const p = nombre ? { nombres: nombre[0], apellidos: nombre[1] } : persona();
    usuarios.push({ rut: rutDe(base + nUser * 7), nombres: p.nombres, apellidos: p.apellidos, email: `${rol.toLowerCase()}${nUser}@demo.vcm.test`, telefono: tel(), password: hash, rol, ...extra });
  };

  const decanosPorFac = [];
  for (const f of FACULTADES) {
    const fac = await prisma.facultad.create({ data: { nombre: f.nombre, etiqueta: f.etiqueta } });
    for (const [nombre, etiqueta] of f.carreras) {
      const c = await prisma.carrera.create({ data: { nombre, etiqueta, facultadId: fac.id } });
      carreras.push({ id: c.id, facultadId: fac.id, nombre });
    }
    decanosPorFac.push({ facId: fac.id, nombre: f.decano });
  }
  for (const d of decanosPorFac) nuevoUsuario('DECANO', 20000000, { facultadId: d.facId }, d.nombre);
  nuevoUsuario('DIRECTOR_VCM', 21000000, {}, ['Marcela', 'Toranzo Bustos']);
  for (let i = 0; i < N_GESTORES; i++) nuevoUsuario('GESTOR_VCM', 22000000);
  for (const c of carreras) {
    nuevoUsuario('ENCARGADO_CARRERA', 30000000, { carreraId: c.id });
    for (let j = 0; j < DOCENTES_POR_CARRERA; j++) nuevoUsuario('DOCENTE', 40000000, { carreraId: c.id });
  }
  for (let i = 0; i < N_CLIENTES; i++) nuevoUsuario('CLIENTE', 60000000);
  await bulk('user', usuarios);

  const todos = await prisma.user.findMany({ select: { id: true, rol: true, carreraId: true } });
  const gestores = todos.filter((u) => u.rol === 'GESTOR_VCM').map((u) => u.id);
  const encargadoDe = new Map(todos.filter((u) => u.rol === 'ENCARGADO_CARRERA').map((u) => [u.carreraId, u.id]));
  const docentesDe = new Map();
  for (const u of todos.filter((u) => u.rol === 'DOCENTE')) {
    if (!docentesDe.has(u.carreraId)) docentesDe.set(u.carreraId, []);
    docentesDe.get(u.carreraId).push(u.id);
  }
  const clientes = todos.filter((u) => u.rol === 'CLIENTE').map((u) => u.id);

  // ── 3. Alumnos voluntarios ──────────────────────────────────────────────────
  const alumnosData = [];
  for (let i = 1; i <= N_ALUMNOS; i++) {
    const p = persona();
    alumnosData.push({ rut: rutDe(19000000 + i * 11), nombres: p.nombres, apellidos: p.apellidos, email: `alumno${i}@demo.vcm.test`, telefono: tel(), carreraId: pick(carreras).id, estado: rand() > 0.07 });
  }
  await bulk('alumnoVoluntario', alumnosData);
  const alumnos = await prisma.alumnoVoluntario.findMany({ select: { id: true, carreraId: true, estado: true } });
  const alumnosDe = new Map();
  for (const a of alumnos.filter((a) => a.estado)) {
    if (!alumnosDe.has(a.carreraId)) alumnosDe.set(a.carreraId, []);
    alumnosDe.get(a.carreraId).push(a.id);
  }

  // ── 4. Cadena solicitud → planteamiento → proyecto ──────────────────────────
  const programas = await cargarProgramas();
  // Carreras con más actividad: ingeniería, salud, educación...
  const pesoCarrera = carreras.map((c, i) => [c, 1 + ((i * 7) % 5)]);
  const planes = []; // un plan por solicitud
  for (let i = 0; i < N_SOLICITUDES; i++) {
    const carrera = pickW(pesoCarrera);
    const origenDocente = rand() < 0.12;
    const tipoCliente = origenDocente ? 'OTRO' : pickW(TIPOS_CLIENTE);
    const ub = ubicacionAleatoria(pickW(COMUNAS));
    const ciudad = ub.ciudad;
    const programaId = pickW(programas);
    const tipoInt = pickW(TIPOS);
    const tema = pick(TEMAS);
    const pref = pick(ORG[tipoCliente]);
    const nombreOrg = origenDocente ? `Comunidad de ${ciudad}` : (tipoCliente === 'PERSONA_NATURAL' ? null : `${pref} ${pickW([[pick(NOM_ORG), 1]])}`.trim());

    // resultado final de la cadena
    let sol = pickW([['PENDIENTE', 11], ['RECHAZADA', 11], ['APROBADA', 78]]);
    let pla = null, pro = null;
    if (sol === 'APROBADA') {
      pla = pickW([['NONE', 9], ['PENDIENTE', 9], ['RECHAZADO', 9], ['APROBADO', 73]]);
      if (pla === 'NONE') pla = null;
      if (pla === 'APROBADO') pro = pickW([['NONE', 8], ['EN_PROCESO', 24], ['PAUSADO', 7], ['FINALIZADO', 50], ['CANCELADO', 11]]);
      if (pro === 'NONE') pro = null;
    }
    // fecha de creación: lo "en curso" es reciente; lo cerrado se reparte en ~4,4 años
    const reciente = sol === 'PENDIENTE' || pla === 'PENDIENTE' || pla === null && sol === 'APROBADA' || pro === 'EN_PROCESO' || pro === 'PAUSADO' || pro === null && pla === 'APROBADO';
    const dias = reciente ? int(3, 130) : Math.floor(150 + Math.pow(rand(), 0.8) * 1450);
    planes.push({ i, carrera, origenDocente, tipoCliente, ciudad, ub, programaId, tipoInt, tema, nombreOrg, sol, pla, pro, creada: addDias(ahora, -dias) });
  }

  const solData = planes.map((p) => {
    const docs = docentesDe.get(p.carrera.id);
    const clienteId = p.origenDocente ? pick(docs) : pick(clientes);
    p.clienteId = clienteId;
    const rechazada = p.sol === 'RECHAZADA';
    return {
      titulo: `${TIPO_TEXTO[p.tipoInt]} de ${p.tema} en ${p.ciudad} (${p.i + 1})`,
      descripcion: `Se solicita apoyo de la universidad para realizar una actividad sobre ${p.tema} dirigida a la comunidad de ${p.ciudad}. ${p.nombreOrg ? 'La solicitud proviene de ' + p.nombreOrg + '. ' : ''}Se espera contar con estudiantes y docentes que acompañen el proceso.`,
      programaId: p.programaId, alcance: p.ub.alcance, region: p.ub.region, pais: p.ub.pais,
      ciudad: p.ciudad, direccion: `Calle ${pick(APELLIDOS)}`, numeroDireccion: String(int(10, 2500)), telefono: tel(),
      estado: p.sol, motivoRechazo: rechazada ? pick(MOTIVOS_SOL) : null,
      tipoCliente: p.tipoCliente, tipoClienteOtro: p.tipoCliente === 'OTRO' && !p.origenDocente ? 'Comité vecinal' : null,
      origen: p.origenDocente ? 'DOCENTE' : 'EXTERNA',
      nombreOrganizacion: p.origenDocente ? p.nombreOrg : null,
      personasPrevistas: p.origenDocente ? int(10, 120) : null,
      carreraId: p.carrera.id, clienteId, createdAt: p.creada, updatedAt: p.creada,
    };
  });
  await bulk('solicitud', solData);
  const solicitudes = await prisma.solicitud.findMany({ orderBy: { id: 'asc' }, select: { id: true, titulo: true } });
  if (solicitudes.length !== planes.length || solicitudes.some((s, k) => s.titulo !== solData[k].titulo)) throw new Error('Las solicitudes no coinciden con lo esperado');
  planes.forEach((p, k) => { p.solicitudId = solicitudes[k].id; });

  const historial = [];
  const hist = (p, etapa, fecha, usuarioId) => historial.push({ solicitudId: p.solicitudId, etapa, fecha: fecha > ahora ? ahora : fecha, usuarioId });

  // solicitudes → historial
  for (const p of planes) {
    hist(p, 'SOLICITUD_CREADA', p.creada, p.clienteId);
    if (p.sol !== 'PENDIENTE') {
      p.fSol = addDias(p.creada, int(1, 6));
      hist(p, p.sol === 'APROBADA' ? 'SOLICITUD_APROBADA' : 'SOLICITUD_RECHAZADA', p.fSol, pick(gestores));
    }
  }

  // planteamientos
  const plaData = [];
  for (const p of planes.filter((p) => p.pla)) {
    const unidad = pickW([['DIAS', 20], ['SEMANAS', 45], ['MESES', 35]]);
    const cant = unidad === 'DIAS' ? int(1, 20) : unidad === 'SEMANAS' ? int(2, 14) : int(1, 6);
    p.duracionDias = cant * (unidad === 'DIAS' ? 1 : unidad === 'SEMANAS' ? 7 : 30);
    p.docenteId = pick(docentesDe.get(p.carrera.id));
    p.fPla = addDias(p.fSol, int(2, 12));
    plaData.push({
      descripcion: `Se propone una intervención de tipo ${TIPO_TEXTO[p.tipoInt].toLowerCase()} sobre ${p.tema}, con sesiones planificadas, material de apoyo y evaluación final con el solicitante.`,
      tiempoEstimado: `${cant} ${unidad === 'DIAS' ? 'días' : unidad === 'SEMANAS' ? 'semanas' : 'meses'}`,
      duracionCantidad: cant, duracionUnidad: unidad, horasHombre: int(8, 240),
      tipoIntervencion: p.tipoInt, tipoIntervencionOtro: p.tipoInt === 'OTRO' ? 'Actividad comunitaria mixta' : null,
      estado: p.pla, motivoRechazo: p.pla === 'RECHAZADO' ? pick(MOTIVOS_PLA) : null,
      solicitudId: p.solicitudId, docenteId: p.docenteId, createdAt: p.fPla, updatedAt: p.fPla,
    });
    hist(p, 'PLANTEAMIENTO_CREADO', p.fPla, p.docenteId);
    if (p.pla !== 'PENDIENTE') {
      p.fAprPla = addDias(p.fPla, int(1, 8));
      hist(p, p.pla === 'APROBADO' ? 'PLANTEAMIENTO_APROBADO' : 'PLANTEAMIENTO_RECHAZADO', p.fAprPla, encargadoDe.get(p.carrera.id));
    }
  }
  await bulk('planteamiento', plaData);
  const plas = await prisma.planteamiento.findMany({ select: { id: true, solicitudId: true } });
  const plaPorSol = new Map(plas.map((x) => [x.solicitudId, x.id]));

  // proyectos
  const proData = [];
  const conProyecto = planes.filter((p) => p.pro);
  for (const p of conProyecto) {
    let ini = addDias(p.fAprPla, int(3, 20));
    let fin = addDias(ini, Math.max(3, p.duracionDias + int(-3, 15)));
    if (p.pro === 'FINALIZADO' || p.pro === 'CANCELADO') {
      if (fin > addDias(ahora, -1)) fin = addDias(ahora, -1);
      if (ini > addDias(fin, -2)) ini = addDias(fin, -Math.max(2, Math.min(p.duracionDias, 60)));
    } else if (fin < addDias(ahora, 7)) {
      fin = addDias(ahora, int(7, 60)); // en curso: termina en el futuro
    }
    if (ini > ahora) ini = addDias(ahora, -int(2, 20));
    p.ini = ini; p.fin = fin;
    const doc = int(1, 4), est = int(3, 25);
    proData.push({
      estado: p.pro, fechaInicio: ini, fechaFin: fin,
      participantesDocentes: doc, participantesEstudiantes: est,
      participantesDocentesExternos: rand() < 0.3 ? int(1, 6) : 0,
      participantesAlumnosExternos: rand() < 0.5 ? int(5, 80) : 0,
      participantesOtrosExternos: int(5, 150),
      planteamientoId: plaPorSol.get(p.solicitudId), createdAt: addDias(p.fAprPla, 1), updatedAt: p.pro === 'EN_PROCESO' ? addDias(p.fAprPla, 1) : fin,
    });
    hist(p, 'PROYECTO_CREADO', addDias(p.fAprPla, 1), p.docenteId);
    const etapaFinal = { EN_PROCESO: 'PROYECTO_EN_PROCESO', PAUSADO: 'PROYECTO_PAUSADO', FINALIZADO: 'PROYECTO_FINALIZADO', CANCELADO: 'PROYECTO_CANCELADO' }[p.pro];
    hist(p, 'PROYECTO_EN_PROCESO', addDias(p.fAprPla, 2), p.docenteId);
    if (p.pro !== 'EN_PROCESO') hist(p, etapaFinal, p.pro === 'FINALIZADO' ? fin : addDias(ini, int(1, Math.max(2, Math.round((fin - ini) / DIA)))), p.docenteId);
  }
  await bulk('proyecto', proData);
  const pros = await prisma.proyecto.findMany({ select: { id: true, planteamientoId: true } });
  const proPorPla = new Map(pros.map((x) => [x.planteamientoId, x.id]));

  // alumnos y observaciones por proyecto
  const paData = [], obsData = [];
  for (const p of conProyecto) {
    const proyectoId = proPorPla.get(plaPorSol.get(p.solicitudId));
    const pool = alumnosDe.get(p.carrera.id) || [];
    const cand = [...pool, ...alumnos.filter((a) => a.estado).map((a) => a.id)];
    const usados = new Set();
    const n = int(2, 6);
    for (let k = 0; k < n * 3 && usados.size < n; k++) usados.add(k < pool.length * 2 && pool.length ? pick(pool) : pick(cand));
    for (const alumnoId of usados) paData.push({ proyectoId, alumnoId });
    const nObs = p.pro === 'EN_PROCESO' || p.pro === 'PAUSADO' ? int(1, 3) : int(0, 3);
    for (let k = 0; k < nObs; k++) {
      const f = addDias(p.ini, int(1, Math.max(2, Math.round((Math.min(p.fin, ahora) - p.ini) / DIA))));
      obsData.push({ descripcion: pick(OBSERVACIONES), proyectoId, autorId: p.docenteId, createdAt: f > ahora ? ahora : f });
    }
  }
  await bulk('proyectoAlumno', paData);
  await bulk('observacion', obsData);
  await bulk('historialEtapa', historial);

  // ── Resumen ─────────────────────────────────────────────────────────────────
  const cuenta = async (m, where) => prisma[m].count(where ? { where } : undefined);
  console.log('\nListo. Resumen:');
  console.log(' Facultades:', await cuenta('facultad'), '| Carreras:', await cuenta('carrera'));
  for (const r of ['ADMIN','DIRECTOR_VCM','DECANO','GESTOR_VCM','ENCARGADO_CARRERA','DOCENTE','CLIENTE']) console.log(`  ${r}:`, await cuenta('user', { rol: r }));
  console.log(' Alumnos voluntarios:', await cuenta('alumnoVoluntario'));
  console.log(' Solicitudes:', await cuenta('solicitud'), '| Planteamientos:', await cuenta('planteamiento'), '| Proyectos:', await cuenta('proyecto'));
  console.log(' Historial:', await cuenta('historialEtapa'), '| Observaciones:', await cuenta('observacion'));
  console.log('\nContraseña de todos los usuarios creados: Demo1234');
  for (const r of ['DIRECTOR_VCM','DECANO','GESTOR_VCM','ENCARGADO_CARRERA','DOCENTE','CLIENTE']) {
    const u = await prisma.user.findFirst({ where: { rol: r }, orderBy: { id: 'asc' }, select: { email: true } });
    console.log(`  ${r}: ${u && u.email}`);
  }
}

main()
  .catch((e) => { console.error('Error en el seed masivo:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
