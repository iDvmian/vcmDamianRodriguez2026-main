-- Documento asociado a cada Plan de Desarrollo Estratégico
ALTER TABLE `PlanEstrategico` ADD COLUMN `archivoUrl` VARCHAR(500) NULL,
    ADD COLUMN `archivoPublicId` VARCHAR(255) NULL,
    ADD COLUMN `archivoNombre` VARCHAR(255) NULL;
