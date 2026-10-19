<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && hash_equals(cob_csrf(), (string) ($_POST['csrf'] ?? '')) && cob_auth_propria()) {
    $_SESSION = [];
    session_destroy();
}
header('Location: ' . cob_url_login());
