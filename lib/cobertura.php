<?php
declare(strict_types=1);

const COB_OPERADORAS = ['Vivo', 'Claro', 'TIM', 'Oi', 'Algar', 'Brisanet', 'Unifique', 'Sercomtel', 'Outra'];
const COB_TECNOLOGIAS = ['5G', '4G+', '4G', '3G', '2G'];
const COB_STATUS = ['bom', 'instavel', 'ruim'];

/** Erro de validação: a mensagem vai direto para a tela. */
class CobErro extends RuntimeException
{
}

function cob_listar_locais(PDO $db): array
{
    $rows = $db->query('SELECT id, nome, endereco, lat, lng FROM cob_locais ORDER BY nome')->fetchAll();
    return array_map(fn($r) => [
        'id'       => (string) $r['id'],
        'nome'     => $r['nome'],
        'endereco' => $r['endereco'],
        'lat'      => (float) $r['lat'],
        'lng'      => (float) $r['lng'],
    ], $rows);
}

/** Eventos do mais recente para o mais antigo, cada um com seus resultados por operadora. */
function cob_listar_eventos(PDO $db): array
{
    $eventos = [];
    $rows = $db->query('SELECT id, local_id, nome, data_inicio, data_fim, descricao
                          FROM cob_eventos ORDER BY data_inicio DESC, id DESC')->fetchAll();
    foreach ($rows as $r) {
        $eventos[$r['id']] = [
            'id'         => (string) $r['id'],
            'localId'    => (string) $r['local_id'],
            'nome'       => $r['nome'],
            'data'       => $r['data_inicio'],
            'dataFim'    => $r['data_fim'],
            'descricao'  => $r['descricao'],
            'resultados' => [],
        ];
    }
    $res = $db->query('SELECT evento_id, operadora, tecnologia, status, obs
                         FROM cob_resultados ORDER BY evento_id, ordem, id')->fetchAll();
    foreach ($res as $r) {
        if (isset($eventos[$r['evento_id']])) {
            $eventos[$r['evento_id']]['resultados'][] = [
                'operadora'  => $r['operadora'],
                'tecnologia' => $r['tecnologia'],
                'status'     => $r['status'],
                'obs'        => $r['obs'],
            ];
        }
    }
    return array_values($eventos);
}

function cob_texto($v, int $max): string
{
    return mb_substr(trim((string) $v), 0, $max);
}

function cob_data_valida($v): ?string
{
    $d = DateTime::createFromFormat('!Y-m-d', (string) $v);
    return ($d && $d->format('Y-m-d') === $v) ? $v : null;
}

/** Valida o JSON do formulário e devolve os dados normalizados. */
function cob_validar_evento(array $in): array
{
    $nome = cob_texto($in['nome'] ?? '', 100);
    if ($nome === '') {
        throw new CobErro('Dê um nome para o evento.');
    }
    $data = cob_data_valida($in['data'] ?? '');
    if (!$data) {
        throw new CobErro('Informe a data de início do evento.');
    }
    $dataFim = cob_data_valida($in['dataFim'] ?? '') ?? $data;
    if ($dataFim < $data) {
        throw new CobErro('A data de fim não pode ser anterior à data de início.');
    }

    $novoLocal = null;
    $localId = null;
    if (!empty($in['novoLocal']) && is_array($in['novoLocal'])) {
        $nl = $in['novoLocal'];
        $ln = cob_texto($nl['nome'] ?? '', 100);
        if ($ln === '') {
            throw new CobErro('Dê um nome para o novo local.');
        }
        $lat = filter_var($nl['lat'] ?? null, FILTER_VALIDATE_FLOAT);
        $lng = filter_var($nl['lng'] ?? null, FILTER_VALIDATE_FLOAT);
        if ($lat === false || $lng === false || abs($lat) > 90 || abs($lng) > 180) {
            throw new CobErro('Defina a posição do local: localize o endereço, informe latitude e longitude ou clique no mapa.');
        }
        $novoLocal = [
            'nome'     => $ln,
            'endereco' => cob_texto($nl['endereco'] ?? '', 200),
            'lat'      => round($lat, 6),
            'lng'      => round($lng, 6),
        ];
    } else {
        $localId = filter_var($in['localId'] ?? null, FILTER_VALIDATE_INT);
        if (!$localId) {
            throw new CobErro('Escolha o local do evento.');
        }
    }

    $resultados = [];
    foreach (($in['resultados'] ?? []) as $r) {
        if (!is_array($r)) {
            continue;
        }
        $op = in_array($r['operadora'] ?? '', COB_OPERADORAS, true) ? $r['operadora'] : 'Outra';
        $tec = in_array($r['tecnologia'] ?? '', COB_TECNOLOGIAS, true) ? $r['tecnologia'] : null;
        $st = in_array($r['status'] ?? '', COB_STATUS, true) ? $r['status'] : null;
        if (!$tec) {
            throw new CobErro('Escolha a rede usada por cada operadora.');
        }
        if (!$st) {
            throw new CobErro('Marque se cada operadora funcionou bem, ficou instável ou não funcionou.');
        }
        $resultados[] = ['operadora' => $op, 'tecnologia' => $tec, 'status' => $st, 'obs' => cob_texto($r['obs'] ?? '', 200)];
    }
    if (!$resultados) {
        throw new CobErro('Adicione pelo menos uma operadora.');
    }
    if (count($resultados) > 20) {
        throw new CobErro('Informe no máximo 20 operadoras por evento.');
    }

    return [
        'id'         => filter_var($in['id'] ?? null, FILTER_VALIDATE_INT) ?: null,
        'nome'       => $nome,
        'data'       => $data,
        'dataFim'    => $dataFim,
        'descricao'  => cob_texto($in['descricao'] ?? '', 1000),
        'localId'    => $localId,
        'novoLocal'  => $novoLocal,
        'resultados' => $resultados,
    ];
}

/** Cria ou atualiza o evento (e o local novo, se houver) numa transação. Retorna [eventoId, localId]. */
function cob_salvar_evento(PDO $db, array $ev, string $usuario): array
{
    $agora = date('Y-m-d H:i:s');
    $db->beginTransaction();
    try {
        $localId = $ev['localId'];
        if ($ev['novoLocal']) {
            $st = $db->prepare('INSERT INTO cob_locais (nome, endereco, lat, lng, criado_em, criado_por)
                                VALUES (?, ?, ?, ?, ?, ?)');
            $nl = $ev['novoLocal'];
            $st->execute([$nl['nome'], $nl['endereco'], $nl['lat'], $nl['lng'], $agora, $usuario]);
            $localId = (int) $db->lastInsertId();
        } else {
            $st = $db->prepare('SELECT 1 FROM cob_locais WHERE id = ?');
            $st->execute([$localId]);
            if (!$st->fetchColumn()) {
                throw new CobErro('O local escolhido não existe mais. Recarregue a página.');
            }
        }

        if ($ev['id']) {
            $st = $db->prepare('UPDATE cob_eventos
                                   SET local_id = ?, nome = ?, data_inicio = ?, data_fim = ?, descricao = ?,
                                       atualizado_em = ?, atualizado_por = ?
                                 WHERE id = ?');
            $st->execute([$localId, $ev['nome'], $ev['data'], $ev['dataFim'], $ev['descricao'], $agora, $usuario, $ev['id']]);
            if ($st->rowCount() === 0) {
                $chk = $db->prepare('SELECT 1 FROM cob_eventos WHERE id = ?');
                $chk->execute([$ev['id']]);
                if (!$chk->fetchColumn()) {
                    throw new CobErro('Este evento foi excluído por outra pessoa. Recarregue a página.');
                }
            }
            $eventoId = $ev['id'];
            $db->prepare('DELETE FROM cob_resultados WHERE evento_id = ?')->execute([$eventoId]);
        } else {
            $st = $db->prepare('INSERT INTO cob_eventos (local_id, nome, data_inicio, data_fim, descricao, criado_em, criado_por)
                                VALUES (?, ?, ?, ?, ?, ?, ?)');
            $st->execute([$localId, $ev['nome'], $ev['data'], $ev['dataFim'], $ev['descricao'], $agora, $usuario]);
            $eventoId = (int) $db->lastInsertId();
        }

        $st = $db->prepare('INSERT INTO cob_resultados (evento_id, ordem, operadora, tecnologia, status, obs)
                            VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($ev['resultados'] as $i => $r) {
            $st->execute([$eventoId, $i, $r['operadora'], $r['tecnologia'], $r['status'], $r['obs']]);
        }
        $db->commit();
        return [$eventoId, $localId];
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

function cob_excluir_evento(PDO $db, int $id): void
{
    $db->beginTransaction();
    $db->prepare('DELETE FROM cob_resultados WHERE evento_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM cob_eventos WHERE id = ?')->execute([$id]);
    $db->commit();
}

/** Exclui o local e todos os eventos dele. */
function cob_excluir_local(PDO $db, int $id): void
{
    $db->beginTransaction();
    $db->prepare('DELETE FROM cob_resultados WHERE evento_id IN (SELECT id FROM cob_eventos WHERE local_id = ?)')->execute([$id]);
    $db->prepare('DELETE FROM cob_eventos WHERE local_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM cob_locais WHERE id = ?')->execute([$id]);
    $db->commit();
}

/** Geocodifica pelo Nominatim. Retorna ['lat','lng','precisao','encontrado'] ou null. */
function cob_geocodificar(string $endereco): ?array
{
    $cfg = cob_config('geocode');
    if (empty($cfg['ativo'])) {
        throw new CobErro('A busca por endereço está desligada. Use latitude e longitude ou clique no mapa.');
    }
    $url = $cfg['url'] . '?' . http_build_query([
        'q' => $endereco, 'format' => 'jsonv2', 'limit' => 1, 'countrycodes' => 'br', 'accept-language' => 'pt-BR',
    ]);
    $ctx = stream_context_create(['http' => [
        'timeout' => 8,
        'header'  => "User-Agent: {$cfg['user_agent']}\r\nAccept: application/json\r\n",
    ]]);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) {
        throw new CobErro('Não foi possível localizar agora. Use latitude e longitude ou clique no mapa.');
    }
    $json = json_decode($resp, true);
    if (!$json || !isset($json[0]['lat'])) {
        return null;
    }
    $r = $json[0];
    $tipo = $r['addresstype'] ?? $r['type'] ?? '';
    $precisao = match (true) {
        in_array($tipo, ['house', 'building', 'amenity', 'stadium', 'place_of_worship', 'attraction'], true) || isset($r['address']['house_number']) => 'endereco',
        in_array($tipo, ['road', 'street'], true) => 'rua',
        in_array($tipo, ['suburb', 'neighbourhood', 'quarter'], true) => 'bairro',
        in_array($tipo, ['city', 'town', 'village', 'municipality'], true) => 'cidade',
        default => 'endereco',
    };
    return [
        'lat'        => round((float) $r['lat'], 6),
        'lng'        => round((float) $r['lon'], 6),
        'precisao'   => $precisao,
        'encontrado' => mb_substr((string) ($r['display_name'] ?? $endereco), 0, 120),
    ];
}
