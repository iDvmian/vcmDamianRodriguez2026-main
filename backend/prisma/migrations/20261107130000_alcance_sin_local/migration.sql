-- "Local" se elimina: las comunas del Maule pasan a ser alcance Regional
UPDATE `solicitud` SET `alcance` = 'REGIONAL' WHERE `alcance` = 'LOCAL';

-- AlterTable
ALTER TABLE `solicitud` MODIFY `alcance` ENUM('REGIONAL', 'NACIONAL', 'INTERNACIONAL') NOT NULL DEFAULT 'REGIONAL';
