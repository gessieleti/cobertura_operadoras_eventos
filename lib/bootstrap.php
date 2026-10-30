<?php
declare(strict_types=1);

$COB_CONFIG = require __DIR__ . '/../config.php';

if ($COB_CONFIG['auth_modo'] === 'portal') {
    if (!empty($COB_CONFIG['auth_shared']) && is_file($COB_CONFIG['auth_shared'])) {
        require_once $COB_CONFIG['auth_shared'];
    }
} elseif (session_status() === PHP_SESSION_NONE) {
    // Sessão própria, com nome próprio, para não se misturar com a dos outros
    // sistemas que rodam no mesmo servidor.
    session_name('COBSESSID');
    session_set_cookie_params([
        'path'     => dirname($_SERVER['SCRIPT_NAME'] ?? '/') ?: '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
}
if (PHP_SAPI !== 'cli' && session_status() === PHP_SESSION_NONE) {
    session_start();
}

function cob_config(string $chave)
{
    global $COB_CONFIG;
    return $COB_CONFIG[$chave] ?? null;
}

function cob_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $db = cob_config('db');
        $pdo = new PDO($db['dsn'], $db['usuario'], $db['senha'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function cob_sessao(array $chaves): ?string
{
    foreach ($chaves as $k) {
        if (isset($_SESSION[$k]) && is_scalar($_SESSION[$k]) && (string) $_SESSION[$k] !== '') {
            return (string) $_SESSION[$k];
        }
    }
    return null;
}

function cob_auth_propria(): bool
{
    return cob_config('auth_modo') !== 'portal';
}

/** Nome do usuário logado, ou null se não houver sessão. */
function cob_usuario(): ?string
{
    $u = cob_auth_propria()
        ? ($_SESSION['cob_usuario']['nome'] ?? null)
        : cob_sessao(cob_config('sessao_usuario'));
    if ($u === null && cob_config('modo_dev')) {
        return 'dev';
    }
    return $u;
}

function cob_perfil(): string
{
    return mb_strtolower(cob_auth_propria()
        ? (string) ($_SESSION['cob_usuario']['perfil'] ?? '')
        : (string) cob_sessao(cob_config('sessao_perfil')));
}

function cob_url_login(): string
{
    return cob_auth_propria() ? 'login.php' : cob_config('url_login');
}

function cob_pode_ver(): bool
{
    return cob_usuario() !== null;
}

function cob_pode_editar(): bool
{
    if (cob_config('modo_dev')) {
        return true;
    }
    if (cob_usuario() === null) {
        return false;
    }
    $permitidos = array_map('mb_strtolower', cob_config('perfis_edicao'));
    return in_array(cob_perfil(), $permitidos, true);
}

function cob_csrf(): string
{
    if (empty($_SESSION['cob_csrf'])) {
        $_SESSION['cob_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['cob_csrf'];
}

function cob_h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}
