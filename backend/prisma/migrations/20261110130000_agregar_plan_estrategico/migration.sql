-- CreateTable
CREATE TABLE `PlanEstrategico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodo` VARCHAR(50) NOT NULL,
    `facultadId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlanEstrategico_facultadId_periodo_key`(`facultadId`, `periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EjeEstrategico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `planId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EjeEstrategico_planId_idx`(`planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObjetivoGlobal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `referenciaUcm` VARCHAR(50) NULL,
    `ejeId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ObjetivoGlobal_ejeId_idx`(`ejeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObjetivoEspecifico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `objetivoGlobalId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ObjetivoEspecifico_objetivoGlobalId_idx`(`objetivoGlobalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicadorGlobal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` TEXT NOT NULL,
    `objetivoEspecificoId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IndicadorGlobal_objetivoEspecificoId_idx`(`objetivoEspecificoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlanEstrategico` ADD CONSTRAINT `PlanEstrategico_facultadId_fkey` FOREIGN KEY (`facultadId`) REFERENCES `Facultad`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EjeEstrategico` ADD CONSTRAINT `EjeEstrategico_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `PlanEstrategico`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObjetivoGlobal` ADD CONSTRAINT `ObjetivoGlobal_ejeId_fkey` FOREIGN KEY (`ejeId`) REFERENCES `EjeEstrategico`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObjetivoEspecifico` ADD CONSTRAINT `ObjetivoEspecifico_objetivoGlobalId_fkey` FOREIGN KEY (`objetivoGlobalId`) REFERENCES `ObjetivoGlobal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicadorGlobal` ADD CONSTRAINT `IndicadorGlobal_objetivoEspecificoId_fkey` FOREIGN KEY (`objetivoEspecificoId`) REFERENCES `ObjetivoEspecifico`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
