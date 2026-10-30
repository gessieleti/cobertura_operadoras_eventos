#!/usr/bin/env bash
# Instala ou atualiza o sistema Cobertura de antenas no servidor
# (Linux com Apache, PHP 8 e MySQL/MariaDB). Pode rodar de novo a cada atualização:
# não recria o banco, não troca a senha e não apaga dados.
#
# Uso, no servidor:
#   sudo git clone https://github.com/gessieleti/cobertura_operadoras_eventos.git /var/www/cobertura
#   cd /var/www/cobertura && sudo bash deploy/instalar.sh
# Para atualizar depois:
#   cd /var/www/cobertura && sudo git pull && sudo bash deploy/instalar.sh
#
# Variáveis opcionais (ex.: sudo BANCO=wibag_cobertura_staging bash deploy/instalar.sh):
#   BANCO          schema do MySQL                  (padrão: wibag_cobertura)
#   USUARIO_BANCO  usuário do MySQL do sistema       (padrão: cobertura)
#   PORTA          porta exclusiva do sistema        (padrão: 18443; vazio = /cobertura na porta padrão)
#   SSL_CERT, SSL_KEY  certificado e chave para servir HTTPS na PORTA (padrão: HTTP)
#   URL_BASE       caminho no navegador, só com PORTA vazio (padrão: /cobertura)
#   MYSQL          comando para entrar como root     (padrão: mysql)
#   BACKUP_DIR     onde salvar o dump antes do SQL   (padrão: /home/tomich/backups)
#   WEB_USER       usuário do Apache                 (padrão: www-data)
#   MYSQLDUMP      comando do mysqldump como root    (padrão: mysqldump)
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BANCO=${BANCO:-wibag_cobertura}
USUARIO_BANCO=${USUARIO_BANCO:-cobertura}
PORTA=${PORTA-18443}
URL_BASE=${URL_BASE:-/cobertura}
MYSQL=${MYSQL:-mysql}
BACKUP_DIR=${BACKUP_DIR:-/home/tomich/backups}
WEB_USER=${WEB_USER:-www-data}

passo() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
falha() { printf '\033[31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || falha "rode com sudo."
[[ $BANCO =~ ^[A-Za-z0-9_]+$ && $USUARIO_BANCO =~ ^[A-Za-z0-9_]+$ ]] || falha "BANCO e USUARIO_BANCO só aceitam letras, números e _."
[[ $URL_BASE =~ ^/[A-Za-z0-9_/-]*$ ]] || falha "URL_BASE inválida: $URL_BASE"
[[ -z $PORTA || ( $PORTA =~ ^[0-9]+$ && $PORTA -ge 1 && $PORTA -le 65535 ) ]] || falha "PORTA inválida: $PORTA"
mysql_root() { $MYSQL "$@"; }

passo "Conferindo PHP"
command -v php >/dev/null || falha "PHP não encontrado. Instale: apt install php php-mysql php-mbstring"
php -r 'exit(PHP_VERSION_ID >= 80000 ? 0 : 1);' || falha "precisa de PHP 8.0 ou mais novo (tem $(php -r 'echo PHP_VERSION;'))."
for ext in pdo_mysql mbstring; do
  php -m | grep -qi "^$ext\$" || falha "extensão PHP '$ext' faltando. Instale: apt install php-mysql php-mbstring"
done
echo "PHP $(php -r 'echo PHP_VERSION;') ok"

passo "Conferindo acesso ao MySQL como root"
mysql_root -e 'SELECT 1' >/dev/null || falha "não consegui entrar no MySQL com '$MYSQL'. Ex.: sudo MYSQL='mysql -uroot -p' bash deploy/instalar.sh"

CONFIG="$APP_DIR/config.local.php"
if [[ -f $CONFIG ]]; then
  passo "config.local.php já existe: mantendo banco e senha atuais"
else
  passo "Criando o banco $BANCO e o usuário $USUARIO_BANCO"
  SENHA=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS \`$BANCO\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$USUARIO_BANCO'@'localhost' IDENTIFIED BY '$SENHA';
ALTER USER '$USUARIO_BANCO'@'localhost' IDENTIFIED BY '$SENHA';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$BANCO\`.* TO '$USUARIO_BANCO'@'localhost';
FLUSH PRIVILEGES;
SQL
  umask 027
  cat > "$CONFIG" <<PHP
<?php
// Gerado por deploy/instalar.sh em $(date '+%Y-%m-%d %H:%M'). Não vai para o git.
return [
    'db' => [
        'dsn'     => 'mysql:host=localhost;dbname=$BANCO;charset=utf8mb4',
        'usuario' => '$USUARIO_BANCO',
        'senha'   => '$SENHA',
    ],
];
PHP
  umask 022
  echo "Senha do banco gravada em $CONFIG"
fi
chown root:"$WEB_USER" "$CONFIG"
chmod 640 "$CONFIG"

passo "Backup do schema $BANCO antes de aplicar o SQL"
TABELAS=$(mysql_root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$BANCO'")
if [[ $TABELAS -gt 0 ]]; then
  mkdir -p "$BACKUP_DIR"
  DUMP="$BACKUP_DIR/${BANCO}-$(date +%Y%m%d-%H%M%S).sql.gz"
  ${MYSQLDUMP:-mysqldump} --single-transaction --routines "$BANCO" | gzip > "$DUMP"
  echo "Backup: $DUMP"
else
  echo "Schema vazio, nada para salvar."
fi

passo "Aplicando o SQL"
for f in "$APP_DIR"/sql/[0-9]*.sql; do
  [[ $f == *_rollback.sql ]] && continue
  echo "  $(basename "$f")"
  mysql_root "$BANCO" < "$f"
done

passo "Permissões dos arquivos"
chown -R root:"$WEB_USER" "$APP_DIR"
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
chmod 640 "$CONFIG"

REGRAS_APACHE=$(cat <<APACHE
    <Directory $APP_DIR>
        Options -Indexes -FollowSymLinks
        AllowOverride None
        Require all granted
        DirectoryIndex index.php
    </Directory>
    <DirectoryMatch "^$APP_DIR/(lib|sql|data|bin|deploy|\.git)(/|$)">
        Require all denied
    </DirectoryMatch>
    <Files "config.local.php">
        Require all denied
    </Files>
APACHE
)

if ! command -v a2enconf >/dev/null; then
  echo "Apache (a2enconf) não encontrado. Se o servidor usa Nginx, veja deploy/nginx-cobertura.conf."
elif [[ -n $PORTA ]]; then
  passo "Configurando o Apache na porta $PORTA"
  # A porta só pode estar livre ou já ser do Apache (instalação anterior).
  DONO=""
  if command -v ss >/dev/null; then
    DONO=$(ss -ltnpH "sport = :$PORTA" 2>/dev/null | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2 || true)
  fi
  if [[ -n $DONO && $DONO != apache2 && $DONO != httpd ]]; then
    falha "a porta $PORTA já está em uso por '$DONO'. Escolha outra com PORTA=..."
  fi

  SITE=/etc/apache2/sites-available/cobertura.conf
  # Só declara o Listen se nenhum outro arquivo do Apache já declarar essa porta.
  LISTEN="Listen $PORTA"
  if grep -rqsE "^\s*Listen\s+([0-9.:]*:)?$PORTA(\s|$)" /etc/apache2 --exclude=cobertura.conf; then
    LISTEN="# Listen $PORTA já declarado em outro arquivo do Apache"
  fi
  SSL=""
  ESQUEMA=http
  if [[ -n ${SSL_CERT:-} && -n ${SSL_KEY:-} ]]; then
    [[ -r $SSL_CERT && -r $SSL_KEY ]] || falha "não consegui ler SSL_CERT ou SSL_KEY."
    a2enmod -q ssl
    SSL=$(printf '    SSLEngine on\n    SSLCertificateFile %s\n    SSLCertificateKeyFile %s' "$SSL_CERT" "$SSL_KEY")
    ESQUEMA=https
  fi
  cat > "$SITE" <<APACHE
# Sistema Cobertura de antenas (gerado por $APP_DIR/deploy/instalar.sh)
$LISTEN
<VirtualHost *:$PORTA>
    DocumentRoot $APP_DIR
$SSL
$REGRAS_APACHE
    ErrorLog \${APACHE_LOG_DIR}/cobertura-error.log
    CustomLog \${APACHE_LOG_DIR}/cobertura-access.log combined
</VirtualHost>
APACHE
  a2ensite -q cobertura
  # Versões anteriores deste script publicavam em /cobertura na porta padrão.
  [[ -e /etc/apache2/conf-enabled/cobertura.conf ]] && a2disconf -q cobertura && echo "Desativei o endereço antigo em /cobertura da porta padrão."
  apache2ctl configtest || { a2dissite -q cobertura; falha "a configuração do Apache não passou no teste; desativei o site cobertura."; }
  # reload (graceful) abre a porta nova sem derrubar os outros sistemas do Apache.
  systemctl reload apache2
  sleep 1
  if ! command -v ss >/dev/null; then
    echo "Apache recarregado. Confira se a porta $PORTA abriu: curl -I http://127.0.0.1:$PORTA/"
  elif ss -ltnH "sport = :$PORTA" 2>/dev/null | grep -q .; then
    echo "Apache ouvindo na porta $PORTA."
  else
    echo "O Apache ainda não abriu a porta $PORTA. Rode: sudo systemctl restart apache2"
  fi
  URL="$ESQUEMA://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORTA/"
else
  passo "Configurando o Apache em $URL_BASE na porta padrão"
  CONF=/etc/apache2/conf-available/cobertura.conf
  { echo "# Sistema Cobertura de antenas (gerado por $APP_DIR/deploy/instalar.sh)"
    echo "Alias $URL_BASE $APP_DIR"
    echo "$REGRAS_APACHE" | sed 's/^    //'; } > "$CONF"
  a2enconf -q cobertura
  [[ -e /etc/apache2/sites-enabled/cobertura.conf ]] && a2dissite -q cobertura && echo "Desativei o site da porta exclusiva."
  apache2ctl configtest || { a2disconf -q cobertura; falha "a configuração do Apache não passou no teste; desativei cobertura.conf."; }
  systemctl reload apache2
  echo "Apache recarregado."
  URL="http://$(hostname -I 2>/dev/null | awk '{print $1}')$URL_BASE/"
fi

# Outra configuração apontando para esta pasta (ex.: uma porta antiga) continua publicando o sistema.
OUTRAS=$(grep -RlsF "$APP_DIR" /etc/apache2/sites-enabled /etc/apache2/conf-enabled /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
         | while read -r f; do [[ $(readlink -f "$f") == */cobertura.conf ]] || echo "$f"; done || true)
if [[ -n $OUTRAS ]]; then
  echo
  echo "ATENÇÃO: estes arquivos também publicam $APP_DIR (talvez numa porta antiga). Confira e desative se não forem mais usados:"
  while read -r f; do
    echo "  $f"
    case $f in
      /etc/apache2/sites-enabled/*) n=$(basename "$f" .conf); echo "      sudo a2dissite $n && sudo systemctl reload apache2" ;;
      /etc/apache2/conf-enabled/*)  n=$(basename "$f" .conf); echo "      sudo a2disconf $n && sudo systemctl reload apache2" ;;
    esac
    grep -hoE '<VirtualHost[^>]*:[0-9]+' "$f" | grep -oE '[0-9]+$' | sort -u | while read -r p; do
      grep -RlsE "^\s*Listen\s+([0-9.:]*:)?$p(\s|$)" /etc/apache2 | sed "s|^|      a porta $p também é aberta por \"Listen $p\" em |"
    done
  done <<< "$OUTRAS"
fi
if [[ -n $PORTA ]] && command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw status | grep -qE "^$PORTA(/tcp)?\s" || echo "O firewall (ufw) está ativo e não libera a porta $PORTA. Para liberar: sudo ufw allow $PORTA/tcp"
fi

passo "Usuários do sistema"
QTD=$(mysql_root -N "$BANCO" -e 'SELECT COUNT(*) FROM cob_usuarios WHERE ativo = 1')
if [[ $QTD -eq 0 ]]; then
  echo "Nenhum usuário ainda. Vamos criar o administrador."
  read -rp "Login do administrador [admin]: " LOGIN_ADMIN
  php "$APP_DIR/bin/criar_usuario.php" "${LOGIN_ADMIN:-admin}" admin "Administrador"
else
  echo "$QTD usuário(s) ativo(s). Para criar outro: php bin/criar_usuario.php <login> <admin|editor|leitor> \"Nome\""
fi

passo "Pronto"
echo "Acesse: ${URL:-http://<servidor>$URL_BASE/}"
