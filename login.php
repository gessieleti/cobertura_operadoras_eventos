<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if (!cob_auth_propria()) {
    header('Location: ' . cob_url_login());
    exit;
}
if (cob_pode_ver()) {
    header('Location: index.php');
    exit;
}

$erro = '';
$login = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $login = mb_substr(trim((string) ($_POST['login'] ?? '')), 0, 50);
    $senha = (string) ($_POST['senha'] ?? '');
    if (!hash_equals(cob_csrf(), (string) ($_POST['csrf'] ?? ''))) {
        $erro = 'A página ficou aberta por muito tempo. Tente de novo.';
    } elseif ($login === '' || $senha === '') {
        $erro = 'Informe o usuário e a senha.';
    } else {
        try {
            $st = cob_db()->prepare('SELECT id, login, nome, senha_hash, perfil FROM cob_usuarios WHERE login = ? AND ativo = 1');
            $st->execute([$login]);
            $u = $st->fetch();
            // Sem usuário, compara com um hash qualquer para o tempo de resposta não revelar se o login existe.
            $ok = password_verify($senha, $u['senha_hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');
            if ($u && $ok) {
                session_regenerate_id(true);
                $_SESSION['cob_usuario'] = ['id' => (int) $u['id'], 'nome' => $u['nome'] ?: $u['login'], 'perfil' => $u['perfil']];
                unset($_SESSION['cob_csrf']);
                cob_db()->prepare('UPDATE cob_usuarios SET ultimo_acesso = ? WHERE id = ?')->execute([date('Y-m-d H:i:s'), $u['id']]);
                header('Location: index.php');
                exit;
            }
            usleep(400000);
            $erro = 'Usuário ou senha incorretos.';
        } catch (Throwable $e) {
            error_log('[cobertura] login: ' . $e);
            $erro = 'Não foi possível entrar agora. Tente de novo em instantes.';
        }
    }
}
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar · Cobertura de antenas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/cobertura.css?v=<?= filemtime(__DIR__ . '/assets/cobertura.css') ?>">
</head>
<body>
<main class="login">
  <form class="card" method="post" action="login.php" novalidate>
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 13v8M9 21h6"/><circle cx="12" cy="11" r="2"/><path d="M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.6 4.6a9 9 0 0 0 0 12.8M18.4 4.6a9 9 0 0 1 0 12.8"/></svg>
    <h1>Cobertura de antenas</h1>
    <div class="sub">Wibag System · entre com seu usuário</div>
    <input type="hidden" name="csrf" value="<?= cob_h(cob_csrf()) ?>">
    <label>Usuário<input name="login" autocomplete="username" autofocus required value="<?= cob_h($login) ?>"></label>
    <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
    <div class="err" role="alert"><?= cob_h($erro) ?></div>
    <button class="btn primary">Entrar</button>
  </form>
</main>
</body>
</html>
