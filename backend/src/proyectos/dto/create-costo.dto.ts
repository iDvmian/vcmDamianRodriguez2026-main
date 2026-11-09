import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoCosto } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateCostoDto {
  @ApiProperty({ example: 'Traslado' })
  @IsString()
  @IsNotEmpty({ message: 'El concepto es obligatorio' })
  @MaxLength(200)
  concepto: string;

  @ApiProperty({ enum: TipoCosto, example: TipoCosto.GASTO })
  @IsEnum(TipoCosto, { message: 'El tipo debe ser INGRESO o GASTO' })
  tipo: TipoCosto;

  @ApiProperty({ example: 700000, description: 'Monto en pesos, siempre positivo (el signo lo da el tipo)' })
  @Type(() => Number)
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  @Max(2000000000)
  monto: number;

  @ApiPropertyOptional({ example: '2026-11-10' })
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
