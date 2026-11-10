-- La referencia UCM pasa del objetivo global al indicador global
ALTER TABLE `IndicadorGlobal` ADD COLUMN `referenciaUcm` VARCHAR(50) NULL;

UPDATE `IndicadorGlobal` i
JOIN `ObjetivoGlobal` o ON i.`objetivoGlobalId` = o.`id`
SET i.`referenciaUcm` = o.`referenciaUcm`;

ALTER TABLE `ObjetivoGlobal` DROP COLUMN `referenciaUcm`;
