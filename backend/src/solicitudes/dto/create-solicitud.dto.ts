import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlcanceVinculacion, TipoCliente } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, ValidateIf } from 'class-validator';

export class CreateSolicitudDto {
  @ApiProperty({ example: 'Capacitación en Excel para adultos mayores' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  titulo: string;

  @ApiProperty({ example: 'Necesitamos capacitar a 30 adultos mayores en uso básico de Excel.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(560)
  descripcion: string;

  @ApiPropertyOptional({ example: 1, description: 'Programa de Vinculación con el Medio. Vacío si la solicitud no encaja en ninguno' })
  @IsOptional()
  @IsInt({ message: 'Programa inválido' })
  @IsPositive({ message: 'Programa inválido' })
  programaId?: number | null;

  @ApiPropertyOptional({ example: 1, description: 'Facultad a la que se dirige. Obligatoria si no hay programa; si hay, debe ser la del programa' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  facultadId?: number | null;

  @ApiProperty({ enum: AlcanceVinculacion, example: AlcanceVinculacion.REGIONAL, description: 'Alcance territorial de la vinculación' })
  @IsEnum(AlcanceVinculacion, { message: 'Alcance inválido' })
  alcance: AlcanceVinculacion;

  @ApiPropertyOptional({ example: 'Talca', description: 'Regional: comuna del Maule (obligatoria). Nacional: comuna de la región (obligatoria). Internacional: ciudad (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string | null;

  @ApiPropertyOptional({ example: 'Biobío', description: 'Obligatoria cuando el alcance es NACIONAL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @ApiPropertyOptional({ example: 'Argentina', description: 'Obligatorio cuando el alcance es INTERNACIONAL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pais?: string | null;

  @ApiPropertyOptional({ example: 'Calle 1 Norte', description: 'Obligatoria cuando el alcance es REGIONAL' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  direccion?: string | null;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  numeroDireccion?: string;

  @ApiProperty({ example: '+56 9 1234 5678', description: 'Teléfono de contacto para esta solicitud' })
  @IsString()
  @IsNotEmpty({ message: 'El teléfono es requerido' })
  @Matches(/^\+?[\d\s]{8,20}$/, { message: 'Teléfono inválido (ej: +56 9 1234 5678)' })
  telefono: string;

  @ApiProperty({ enum: TipoCliente, example: TipoCliente.JUNTA_VECINOS, description: 'Tipo de organización o persona que solicita' })
  @IsEnum(TipoCliente, { message: 'Tipo de cliente inválido' })
  tipoCliente: TipoCliente;

  @ApiPropertyOptional({ example: 'Cooperativa agrícola', description: 'Obligatorio cuando tipoCliente es OTRO' })
  @ValidateIf((o) => o.tipoCliente === TipoCliente.OTRO)
  @IsString()
  @IsNotEmpty({ message: 'Indica qué tipo de cliente eres' })
  @MaxLength(100)
  tipoClienteOtro?: string;

  @ApiPropertyOptional({ example: 'Junta de vecinos Villa Los Aromos', description: 'Organización con la que se trabajará (iniciativa de docente)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreOrganizacion?: string;

  @ApiPropertyOptional({ example: 30, description: 'Cantidad aproximada de personas que participarían (iniciativa de docente)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100000)
  personasPrevistas?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  carreraId?: number | null;
}
