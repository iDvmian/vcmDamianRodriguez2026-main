import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlcanceVinculacion, EstadoProyecto, TipoIntervencion } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryProyectosDto {
  @ApiPropertyOptional({ enum: EstadoProyecto, example: EstadoProyecto.EN_PROCESO })
  @IsOptional()
  @IsEnum(EstadoProyecto)
  estado?: EstadoProyecto;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  facultadId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  carreraId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  docenteId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  programaId?: number;

  @ApiPropertyOptional({ enum: TipoIntervencion })
  @IsOptional()
  @IsEnum(TipoIntervencion)
  tipoIntervencion?: TipoIntervencion;

  @ApiPropertyOptional({ enum: AlcanceVinculacion })
  @IsOptional()
  @IsEnum(AlcanceVinculacion)
  alcance?: AlcanceVinculacion;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}
