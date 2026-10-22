<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if (!cob_pode_ver()) {
    header('Location: ' . cob_url_login());
    exit;
}

$v = static fn(string $f): string => $f . '?v=' . filemtime(__DIR__ . '/' . $f);
$cfg = [
    'api'   => 'api.php',
    'erb'   => 'erb.php',
    'csrf'  => cob_csrf(),
    'login' => cob_url_login(),
];
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Cobertura de antenas · Wibag System</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<link rel="stylesheet" href="<?= cob_h($v('assets/cobertura.css')) ?>">
</head>
<body>
<div class="app" id="app">
  <div id="map">
    <div class="bar">
      <div class="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 13v8M9 21h6"/><circle cx="12" cy="11" r="2"/><path d="M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.6 4.6a9 9 0 0 0 0 12.8M18.4 4.6a9 9 0 0 1 0 12.8"/></svg>
        <h1>Cobertura de antenas</h1>
      </div>
      <div class="filters">
        <select id="fTech" aria-label="Filtrar por tecnologia"><option value="">Todas as redes</option></select>
        <select id="fOp" aria-label="Filtrar por operadora"><option value="">Todas as operadoras</option></select><select id="fErb" aria-label="Antenas no mapa" disabled><option value="todas">Carregando antenas…</option><option value="novas">Antenas novas desde abril</option><option value="g5">Ganharam 5G desde abril</option><option value="ocultas">Ocultar antenas</option></select><button type="button" class="tog" id="alcBtn" aria-pressed="false" disabled title="Mostrar o alcance estimado das antenas"><span class="sw"></span>Alcance</button>
      </div>
      <button class="btn primary" id="addBtn" hidden>Registrar evento</button>
<?php if (cob_auth_propria() && !cob_config('modo_dev')): ?>
      <form class="user" method="post" action="logout.php"><input type="hidden" name="csrf" value="<?= cob_h(cob_csrf()) ?>"><span><?= cob_h(cob_usuario()) ?></span><button class="btn small">Sair</button></form>
<?php endif; ?>
    </div>
    <div class="hint" id="alcHint" hidden style="display:block;bottom:22px"></div>
    <div class="hint" id="hint">Clique no mapa para marcar o local, ou use o endereço ao lado</div>
  </div>
  <aside class="panel" id="panel" aria-live="polite"></aside>
</div>
<script>window.COB_CFG = <?= json_encode($cfg, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="<?= cob_h($v('assets/br-estados.js')) ?>"></script>
<script src="<?= cob_h($v('assets/cobertura.js')) ?>"></script>
</body>
</html>
