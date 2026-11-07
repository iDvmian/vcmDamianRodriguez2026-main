-- AlterTable
ALTER TABLE `solicitud`
    ADD COLUMN `alcance` ENUM('LOCAL', 'REGIONAL', 'NACIONAL', 'INTERNACIONAL') NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN `region` VARCHAR(100) NULL,
    ADD COLUMN `pais` VARCHAR(100) NULL;

-- Las solicitudes existentes eran todas de comunas del Maule
UPDATE `solicitud` SET `region` = 'Maule', `pais` = 'Chile' WHERE `ciudad` IS NOT NULL;
