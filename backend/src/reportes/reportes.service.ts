import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { CurrentUser } from '../auth/strategies/jwt.strategy';
import { facultadDelDecano } from '../common/alcance';
import { PrismaService } from '../prisma/prisma.service';
import { QueryReporteProyectosDto } from './dto/query-reporte-proyectos.dto';

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async generarReporteProyectos(
    query: QueryReporteProyectosDto,
    currentUser: CurrentUser,
  ): Promise<Buffer> {
    const where: Record<string, unknown> = {};

    // El Decano solo ve los proyectos de las carreras de su facultad
    const facultadDecano = await facultadDelDecano(this.prisma, currentUser);
    if (facultadDecano !== null) {
      where.planteamiento = { solicitud: { facultadId: facultadDecano } };
    }

    if (
      currentUser.rol !== Role.ADMIN &&
      currentUser.rol !== Role.GESTOR_VCM &&
      currentUser.rol !== Role.DECANO &&
      currentUser.rol !== Role.DIRECTOR_VCM
    ) {
      if (currentUser.rol === Role.ENCARGADO_CARRERA) {
        const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } });
        if (user?.carreraId) {
          where.planteamiento = { solicitud: { carreraId: user.carreraId } };
        }
      }
    } else if (query.carreraId !== undefined) {
      where.planteamiento = {
        solicitud: {
          carreraId: query.carreraId,
          ...(facultadDecano !== null && { facultadId: facultadDecano }),
        },
      };
    }

    if (query.estado !== undefined) where.estado = query.estado;

    const proyectos = await this.prisma.proyecto.findMany({
      where,
      include: {
        planteamiento: {
          include: {
            solicitud: { include: { carrera: true } },
            docente: { select: { nombres: true, apellidos: true } },
          },
        },
        alumnos: {
          include: { alumno: { select: { nombres: true, apellidos: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.buildPdf(proyectos, query);
  }

  private buildPdf(proyectos: any[], query: QueryReporteProyectosDto): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // bufferPages: true es necesario para poder usar switchToPage() al agregar footers
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const AZUL = '#1B3D8C';
      const MUTED = '#6B7280';
      const BORDE = '#E5E7EB';
      const TEXTO = '#1F2937';
      const pageWidth = doc.page.width - 100;

      // ── Header ──────────────────────────────────────────────
      doc
        .fontSize(18)
        .fillColor(AZUL)
        .font('Helvetica-Bold')
        .text('Reporte de Proyectos — VCM FCI-UCM', { align: 'center' });

      doc.moveDown(0.4);
      doc
        .fontSize(9)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `Generado el ${new Date().toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}`,
          { align: 'center' },
        );

      const filtros: string[] = [];
      if (query.estado) filtros.push(`Estado: ${query.estado}`);
      if (query.carreraId) filtros.push(`Carrera ID: ${query.carreraId}`);
      if (filtros.length > 0) {
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .fillColor(MUTED)
          .text(`Filtros aplicados: ${filtros.join(' | ')}`, { align: 'center' });
      }

      // Línea separadora bajo el header
      doc.moveDown(0.6);
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + pageWidth, doc.y)
        .strokeColor(AZUL)
        .lineWidth(1.5)
        .stroke();
      doc.moveDown(0.8);

      // ── Cuerpo ───────────────────────────────────────────────
      if (proyectos.length === 0) {
        doc
          .fontSize(11)
          .fillColor(MUTED)
          .font('Helvetica')
          .text('No se encontraron proyectos con los filtros aplicados.', { align: 'center' });
      } else {
        doc
          .fontSize(9)
          .fillColor(MUTED)
          .font('Helvetica')
          .text(`Total de proyectos: ${proyectos.length}`, { align: 'right' });
        doc.moveDown(0.6);

        proyectos.forEach((p, idx) => {
          const sol = p.planteamiento?.solicitud;
          const docente = p.planteamiento?.docente;
          const carrera = sol?.carrera;

          const titulo = sol?.titulo ?? '(Sin título)';
          const rawDesc: string = sol?.descripcion ?? '';
          const descripcion =
            rawDesc.length > 100 ? rawDesc.substring(0, 100).trimEnd() + '…' : rawDesc;
          const profesor = docente
            ? `${docente.nombres} ${docente.apellidos}`
            : 'Sin asignar';
          const carreraNombre = carrera?.nombre ?? 'Sin carrera';
          const alumnos =
            p.alumnos?.length > 0
              ? p.alumnos
                  .map((pa: any) => `${pa.alumno.nombres} ${pa.alumno.apellidos}`)
                  .join(', ')
              : 'Sin alumnos asignados';

          // Salto de página manual si no hay espacio — umbral conservador
          if (doc.y + 130 > doc.page.height - doc.page.margins.bottom - 20) {
            doc.addPage();
          }

          doc
            .fontSize(10)
            .fillColor(AZUL)
            .font('Helvetica-Bold')
            .text(`#${idx + 1} — ${titulo}`, 50, doc.y, { width: pageWidth });

          doc.moveDown(0.35);

          const campos: [string, string][] = [
            ['Descripción', descripcion],
            ['Profesor', profesor],
            ['Carrera', carreraNombre],
            ['Alumnos', alumnos],
            ['Estado', p.estado],
          ];

          campos.forEach(([label, valor]) => {
            doc
              .fontSize(9)
              .fillColor(MUTED)
              .font('Helvetica-Bold')
              .text(`${label}: `, { continued: true })
              .font('Helvetica')
              .fillColor(TEXTO)
              .text(valor, { width: pageWidth });
            doc.moveDown(0.2);
          });

          if (idx < proyectos.length - 1) {
            doc.moveDown(0.5);
            doc
              .moveTo(50, doc.y)
              .lineTo(50 + pageWidth, doc.y)
              .strokeColor(BORDE)
              .lineWidth(0.5)
              .stroke();
            doc.moveDown(0.6);
          }
        });
      }

      // ── Footers en todas las páginas (patrón correcto con bufferPages) ──
      // switchToPage() permite revisitar páginas ya escritas. Para escribir en
      // el área de margen (footerY > page.height - margins.bottom) sin que
      // pdfkit dispare addPage() automáticamente, se anula temporalmente el
      // margen inferior y se restaura tras escribir el footer.
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const savedBottom = doc.page.margins.bottom;
        const footerY = doc.page.height - savedBottom + 10;
        doc.page.margins.bottom = 0;
        doc
          .fontSize(8)
          .fillColor('#9CA3AF')
          .font('Helvetica')
          .text('VCM FCI-UCM', 50, footerY, {
            width: pageWidth,
            align: 'left',
            lineBreak: false,
          })
          .text(`Página ${i + 1} de ${range.count}`, 50, footerY, {
            width: pageWidth,
            align: 'right',
            lineBreak: false,
          });
        doc.page.margins.bottom = savedBottom;
      }

      doc.flushPages();
      doc.end();
    });
  }
}
