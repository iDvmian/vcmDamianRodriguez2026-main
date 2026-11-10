-- Los indicadores globales pasan a depender del objetivo global (antes del objetivo específico)
ALTER TABLE `IndicadorGlobal` ADD COLUMN `objetivoGlobalId` INTEGER NULL;

UPDATE `IndicadorGlobal` i
JOIN `ObjetivoEspecifico` o ON i.`objetivoEspecificoId` = o.`id`
SET i.`objetivoGlobalId` = o.`objetivoGlobalId`;

DELETE FROM `IndicadorGlobal` WHERE `objetivoGlobalId` IS NULL;

ALTER TABLE `IndicadorGlobal` DROP FOREIGN KEY `IndicadorGlobal_objetivoEspecificoId_fkey`;
DROP INDEX `IndicadorGlobal_objetivoEspecificoId_idx` ON `IndicadorGlobal`;
ALTER TABLE `IndicadorGlobal` DROP COLUMN `objetivoEspecificoId`;

ALTER TABLE `IndicadorGlobal` MODIFY `objetivoGlobalId` INTEGER NOT NULL;
CREATE INDEX `IndicadorGlobal_objetivoGlobalId_idx` ON `IndicadorGlobal`(`objetivoGlobalId`);
ALTER TABLE `IndicadorGlobal` ADD CONSTRAINT `IndicadorGlobal_objetivoGlobalId_fkey` FOREIGN KEY (`objetivoGlobalId`) REFERENCES `ObjetivoGlobal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
