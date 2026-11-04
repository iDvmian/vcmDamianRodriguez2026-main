import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'juan.perez@ucm.cl' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
