#!/usr/bin/env python3
"""Gera o arquivo de antenas do mapa a partir da planilha de ERBs da Teleco.

A planilha vem de https://www.telecocare.com.br/mapaerbs/ (dados da Anatel), com as
colunas: Número Estação, Operadora, SiglaUf, MUN, Bairro, Logradouro, Latitude,
Longitude, IBGE, ClassInfraFisica, Tecs, Faixa.

A base anterior é usada para marcar o que mudou: antenas novas, antenas que ganharam
5G e antenas que saíram da lista. Só usa a biblioteca padrão do Python.

Uso:
  python bin/gerar_erb.py ERBs_Out26.xlsx --ref out/2026 \\
      --anterior data/erb-anatel-2026-07.json.gz --saida data/erb-anatel-2026-10.json.gz
Depois aponte 'erb_arquivo' em config.php para o arquivo novo.
"""
import argparse
import collections
import gzip
import json
import math
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
COLUNAS = ['Número Estação', 'Operadora', 'SiglaUf', 'MUN', 'Bairro', 'Logradouro',
           'Latitude', 'Longitude', 'IBGE', 'ClassInfraFisica', 'Tecs', 'Faixa']
TBITS = {'5G': 8, '4G': 4, '3G': 2, '2G': 1}
# Erros de digitação já vistos na planilha.
INF_CORRIGE = {'Greenfild': 'Greenfield'}
SEM_BAIRRO = {'NA', 'N/A', '#N/A'}
# Retângulo do Brasil: linhas fora dele têm coordenada errada e ficam de fora.
LAT_MIN, LAT_MAX, LON_MIN, LON_MAX = -34.0, 5.5, -74.5, -28.5
D_MAX = 65535  # o campo d vai para um Uint16 no navegador (dezenas de metros)


def ler_xlsx(caminho):
    """Devolve as linhas da primeira planilha como listas de texto."""
    z = zipfile.ZipFile(caminho)
    textos = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for _, el in ET.iterparse(z.open('xl/sharedStrings.xml')):
            if el.tag == NS + 'si':
                textos.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                el.clear()

    def coluna(ref):
        n = 0
        for ch in re.match(r'[A-Z]+', ref).group():
            n = n * 26 + ord(ch) - 64
        return n - 1

    for _, el in ET.iterparse(z.open('xl/worksheets/sheet1.xml')):
        if el.tag != NS + 'row':
            continue
        vals = {}
        for c in el.findall(NS + 'c'):
            v, t = c.find(NS + 'v'), c.get('t')
            if t == 'inlineStr':
                x = ''.join(tt.text or '' for tt in c.iter(NS + 't'))
            elif v is None:
                x = ''
            elif t == 's':
                x = textos[int(v.text)]
            else:
                x = v.text
            vals[coluna(c.get('r'))] = x
        el.clear()
        if vals:
            yield [vals.get(i, '') for i in range(max(vals) + 1)]


def chave(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


def bairro(s):
    s = s.strip().strip('",').strip()
    if s.upper() in SEM_BAIRRO:
        return ''
    return s.title() if s.isupper() else s


def dist(a, b, c, d):
    t = math.pi / 180
    h = math.sin((c - a) * t / 2) ** 2 + math.cos(a * t) * math.cos(c * t) * math.sin((d - b) * t / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def espacamento(lat, lon, ops):
    """Média da distância (em dezenas de metros) até as 3 antenas mais próximas da
    mesma operadora, ignorando as do mesmo endereço (menos de 30 m). O navegador usa
    isso para estimar o alcance: onde as antenas são densas, cada uma cobre menos."""
    passo = 0.01  # ~1,1 km
    grade = collections.defaultdict(list)
    for i in range(len(lat)):
        grade[(ops[i], math.floor(lat[i] / passo), math.floor(lon[i] / passo))].append(i)
    out = []
    for i in range(len(lat)):
        gy, gx = math.floor(lat[i] / passo), math.floor(lon[i] / passo)
        # menor largura de uma célula aqui, para saber quando dá para parar
        cel = passo * 111320 * math.cos(math.radians(min(abs(lat[i]) + 1, 89)))
        perto = []
        anel = 0
        while True:
            for a in range(-anel, anel + 1):
                for b in range(-anel, anel + 1):
                    if max(abs(a), abs(b)) != anel:
                        continue
                    for j in grade.get((ops[i], gy + a, gx + b), ()):
                        d = dist(lat[i], lon[i], lat[j], lon[j])
                        if d > 30:
                            perto.append(d)
            perto.sort()
            del perto[3:]
            # tudo que falta ver está a mais de anel*cel metros
            if (len(perto) == 3 and anel * cel >= perto[2]) or anel * cel > D_MAX * 10:
                break
            anel += 1
        out.append(min(D_MAX, round(sum(perto) / len(perto) / 10)) if perto else D_MAX)
    return out


def gerar(linhas, ant, ref):
    cab = [c.strip() for c in next(linhas)]
    faltam = [c for c in COLUNAS if c not in cab]
    if faltam:
        sys.exit('Colunas que faltam na planilha: ' + ', '.join(faltam))
    col = {c: cab.index(c) for c in COLUNAS}

    # Nomes e listas da base anterior ficam na mesma ordem; o que for novo vai no fim.
    op_nome = {chave(o): o for o in ant['ops']}
    faixas, infs = list(ant.get('bands', [])), list(ant.get('inf', []))
    avisos = collections.Counter()

    regs, vistos = [], set()
    for r in linhas:
        r = r + [''] * (len(cab) - len(r))
        g = lambda c: r[col[c]].strip()
        num = g('Número Estação')
        if not num or num in vistos:
            avisos['número da estação vazio ou repetido'] += 1
            continue
        try:
            la, lo = float(g('Latitude').replace(',', '.')), float(g('Longitude').replace(',', '.'))
        except ValueError:
            avisos['coordenada inválida'] += 1
            continue
        if not (LAT_MIN <= la <= LAT_MAX and LON_MIN <= lo <= LON_MAX):
            avisos['coordenada fora do Brasil'] += 1
            continue
        vistos.add(num)
        op = op_nome.setdefault(chave(g('Operadora')), g('Operadora').title())
        tb = 0
        for t in set(g('Tecs').split()):
            if t in TBITS:
                tb |= TBITS[t]
            else:
                avisos['tecnologia desconhecida ' + t] += 1
        b = 0
        for x in set(g('Faixa').split()):
            if x not in faixas:
                faixas.append(x)
            b |= 1 << faixas.index(x)
        f = 0
        for x in set(g('ClassInfraFisica').replace('Ran Sharing', 'Ran_Sharing').split()):
            x = INF_CORRIGE.get(x, x.replace('_', ' '))
            if x not in infs:
                infs.append(x)
            f |= 1 << infs.index(x)
        regs.append(dict(n=num, op=op, tb=tb, b=b, f=f, la=round(la * 1e5), lo=round(lo * 1e5),
                         cid=(g('MUN'), g('SiglaUf')), a=g('Logradouro').rstrip(' ,'), br=bairro(r[col['Bairro']])))
    if len(faixas) > 16 or len(infs) > 16:
        sys.exit('Mais de 16 faixas ou tipos de instalação: o formato (Uint16) não comporta.')
    if not regs:
        sys.exit('Nenhuma antena válida na planilha.')

    regs.sort(key=lambda x: (x['la'], x['lo'], x['n']))
    presentes = {x['op'] for x in regs}
    ops = [o for o in ant['ops'] if o in presentes] + sorted(presentes - set(ant['ops']))
    if len(ops) > 16:
        sys.exit('Mais de 16 operadoras: o formato (4 bits) não comporta.')
    cidades = sorted({x['cid'] for x in regs})
    ci = {c: i for i, c in enumerate(cidades)}

    # O que mudou em relação à base anterior.
    ant_tb = {n: (m >> 4, ant['ops'][m & 15]) for n, m in zip(ant['n'], ant['m'])}
    soma = {o: dict(total=0, novas=0, g5=0, rem=0, c5=0) for o in ops}
    for x in regs:
        s = soma[x['op']]
        s['total'] += 1
        s['c5'] += bool(x['tb'] & 8)
        if x['n'] not in ant_tb:
            x['s'] = 1
            s['novas'] += 1
        elif x['tb'] & 8 and not ant_tb[x['n']][0] & 8:
            x['s'] = 2
            s['g5'] += 1
        else:
            x['s'] = 0
    rem_tot = 0
    for n, (_, o) in ant_tb.items():
        if n not in vistos:
            soma.setdefault(o, dict(total=0, novas=0, g5=0, rem=0, c5=0))['rem'] += 1
            rem_tot += 1

    print('Calculando o espaçamento entre antenas…', file=sys.stderr)
    d = espacamento([x['la'] / 1e5 for x in regs], [x['lo'] / 1e5 for x in regs], [x['op'] for x in regs])

    las, acc = [], 0
    for x in regs:
        las.append(x['la'] - acc)
        acc = x['la']
    for k, v in sorted(avisos.items()):
        print(f'Aviso: {v} linha(s) com {k}', file=sys.stderr)
    return {
        'ref': ref, 'anterior': ant.get('ref', ''),
        'ops': ops, 'bands': faixas, 'inf': infs, 'cities': [list(c) for c in cidades],
        'la': las, 'lo': [x['lo'] for x in regs],
        'm': [ops.index(x['op']) | x['tb'] << 4 for x in regs],
        'b': [x['b'] for x in regs], 'f': [x['f'] for x in regs], 's': [x['s'] for x in regs], 'd': d,
        'c': [ci[x['cid']] for x in regs], 'a': [x['a'] for x in regs], 'br': [x['br'] for x in regs],
        'n': [x['n'] for x in regs],
        'sum': soma, 'remTot': rem_tot, 'abrTot': len(ant['n']),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('planilha', help='planilha .xlsx da Teleco')
    p.add_argument('--ref', required=True, help='mês da planilha, ex.: out/2026')
    p.add_argument('--anterior', required=True, help='arquivo .json.gz da base atual')
    p.add_argument('--saida', required=True, help='arquivo .json.gz a gerar')
    a = p.parse_args()
    if not re.fullmatch(r'[a-zç]{3}/\d{4}', a.ref):
        sys.exit('--ref deve ser como out/2026')
    with gzip.open(a.anterior) as fh:
        ant = json.load(fh)
    if a.ref == ant.get('ref'):
        sys.exit(f'A base anterior já é de {a.ref}.')
    novo = gerar(ler_xlsx(a.planilha), ant, a.ref)
    with gzip.open(a.saida, 'wt', encoding='utf-8', compresslevel=9) as fh:
        json.dump(novo, fh, ensure_ascii=False, separators=(',', ':'))
    s = novo['sum']
    print(f"{len(novo['n'])} antenas ({novo['ref']}). Desde {novo['anterior'] or 'a base anterior'}: "
          f"{sum(v['novas'] for v in s.values())} novas, {sum(v['g5'] for v in s.values())} ganharam 5G, "
          f"{novo['remTot']} saíram. Gravado em {a.saida}")


if __name__ == '__main__':
    main()
