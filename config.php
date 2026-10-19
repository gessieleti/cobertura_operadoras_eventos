<?php
/**
 * Configuração do módulo Cobertura de antenas.
 *
 * Não edite este arquivo no servidor: crie config.local.php ao lado dele
 * (fora do git) retornando apenas as chaves que mudam. Exemplo em
 * config.local.example.php.
 */
$config = [
    // Conexão MySQL. Enquanto o sistema roda separado, ele tem o próprio
    // schema (wibag_cobertura), sem tocar no banco dos outros sistemas.
    'db' => [
        'dsn'      => 'mysql:host=127.0.0.1;port=3306;dbname=wibag_cobertura;charset=utf8mb4',
        'usuario'  => 'cobertura',
        'senha'    => '',
    ],

    // De onde vem o login:
    //  'proprio' → login.php e usuários da tabela cob_usuarios (sistema independente).
    //  'portal'  → sessão do Portal Hub via auth_shared.php (quando for integrado).
    'auth_modo' => 'proprio',

    // Modo 'portal': caminho do auth_shared.php, incluído antes de tudo.
    'auth_shared' => __DIR__ . '/../auth_shared.php',

    // Modo 'portal': chaves de $_SESSION com o usuário logado e o perfil dele.
    // [a confirmar no sistema] ajuste para os nomes usados pelo auth_shared.php.
    'sessao_usuario' => ['usuario_nome', 'usuario', 'nome', 'login', 'user'],
    'sessao_perfil'  => ['usuario_perfil', 'perfil', 'role'],

    // Modo 'portal': para onde mandar quem abre a página sem estar logado.
    // No modo 'proprio' é sempre login.php.
    'url_login' => '/',

    // Perfis que podem registrar, editar e excluir eventos. Os demais só consultam.
    // No modo 'proprio' os perfis são admin, editor e leitor.
    'perfis_edicao' => ['admin', 'editor', 'administrador', 'operador', 'tecnico', 'técnico'],

    // Sem login: true libera leitura e escrita para qualquer visitante.
    // Use só em desenvolvimento local.
    'modo_dev' => false,

    // Busca de endereço (geocodificação) pelo Nominatim/OpenStreetMap,
    // feita pelo servidor. Desligue se o servidor não tiver saída para a internet.
    'geocode' => [
        'ativo'      => true,
        'url'        => 'https://nominatim.openstreetmap.org/search',
        // O Nominatim exige um User-Agent que identifique o sistema.
        'user_agent' => 'WibagSystem-Cobertura/1.0',
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
