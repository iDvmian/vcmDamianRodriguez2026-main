import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type SafeUser = Omit<User, 'password'>;

/** Minutos de vigencia del enlace de recuperación. */
const RESET_VIGENCIA_MIN = 30;
/** Máximo de enlaces que se emiten por usuario en una hora (evita el abuso del correo). */
const RESET_MAX_POR_HORA = 3;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('El email ya está registrado');
    }

    const existingRut = await this.prisma.user.findUnique({
      where: { rut: dto.rut },
    });
    if (existingRut) {
      throw new ConflictException('El RUT ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        rut: dto.rut,
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        email: dto.email,
        telefono: dto.telefono,
        password: hashedPassword,
        // El registro público siempre crea solicitantes: los roles internos los asigna un administrador
        rol: Role.CLIENTE,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async login(dto: LoginDto): Promise<{
    access_token: string;
    user: Pick<
      User,
      'id' | 'rut' | 'nombres' | 'apellidos' | 'email' | 'rol' | 'estado' | 'carreraId'
    >;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.estado) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, email: user.email, rol: user.rol };
    const access_token = await this.jwtService.signAsync(payload);

    return {
      access_token,
      user: {
        id: user.id,
        rut: user.rut,
        nombres: user.nombres,
        apellidos: user.apellidos,
        email: user.email,
        rol: user.rol,
        estado: user.estado,
        carreraId: user.carreraId,
      },
    };
  }
  /**
   * Inicia la recuperación de contraseña. Siempre responde lo mismo, exista o no el correo,
   * para no revelar qué cuentas están registradas.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const respuesta = {
      message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    };

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.estado) return respuesta;

    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const recientes = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: haceUnaHora } },
    });
    if (recientes >= RESET_MAX_POR_HORA) return respuesta;

    // Un solo enlace válido a la vez: se invalidan los anteriores sin usar
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_VIGENCIA_MIN * 60 * 1000),
      },
    });

    const base = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');
    const enlace = `${base}/reset-password?token=${token}`;

    // Sin await: la respuesta tarda lo mismo exista o no el correo
    void this.mail
      .sendRecuperacionPassword({
        to: user.email,
        nombre: `${user.nombres} ${user.apellidos}`,
        enlace,
        minutos: RESET_VIGENCIA_MIN,
      })
      .catch((e) => this.logger.error(`No se pudo enviar el correo de recuperación: ${e?.message ?? e}`));

    return respuesta;
  }

  /** Fija la nueva contraseña si el token es válido, no ha vencido y no se ha usado. */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const registro = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(dto.token) },
      include: { user: true },
    });

    if (!registro || registro.usedAt || registro.expiresAt < new Date() || !registro.user.estado) {
      throw new BadRequestException('El enlace es inválido o ha expirado. Solicita uno nuevo.');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: registro.userId }, data: { password: hashed } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: registro.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }
}
