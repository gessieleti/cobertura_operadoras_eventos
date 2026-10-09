<?php
/**
 * Configuração do módulo Cobertura de antenas.
 *
 * Não edite este arquivo no servidor: crie config.local.php ao lado dele
 * (fora do git) retornando apenas as chaves que mudam. Exemplo em
 * config.local.example.php.
 */
$config = [
    // Conexão MySQL. Em homologação use o schema wibag_staging (porta 8081).
    'db' => [
        'dsn'      => 'mysql:host=127.0.0.1;port=3306;dbname=wibag_system;charset=utf8mb4',
        'usuario'  => 'wibag',
        'senha'    => '',
    ],

    // Caminho do auth_shared.php do Portal Hub. Se o arquivo existir, ele é
    // incluído antes de qualquer página ou chamada da API (sessão unificada).
    'auth_shared' => __DIR__ . '/../auth_shared.php',

    // Chaves de $_SESSION de onde vem o usuário logado e o perfil dele.
    // [a confirmar no sistema] ajuste para os nomes usados pelo auth_shared.php.
    'sessao_usuario' => ['usuario_nome', 'usuario', 'nome', 'login', 'user'],
    'sessao_perfil'  => ['usuario_perfil', 'perfil', 'role'],

    // Para onde mandar quem abre a página sem estar logado.
    'url_login' => '/',

    // Perfis que podem registrar, editar e excluir eventos. Os demais só consultam.
    'perfis_edicao' => ['admin', 'administrador', 'operador', 'tecnico', 'técnico'],

    // Sem login: true libera leitura e escrita para qualquer visitante.
    // Use só em desenvolvimento local.
    'modo_dev' => false,

    // Busca de endereço (geocodificação) pelo Nominatim/OpenStreetMap,
    // feita pelo servidor. Desligue se o servidor não tiver saída para a internet.
    'geocode' => [
        'ativo'      => true,
        'url'        => 'https://nominatim.openstreetmap.org/search',
        'user_agent' => 'WibagSystem-Cobertura/1.0 (contato@wibag.com.br)',
    ],

    // Arquivo compactado com as ERBs da Anatel (gerado a partir do design).
    'erb_arquivo' => __DIR__ . '/data/erb-anatel-2026-04.json.gz',
];

if (is_file(__DIR__ . '/config.local.php')) {
    $local = require __DIR__ . '/config.local.php';
    if (is_array($local)) {
        $config = array_replace_recursive($config, $local);
    }
}

return $config;
