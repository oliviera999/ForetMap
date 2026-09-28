# shellcheck shell=bash
# Chiffrement des sauvegardes BDD (audit RGPD du 28/09/2026, constat S-7).
# À sourcer depuis db-backup.sh, db-restore.sh et encrypt-existing-backups.sh.
#
# Format : `gzip | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt`, extension `.sql.gz.enc`.
# Déchiffrement manuel équivalent :
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:CLE -in X.sql.gz.enc | gunzip
# La phrase secrète est lue dans un fichier : elle n'apparaît ni dans argv ni dans
# l'environnement des processus. CBC n'authentifie pas le contenu ; l'intégrité est
# contrôlée après déchiffrement (archive gzip lisible + marque « Dump completed »).
#
# Variables :
#   BACKUP_ENCRYPT_KEY_FILE   fichier contenant la phrase secrète (vide = pas de chiffrement)
#   BACKUP_ENCRYPT_REQUIRED   1 = échec si la clé manque (défaut 0 : simple avertissement)

BACKUP_CIPHER_ARGS=(-aes-256-cbc -pbkdf2 -iter 200000 -salt)

# 0 si openssl est présent et connaît -pbkdf2 (OpenSSL ≥ 1.1.1).
backup_crypto_available() {
  command -v openssl >/dev/null 2>&1 || return 1
  openssl enc -help 2>&1 | grep -q -- '-pbkdf2'
}

# Vérifie la clé ; message d'erreur sur stderr et code 1 si inutilisable.
backup_key_usable() {
  local key_file="${1:-}"
  if [ -z "$key_file" ]; then
    echo "BACKUP_ENCRYPT_KEY_FILE non défini" >&2
    return 1
  fi
  if [ ! -r "$key_file" ]; then
    echo "clé illisible ou absente : $key_file" >&2
    return 1
  fi
  if [ ! -s "$key_file" ]; then
    echo "clé vide : $key_file" >&2
    return 1
  fi
  if ! backup_crypto_available; then
    echo "openssl absent ou trop ancien (option -pbkdf2 requise, OpenSSL ≥ 1.1.1)" >&2
    return 1
  fi
  return 0
}

# Avertit si la clé est lisible par d'autres que son propriétaire (chmod 600 attendu).
backup_key_permissions_warning() {
  local key_file="$1" mode
  mode="$(stat -c '%a' "$key_file" 2>/dev/null || stat -f '%Lp' "$key_file" 2>/dev/null || true)"
  case "$mode" in
    '' | 600 | 400) return 0 ;;
    *) echo "droits $mode sur $key_file : préférer chmod 600" >&2 ;;
  esac
}

# Sous Git Bash, openssl est un binaire Windows qui ne comprend pas `file:/c/…` : cygpath
# (absent sous Linux) redonne un chemin natif.
backup_pass_arg() {
  if command -v cygpath >/dev/null 2>&1; then
    printf 'file:%s' "$(cygpath -m "$1")"
  else
    printf 'file:%s' "$1"
  fi
}

# stdin clair → stdout chiffré.
backup_encrypt_stream() {
  openssl enc -e "${BACKUP_CIPHER_ARGS[@]}" -pass "$(backup_pass_arg "$1")"
}

# Fichier chiffré ($2) → stdout clair.
backup_decrypt_file() {
  openssl enc -d "${BACKUP_CIPHER_ARGS[@]}" -pass "$(backup_pass_arg "$1")" <"$2"
}

# Format d'une sauvegarde d'après son extension : `enc`, `gz`, ou vide si inconnu.
backup_format_of() {
  case "$1" in
    *.sql.gz.enc) echo enc ;;
    *.sql.gz) echo gz ;;
    *) echo '' ;;
  esac
}

# Lit une sauvegarde vers stdout, en SQL clair. Format ($3) déduit de l'extension si absent.
backup_read_sql() {
  local key_file="$1" file="$2" format="${3:-}"
  [ -n "$format" ] || format="$(backup_format_of "$file")"
  case "$format" in
    enc) backup_decrypt_file "$key_file" "$file" | gzip -dc ;;
    gz) gzip -dc "$file" ;;
    *)
      echo "extension inattendue : $file (.sql.gz ou .sql.gz.enc)" >&2
      return 1
      ;;
  esac
}

# 0 si la sauvegarde se lit en entier et se termine par « Dump completed ».
backup_verify() {
  local key_file="$1" file="$2" format="${3:-}" last
  last="$(
    set -o pipefail
    backup_read_sql "$key_file" "$file" "$format" | tail -n 1
  )" || return 1
  case "$last" in
    *'Dump completed'*) return 0 ;;
    *) return 1 ;;
  esac
}
