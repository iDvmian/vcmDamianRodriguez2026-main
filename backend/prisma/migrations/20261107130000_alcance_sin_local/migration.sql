-- "Local" se elimina: las comunas del Maule pasan a ser alcance Regional
UPDATE `Solicitud` SET `alcance` = 'REGIONAL' WHERE `alcance` = 'LOCAL';

-- AlterTable
ALTER TABLE `Solicitud` MODIFY `alcance` ENUM('REGIONAL', 'NACIONAL', 'INTERNACIONAL') NOT NULL DEFAULT 'REGIONAL';
