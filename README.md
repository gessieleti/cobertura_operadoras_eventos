# Cobertura de antenas (módulo PHP)

Versão PHP + MySQL do design "Cobertura de antenas": mapa do Brasil com os locais
de evento, a avaliação de cada operadora por evento (funcionou bem / instável /
não funcionou, e a rede usada) e as ~110 mil antenas (ERBs) da Anatel, abr/2026.

## O que tem

| Arquivo | Função |
|---|---|
| `index.php` | Página (mapa Leaflet + painel lateral). Redireciona para o login se não houver sessão. |
| `api.php` | API JSON: `dados`, `evento_salvar`, `evento_excluir`, `local_excluir`, `geocode`. |
| `erb.php` | Entrega o arquivo compactado das antenas (cache por ETag). |
| `lib/bootstrap.php` | Configuração, PDO, sessão, perfil e CSRF. |
| `lib/cobertura.php` | Regras: validação, gravação em transação, exclusões, geocodificação. |
| `assets/` | CSS, JavaScript da tela e contorno dos estados (IBGE). |
| `data/erb-anatel-2026-04.json.gz` | Antenas da Anatel (extraídas do design). |
| `sql/001_cobertura.sql` | Criação das tabelas `cob_locais`, `cob_eventos`, `cob_resultados`. |
| `sql/001_cobertura_rollback.sql` | Desfaz a criação. |

## Instalação (homologação primeiro)

1. Backup do schema em `/home/tomich/backups/`.
2. Rodar `sql/001_cobertura.sql` no `wibag_staging`.
3. Copiar a pasta `cobertura/` para o servidor (ex.: `/var/www/html/cobertura`).
4. Criar `config.local.php` a partir de `config.local.example.php` com o DSN,
   usuário e senha do MySQL e o caminho do `auth_shared.php`.
5. Abrir `http://<servidor>:8081/cobertura/` logado no Portal.
6. Depois da Sprint Review, repetir em produção (`wibag_system`).

Requisitos: PHP 8.0+ com `pdo_mysql` e `mbstring`; MySQL 8.0.16+ (o `CHECK` de
período é ignorado em versões anteriores, mas a API valida do mesmo jeito).

## Login e permissões

- Se o arquivo configurado em `auth_shared` existir, ele é incluído antes de tudo.
- O usuário e o perfil são lidos de `$_SESSION` pelas chaves de `sessao_usuario`
  e `sessao_perfil` em `config.php`. **[a confirmar no sistema]** Os nomes
  padrão são uma suposição: ajuste para os que o `auth_shared.php` grava.
- Quem tem perfil em `perfis_edicao` registra, edita e exclui. Os demais só veem.
- Toda escrita exige POST com token CSRF. Todas as consultas usam prepared statements.

## Diferenças em relação ao design

- Os dados ficam no MySQL do Wibag System, não no armazenamento do artifact.
- A busca por endereço usa o Nominatim (OpenStreetMap) pelo servidor. Se o
  servidor não tiver saída para a internet, desligue em `geocode.ativo`; latitude
  e longitude, link do Google Maps e clique no mapa continuam funcionando.
- O nome de quem criou ou alterou cada evento é gravado (`criado_por`, `atualizado_por`).

## Próximos passos sugeridos

- Ligar o evento de cobertura ao evento da Agenda (coluna opcional na `cob_eventos`)
  para sugerir a melhor combinação de chips por operadora ao montar a Wibag.
- Adicionar o card do módulo no Portal Hub.
