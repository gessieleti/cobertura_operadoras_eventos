<?php
declare(strict_types=1);

// Entrega o arquivo compactado das antenas da Anatel. O navegador descompacta
// (DecompressionStream). O arquivo é estático, então o cache é longo e validado por ETag.
require __DIR__ . '/lib/bootstrap.php';

if (!cob_pode_ver()) {
    http_response_code(401);
    exit;
}
session_write_close();

$arquivo = cob_config('erb_arquivo');
if (!is_file($arquivo)) {
    http_response_code(404);
    exit;
}
$etag = '"' . filemtime($arquivo) . '-' . filesize($arquivo) . '"';
header('Content-Type: application/octet-stream');
header('Cache-Control: private, max-age=86400');
header('ETag: ' . $etag);
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}
header('Content-Length: ' . filesize($arquivo));
readfile($arquivo);
