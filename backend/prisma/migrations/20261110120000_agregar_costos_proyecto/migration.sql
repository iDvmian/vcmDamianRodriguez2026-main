-- CreateTable
CREATE TABLE `CostoProyecto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `concepto` VARCHAR(200) NOT NULL,
    `tipo` ENUM('INGRESO', 'GASTO') NOT NULL,
    `monto` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `proyectoId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CostoProyecto_proyectoId_idx`(`proyectoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CostoProyecto` ADD CONSTRAINT `CostoProyecto_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
