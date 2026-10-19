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
#   URL_BASE       caminho no navegador              (padrão: /cobertura)
#   MYSQL          comando para entrar como root     (padrão: mysql)
#   BACKUP_DIR     onde salvar o dump antes do SQL   (padrão: /home/tomich/backups)
#   WEB_USER       usuário do Apache                 (padrão: www-data)
#   MYSQLDUMP      comando do mysqldump como root    (padrão: mysqldump)
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BANCO=${BANCO:-wibag_cobertura}
USUARIO_BANCO=${USUARIO_BANCO:-cobertura}
URL_BASE=${URL_BASE:-/cobertura}
MYSQL=${MYSQL:-mysql}
BACKUP_DIR=${BACKUP_DIR:-/home/tomich/backups}
WEB_USER=${WEB_USER:-www-data}

passo() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
falha() { printf '\033[31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || falha "rode com sudo."
[[ $BANCO =~ ^[A-Za-z0-9_]+$ && $USUARIO_BANCO =~ ^[A-Za-z0-9_]+$ ]] || falha "BANCO e USUARIO_BANCO só aceitam letras, números e _."
[[ $URL_BASE =~ ^/[A-Za-z0-9_/-]*$ ]] || falha "URL_BASE inválida: $URL_BASE"
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

passo "Configurando o Apache em $URL_BASE"
if command -v a2enconf >/dev/null; then
  CONF=/etc/apache2/conf-available/cobertura.conf
  cat > "$CONF" <<APACHE
# Sistema Cobertura de antenas (gerado por $APP_DIR/deploy/instalar.sh)
Alias $URL_BASE $APP_DIR
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
  a2enconf -q cobertura
  apache2ctl configtest || { a2disconf -q cobertura; falha "a configuração do Apache não passou no teste; desativei cobertura.conf."; }
  systemctl reload apache2
  echo "Apache recarregado."
else
  echo "Apache (a2enconf) não encontrado. Se o servidor usa Nginx, veja deploy/nginx-cobertura.conf."
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
echo "Acesse: http://$(hostname -I 2>/dev/null | awk '{print $1}')$URL_BASE/"
