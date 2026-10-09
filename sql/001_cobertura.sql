-- Módulo Cobertura de antenas: locais, eventos e avaliação das operadoras.
-- Antes de rodar: backup em /home/tomich/backups/ (mysqldump do schema).
-- Rodar primeiro em wibag_staging. Rollback: 001_cobertura_rollback.sql

CREATE TABLE IF NOT EXISTS cob_locais (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome        VARCHAR(100) NOT NULL,
    endereco    VARCHAR(200) NOT NULL DEFAULT '',
    lat         DECIMAL(9,6) NOT NULL,
    lng         DECIMAL(9,6) NOT NULL,
    criado_em   DATETIME     NOT NULL,
    criado_por  VARCHAR(100) NULL,
    PRIMARY KEY (id),
    KEY idx_cob_locais_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cob_eventos (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    local_id        INT UNSIGNED NOT NULL,
    nome            VARCHAR(100) NOT NULL,
    data_inicio     DATE         NOT NULL,
    data_fim        DATE         NOT NULL,
    descricao       VARCHAR(1000) NOT NULL DEFAULT '',
    criado_em       DATETIME     NOT NULL,
    criado_por      VARCHAR(100) NULL,
    atualizado_em   DATETIME     NULL,
    atualizado_por  VARCHAR(100) NULL,
    PRIMARY KEY (id),
    KEY idx_cob_eventos_local (local_id),
    KEY idx_cob_eventos_data (data_inicio),
    CONSTRAINT fk_cob_eventos_local FOREIGN KEY (local_id) REFERENCES cob_locais (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_cob_eventos_periodo CHECK (data_fim >= data_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cob_resultados (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    evento_id   INT UNSIGNED NOT NULL,
    ordem       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    operadora   VARCHAR(30)  NOT NULL,
    tecnologia  ENUM('5G','4G+','4G','3G','2G') NOT NULL,
    status      ENUM('bom','instavel','ruim')   NOT NULL,
    obs         VARCHAR(200) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY idx_cob_resultados_evento (evento_id),
    KEY idx_cob_resultados_operadora (operadora),
    CONSTRAINT fk_cob_resultados_evento FOREIGN KEY (evento_id) REFERENCES cob_eventos (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
