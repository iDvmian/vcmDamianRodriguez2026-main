-- AlterTable
ALTER TABLE `Programa` ADD COLUMN `facultadId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Programa` ADD CONSTRAINT `Programa_facultadId_fkey` FOREIGN KEY (`facultadId`) REFERENCES `Facultad`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
