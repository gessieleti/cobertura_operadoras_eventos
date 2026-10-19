# Cobertura de antenas

Sistema PHP + MySQL feito a partir do design "Cobertura de antenas". Ele mostra um mapa do Brasil com:
- os locais de evento;
- a avaliação de cada operadora em cada evento: a rede usada e se funcionou bem, ficou instável ou não funcionou;
- as cerca de 110 mil antenas (ERBs) da Anatel, de abr/2026.

Por enquanto o sistema roda **independente** dos outros sistemas Wibag. Ele tem login próprio e um schema MySQL próprio (`wibag_cobertura`). A integração com o Portal Hub já está prevista: veja "Integrar ao Portal Hub" abaixo.

## Instalação no servidor

No servidor, com sudo:

```bash
sudo git clone https://github.com/gessieleti/cobertura_operadoras_eventos.git /var/www/cobertura
cd /var/www/cobertura
sudo bash deploy/instalar.sh
```

O `deploy/instalar.sh` faz o seguinte:
1. confere o PHP 8 e as extensões `pdo_mysql` e `mbstring`;
2. cria o schema `wibag_cobertura` e um usuário MySQL só para ele, com senha aleatória e acesso apenas a esse schema;
3. grava o `config.local.php`, que fica fora do git e só o Apache consegue ler;
4. faz um backup do schema em `/home/tomich/backups/` (se ele já tiver tabelas) e aplica os arquivos de `sql/`;
5. publica o sistema no Apache em `/cobertura`, bloqueando `lib/`, `sql/`, `data/`, `bin/`, `deploy/` e `.git`;
6. pede o login e a senha do primeiro administrador.

O script não altera os outros sistemas nem os bancos deles. Pode rodar de novo a cada atualização:

```bash
cd /var/www/cobertura && sudo git pull && sudo bash deploy/instalar.sh
```

Para instalar uma homologação separada, use outro schema e outro caminho, por exemplo `sudo BANCO=wibag_cobertura_staging URL_BASE=/cobertura-staging bash deploy/instalar.sh` (a partir de outro clone). As demais opções estão no topo do script. Se o servidor usar Nginx, há um exemplo em `deploy/nginx-cobertura.conf`.

Requisitos: PHP 8.0+ e MySQL 5.7+ ou MariaDB 10.3+. O `CHECK` de período só é aplicado a partir do MySQL 8.0.16, mas a API faz a mesma validação.

## Usuários

| Perfil | Pode |
|---|---|
| `admin` | registrar, editar e excluir eventos e locais |
| `editor` | registrar, editar e excluir eventos e locais |
| `leitor` | só consultar |

```bash
cd /var/www/cobertura
sudo php bin/criar_usuario.php joao editor "João Silva"    # cria, ou troca a senha e o perfil
sudo php bin/criar_usuario.php joao --desativar
```

A senha é pedida no terminal e precisa ter pelo menos 8 caracteres. Ela é gravada com `password_hash`.

## Integrar ao Portal Hub (futuro)

No `config.local.php`, use `'auth_modo' => 'portal'` e informe o caminho de `auth_shared`. Depois ajuste em `config.php` as chaves `sessao_usuario` e `sessao_perfil` para os nomes que o `auth_shared.php` grava em `$_SESSION`. **[a confirmar no sistema]**: hoje esses nomes são uma suposição. Nesse modo, o login e a tabela `cob_usuarios` deixam de ser usados.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.php` | Página com o mapa Leaflet e o painel lateral |
| `login.php`, `logout.php` | Entrada e saída no login próprio |
| `api.php` | API JSON: `dados`, `evento_salvar`, `evento_excluir`, `local_excluir`, `geocode` |
| `erb.php` | Entrega o arquivo compactado das antenas, com cache por ETag |
| `lib/bootstrap.php` | Configuração, PDO, sessão, perfil e CSRF |
| `lib/cobertura.php` | Regras de negócio: validação, gravação em transação, exclusões e geocodificação |
| `bin/criar_usuario.php` | Cria e desativa usuários (só pela linha de comando) |
| `deploy/instalar.sh` | Instalação e atualização no servidor |
| `assets/` | CSS, JavaScript da tela e contorno dos estados (IBGE) |
| `data/erb-anatel-2026-04.json.gz` | Antenas da Anatel |
| `sql/001_cobertura.sql`, `sql/002_usuarios.sql` | Tabelas, cada uma com o seu `_rollback.sql` |

## Segurança

- Todas as consultas usam PDO com prepared statements.
- Toda gravação exige POST com token CSRF.
- O cookie de sessão é próprio (`COBSESSID`), com as opções `HttpOnly` e `SameSite=Lax`.
- O usuário MySQL do sistema só tem `SELECT`, `INSERT`, `UPDATE` e `DELETE` no próprio schema.
- A busca por endereço usa o Nominatim (OpenStreetMap) pelo servidor. Se o servidor não tiver saída para a internet, desligue com `'geocode' => ['ativo' => false]`. Latitude e longitude, link do Google Maps e clique no mapa continuam funcionando.
