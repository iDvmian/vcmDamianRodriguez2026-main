-- La solicitud guarda directamente su facultad
ALTER TABLE `Solicitud` ADD COLUMN `facultadId` INTEGER NULL;

-- Solicitudes existentes: primero la facultad de la carrera, y si no tiene, la del programa
UPDATE `Solicitud` s
JOIN `Carrera` c ON s.`carreraId` = c.`id`
SET s.`facultadId` = c.`facultadId`;

UPDATE `Solicitud` s
JOIN `Programa` p ON s.`programaId` = p.`id`
SET s.`facultadId` = p.`facultadId`
WHERE s.`facultadId` IS NULL AND p.`facultadId` IS NOT NULL;

CREATE INDEX `Solicitud_facultadId_idx` ON `Solicitud`(`facultadId`);
ALTER TABLE `Solicitud` ADD CONSTRAINT `Solicitud_facultadId_fkey` FOREIGN KEY (`facultadId`) REFERENCES `Facultad`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
