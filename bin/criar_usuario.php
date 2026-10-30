<?php
declare(strict_types=1);

// Cria ou atualiza um usuário do login próprio. A senha é pedida no terminal.
// Uso: php bin/criar_usuario.php <login> <admin|editor|leitor> ["Nome completo"]
//      php bin/criar_usuario.php <login> --desativar

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$_SERVER['SCRIPT_NAME'] = '/';
require __DIR__ . '/../lib/bootstrap.php';

[$prog, $login, $perfil, $nome] = $argv + [null, '', '', ''];
$login = trim((string) $login);
$uso = "Uso: php bin/criar_usuario.php <login> <admin|editor|leitor> [\"Nome completo\"]\n"
     . "     php bin/criar_usuario.php <login> --desativar\n";
if (!preg_match('/^[A-Za-z0-9._-]{2,50}$/', $login)) {
    fwrite(STDERR, $uso);
    exit(1);
}
$db = cob_db();

if ($perfil === '--desativar') {
    $st = $db->prepare('UPDATE cob_usuarios SET ativo = 0 WHERE login = ?');
    $st->execute([$login]);
    echo $st->rowCount() ? "Usuário $login desativado.\n" : "Usuário $login não encontrado.\n";
    exit(0);
}
if (!in_array($perfil, ['admin', 'editor', 'leitor'], true)) {
    fwrite(STDERR, $uso);
    exit(1);
}

function ler_senha(string $rotulo): string
{
    fwrite(STDOUT, $rotulo);
    $tty = stream_isatty(STDIN);
    if ($tty) {
        shell_exec('stty -echo');
    }
    $s = rtrim((string) fgets(STDIN), "\r\n");
    if ($tty) {
        shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }
    return $s;
}

$senha = ler_senha('Senha: ');
if (mb_strlen($senha) < 8) {
    fwrite(STDERR, "A senha precisa ter pelo menos 8 caracteres.\n");
    exit(1);
}
if (stream_isatty(STDIN) && ler_senha('Repita a senha: ') !== $senha) {
    fwrite(STDERR, "As senhas não conferem.\n");
    exit(1);
}

$hash = password_hash($senha, PASSWORD_DEFAULT);
$st = $db->prepare('SELECT id FROM cob_usuarios WHERE login = ?');
$st->execute([$login]);
if ($id = $st->fetchColumn()) {
    $db->prepare('UPDATE cob_usuarios SET senha_hash = ?, perfil = ?, nome = COALESCE(NULLIF(?, \'\'), nome), ativo = 1 WHERE id = ?')
       ->execute([$hash, $perfil, mb_substr($nome, 0, 100), $id]);
    echo "Usuário $login atualizado ($perfil).\n";
} else {
    $db->prepare('INSERT INTO cob_usuarios (login, nome, senha_hash, perfil, criado_em) VALUES (?, ?, ?, ?, ?)')
       ->execute([$login, mb_substr($nome, 0, 100), $hash, $perfil, date('Y-m-d H:i:s')]);
    echo "Usuário $login criado ($perfil).\n";
}
