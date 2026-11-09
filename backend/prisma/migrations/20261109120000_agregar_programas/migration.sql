-- CreateTable
CREATE TABLE `programa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(200) NOT NULL,
    `descripcion` TEXT NULL,
    `actividades` TEXT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `programa_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `solicitud` ADD COLUMN `programaId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `solicitud` ADD CONSTRAINT `Solicitud_programaId_fkey` FOREIGN KEY (`programaId`) REFERENCES `programa`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Programas de Vinculación con el Medio de la universidad
INSERT INTO `programa` (`nombre`, `orden`) VALUES
  ('KineTransForma', 1),
  ('Comercio Justo para el Desarrollo Rural', 2),
  ('Tejiendo Redes', 3),
  ('Programa de Español para Migrantes', 4),
  ('Club de Lectura del Adulto Mayor', 5),
  ('Telecuidado UCM', 6),
  ('Escuela de Formación Comunitaria', 7),
  ('Prosalud UCM', 8),
  ('Programa de Educación Rural', 9),
  ('Akoluthía: Acompañando al Profesor de Religión en su Crecimiento Profesional', 10),
  ('Convivencia Escolar Formando Líderes para el Cambio', 11),
  ('Clínica Jurídica UCM', 12),
  ('Jornadas de Didáctica de las Ciencias Experimentales', 13);
