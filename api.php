<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/cobertura.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function cob_responder(int $status, array $corpo): void
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

$rota = $_GET['r'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];

if (!cob_pode_ver()) {
    cob_responder(401, ['erro' => 'Sua sessão expirou. Entre de novo no Portal.', 'codigo' => 'sem_sessao']);
}

$escritas = ['evento_salvar', 'evento_excluir', 'local_excluir'];
$entrada = [];
if (in_array($rota, $escritas, true)) {
    if ($metodo !== 'POST') {
        cob_responder(405, ['erro' => 'Método não permitido.']);
    }
    if (!hash_equals(cob_csrf(), $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        cob_responder(403, ['erro' => 'A página ficou aberta por muito tempo. Recarregue e tente de novo.', 'codigo' => 'csrf']);
    }
    if (!cob_pode_editar()) {
        cob_responder(403, ['erro' => 'Você só pode visualizar este mapa. Peça acesso de edição ao administrador.', 'codigo' => 'sem_permissao']);
    }
    $entrada = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($entrada)) {
        cob_responder(400, ['erro' => 'Requisição inválida.']);
    }
}

try {
    $db = cob_db();
    switch ($rota) {
        case 'dados':
            cob_responder(200, [
                'locais'     => cob_listar_locais($db),
                'eventos'    => cob_listar_eventos($db),
                'usuario'    => cob_usuario(),
                'podeEditar' => cob_pode_editar(),
            ]);

        case 'evento_salvar':
            $ev = cob_validar_evento($entrada);
            [$eventoId, $localId] = cob_salvar_evento($db, $ev, cob_usuario());
            cob_responder(200, ['ok' => true, 'id' => (string) $eventoId, 'localId' => (string) $localId]);

        case 'evento_excluir':
            cob_excluir_evento($db, (int) ($entrada['id'] ?? 0));
            cob_responder(200, ['ok' => true]);

        case 'local_excluir':
            cob_excluir_local($db, (int) ($entrada['id'] ?? 0));
            cob_responder(200, ['ok' => true]);

        case 'geocode':
            $q = cob_texto($_GET['q'] ?? '', 200);
            if ($q === '') {
                throw new CobErro('Digite o endereço para localizar.');
            }
            cob_responder(200, ['resultado' => cob_geocodificar($q)]);

        default:
            cob_responder(404, ['erro' => 'Rota desconhecida.']);
    }
} catch (CobErro $e) {
    cob_responder(422, ['erro' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('[cobertura] ' . $e);
    cob_responder(500, ['erro' => 'Não foi possível salvar. Verifique a conexão e tente de novo.']);
}
