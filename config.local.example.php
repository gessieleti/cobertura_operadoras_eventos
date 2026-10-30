<?php
// Copie para config.local.php e ajuste. Esse arquivo não vai para o git.
// O deploy/instalar.sh gera este arquivo sozinho no servidor.
return [
    'db' => [
        'dsn'     => 'mysql:host=127.0.0.1;port=3306;dbname=wibag_cobertura;charset=utf8mb4',
        'usuario' => 'cobertura',
        'senha'   => 'troque-aqui',
    ],
    // Quando for integrar ao Portal Hub:
    // 'auth_modo'   => 'portal',
    // 'auth_shared' => '/var/www/html/auth_shared.php',
    // 'modo_dev' => true,
];
