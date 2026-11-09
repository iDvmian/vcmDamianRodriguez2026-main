import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AlumnosVoluntariosModule } from './alumnos-voluntarios/alumnos-voluntarios.module';
import { CarrerasModule } from './carreras/carreras.module';
import { FacultadesModule } from './facultades/facultades.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlanteamientosModule } from './planteamientos/planteamientos.module';
import { ProgramasModule } from './programas/programas.module';
import { ProyectosModule } from './proyectos/proyectos.module';
import { ReportesModule } from './reportes/reportes.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { MailModule } from './mail/mail.module';
import { RetencionModule } from './retencion/retencion.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    MailModule,
    AuthModule,
    UsersModule,
    FacultadesModule,
    CarrerasModule,
    AlumnosVoluntariosModule,
    ProgramasModule,
    SolicitudesModule,
    PlanteamientosModule,
    ProyectosModule,
    ReportesModule,
    RetencionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
