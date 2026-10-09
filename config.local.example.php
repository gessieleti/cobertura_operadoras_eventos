<?php
// Copie para config.local.php e ajuste. Esse arquivo não vai para o git.
return [
    'db' => [
        'dsn'     => 'mysql:host=127.0.0.1;port=3306;dbname=wibag_staging;charset=utf8mb4',
        'usuario' => 'wibag_app',
        'senha'   => 'troque-aqui',
    ],
    // 'auth_shared' => '/var/www/html/auth_shared.php',
    // 'modo_dev' => true,
];
