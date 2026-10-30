-- Usuários do próprio módulo (config auth_modo = 'proprio'), enquanto ele
-- roda separado do Portal Hub. Rollback: 002_usuarios_rollback.sql
-- Crie usuários com: php bin/criar_usuario.php <login> <perfil> "<nome>"

CREATE TABLE IF NOT EXISTS cob_usuarios (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    login          VARCHAR(50)  NOT NULL,
    nome           VARCHAR(100) NOT NULL DEFAULT '',
    senha_hash     VARCHAR(255) NOT NULL,
    perfil         ENUM('admin','editor','leitor') NOT NULL DEFAULT 'leitor',
    ativo          TINYINT(1)   NOT NULL DEFAULT 1,
    criado_em      DATETIME     NOT NULL,
    ultimo_acesso  DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cob_usuarios_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
