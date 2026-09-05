#!/usr/bin/env bash
# Ubuntu/Linux host, run with sudo from an extracted release bundle.
set -Eeuo pipefail
umask 077
ROOT=${SPARSITY_ROOT:-/opt/sparsity}
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
die() { echo "$*" >&2; exit 1; }
[[ $(uname -s) == Linux && $EUID == 0 ]] || die 'Run this script as root on the Linux deployment host.'
[[ $ROOT == /* && $ROOT != / && $ROOT != *[[:space:]]* ]] || die 'SPARSITY_ROOT must be an absolute path without whitespace.'
for tool in docker flock tar sha256sum; do command -v "$tool" >/dev/null || die "Missing: $tool"; done
mkdir -p "$ROOT" "$ROOT/releases" "$ROOT/backups" "$ROOT/data"
exec 9>"$ROOT/.deployment.lock"
flock -n 9 || die 'Another deployment/backup is running.'
docker info >/dev/null
docker compose version >/dev/null

valid_id() { [[ $1 =~ ^[a-z0-9][a-z0-9._-]{0,79}$ && $1 != *..* ]]; }
current() { if [[ -L $ROOT/current ]]; then basename -- "$(readlink "$ROOT/current")"; fi; }
compose() {
  local release=$1; shift
  valid_id "$release" || die 'Invalid release ID.'
  SPARSITY_ROOT="$ROOT" SPARSITY_RELEASE="$release" \
  SPARSITY_IMAGE=$(cat "$ROOT/releases/$release/image") \
  SPARSITY_PROXY_IMAGE=$(if [[ -f $ROOT/releases/$release/proxy-image ]]; then cat "$ROOT/releases/$release/proxy-image"; fi) \
  SPARSITY_ENV_FILE="$ROOT/releases/$release/runtime.env" \
    docker compose --project-name sparsity --env-file "$ROOT/releases/$release/runtime.env" \
      -f "$ROOT/releases/$release/compose.yaml" "$@"
}

verify_bundle() {
  local file digest extra actual
  local -A checksums=()
  local -a metadata files=(release.env images.tar deploy/manage.sh deploy/compose.yaml deploy/Caddyfile docs/deploy-ubuntu-26.04.md)
  [[ -f $SOURCE/SHA256SUMS && ! -L $SOURCE/SHA256SUMS && ! -L $SOURCE/deploy && ! -L $SOURCE/docs ]] || die 'Use an extracted release bundle; run npm run release:build on the build machine first.'
  while read -r digest file extra; do
    [[ $digest =~ ^[a-f0-9]{64}$ && -z $extra ]] || die 'Invalid bundle checksums.'
    case $file in
      release.env|images.tar|deploy/manage.sh|deploy/compose.yaml|deploy/Caddyfile|docs/deploy-ubuntu-26.04.md) ;;
      *) die 'Unexpected file in bundle checksums.' ;;
    esac
    [[ ! ${checksums[$file]+present} ]] || die 'Duplicate bundle checksum.'
    checksums[$file]=$digest
  done < "$SOURCE/SHA256SUMS"
  for file in "${files[@]}"; do
    [[ -f $SOURCE/$file && ! -L $SOURCE/$file && ${checksums[$file]+present} ]] || die "Missing bundle file/checksum: $file"
    actual=$(sha256sum -- "$SOURCE/$file")
    [[ ${actual%% *} == "${checksums[$file]}" ]] || die "Bundle checksum mismatch: $file"
  done
  # Parse fixed data fields; never source/evaluate a manifest as shell code.
  mapfile -t metadata < "$SOURCE/release.env"
  [[ ${#metadata[@]} == 5 && ${metadata[0]} == FORMAT_VERSION=1 ]] || die 'Unsupported release manifest.'
  BUNDLE_RELEASE=${metadata[1]#RELEASE_ID=}
  BUNDLE_PLATFORM=${metadata[2]#PLATFORM=}
  valid_id "$BUNDLE_RELEASE" && [[ ${metadata[1]} == RELEASE_ID="$BUNDLE_RELEASE" ]] || die 'Invalid bundle release ID.'
  [[ $BUNDLE_PLATFORM == linux/amd64 || $BUNDLE_PLATFORM == linux/arm64 ]] || die 'Unsupported bundle platform.'
  [[ ${metadata[2]} == PLATFORM="$BUNDLE_PLATFORM" ]] || die 'Invalid platform field.'
  BUNDLE_APP="sparsity:$BUNDLE_RELEASE-${BUNDLE_PLATFORM#linux/}"
  BUNDLE_PROXY="sparsity-caddy:$BUNDLE_RELEASE-${BUNDLE_PLATFORM#linux/}"
  [[ ${metadata[3]} == APP_IMAGE="$BUNDLE_APP" && ${metadata[4]} == PROXY_IMAGE="$BUNDLE_PROXY" ]] || die 'Invalid bundle image references.'
  actual=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
  [[ $actual == "$BUNDLE_PLATFORM" ]] || die "Bundle platform $BUNDLE_PLATFORM does not match Docker host $actual."
}
load_bundle() {
  local details
  docker image load --input "$SOURCE/images.tar"
  details=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$BUNDLE_APP")
  [[ $details =~ ^sha256:[a-f0-9]{64}\ linux/(amd64|arm64)$ && ${details#* } == "$BUNDLE_PLATFORM" ]] || die 'Loaded app image does not match the release platform.'
  LOADED_APP=${details%% *}
  details=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$BUNDLE_PROXY")
  [[ $details =~ ^sha256:[a-f0-9]{64}\ linux/(amd64|arm64)$ && ${details#* } == "$BUNDLE_PLATFORM" ]] || die 'Loaded proxy image does not match the release platform.'
  LOADED_PROXY=${details%% *}
  # Capture local immutable IDs after load: Docker's classic and containerd
  # image stores can represent the same saved image with different IDs.
}
point_to() {
  ln -sfn "releases/$1" "$ROOT/.current-next"
  mv -Tf "$ROOT/.current-next" "$ROOT/current"
}
snapshot() {
  local label=$1
  SNAPSHOT=$(mktemp -d "$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  echo "$label" > "$SNAPSHOT/release"
  tar --numeric-owner -cpf "$SNAPSHOT/data.tar" -C "$ROOT/data" .
  (cd "$SNAPSHOT" && sha256sum data.tar > SHA256SUMS)
  if [[ -n $label ]]; then cp "$ROOT/releases/$label/runtime.env" "$SNAPSHOT/runtime.env"; fi
}
restore_data() {
  local backup=$1 staging displaced
  (cd "$backup" && sha256sum -c SHA256SUMS) || return 1
  staging=$(mktemp -d "$ROOT/.restore-XXXXXX") || return 1
  tar --numeric-owner -xpf "$backup/data.tar" -C "$staging" || return 1
  # Preserve the failed/newer data for diagnosis; never delete it automatically.
  displaced=$(mktemp -d "$SNAPSHOT/displaced-XXXXXX") || return 1
  mv "$ROOT/data" "$displaced/data" || return 1
  mv "$staging" "$ROOT/data" || return 1
  chown 1000:1000 "$ROOT/data" || return 1
}
restart_release() {
  compose "$1" up -d --no-deps --force-recreate --wait --wait-timeout 120 app || return 1
  compose "$1" up -d --no-deps --force-recreate proxy
}

OLD= TARGET= SNAPSHOT= NEED_RECOVERY=0
recover() {
  local status=$1
  trap - ERR INT TERM
  set +e
  if [[ $NEED_RECOVERY == 1 ]]; then
    echo 'Operation failed; keeping public traffic stopped while recovering.' >&2
    compose "$TARGET" stop proxy app
    if [[ -n $SNAPSHOT && -f $SNAPSHOT/SHA256SUMS ]]; then
      if ! restore_data "$SNAPSHOT"; then
        echo "Automatic data recovery failed. Services remain stopped. Backup: $SNAPSHOT" >&2
        exit 1
      fi
    fi
    if [[ -n $OLD ]]; then
      point_to "$OLD" || echo 'Could not restore the current symlink; inspect release metadata.' >&2
      if restart_release "$OLD"; then echo "Recovered release: $OLD" >&2;
      else echo 'Previous release could not restart; inspect docker compose logs.' >&2; fi
    elif [[ $(current) == "$TARGET" ]]; then
      rm -- "$ROOT/current"
    fi
  fi
  exit "$status"
}
trap 'recover $?' ERR
trap 'recover 130' INT
trap 'recover 143' TERM

switch_release() {
  TARGET=$1
  OLD=$(current)
  # Validate credentials and proxy configuration before stopping anything.
  compose "$TARGET" run --rm --no-deps app node --input-type=module -e "import {getConfig} from './server/config.mjs'; getConfig()"
  compose "$TARGET" run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  NEED_RECOVERY=1
  if [[ -n $OLD ]]; then
    compose "$OLD" stop proxy
    compose "$OLD" stop app
  fi
  snapshot "$OLD"
  compose "$TARGET" run --rm --no-deps app node scripts/migrate-node.mjs
  compose "$TARGET" up -d --no-deps --force-recreate --wait --wait-timeout 120 app
  # Do not reopen ingress until the application can serve real pages as well as healthz.
  compose "$TARGET" exec -T app node scripts/smoke-node.mjs
  point_to "$TARGET"
  compose "$TARGET" up -d --no-deps --force-recreate proxy
  NEED_RECOVERY=0
  if [[ -n $OLD ]]; then echo "$OLD" > "$ROOT/previous"; fi
  echo "Active: $TARGET; pre-change backup: $SNAPSHOT"
}

case ${1:-help} in
  load)
    verify_bundle
    load_bundle
    echo "Loaded $BUNDLE_RELEASE ($BUNDLE_PLATFORM)."
    ;;
  init)
    [[ ! -e $ROOT/config.env && ! -L $ROOT/config.env ]] || die 'config.env already exists; refusing to replace administrator credentials.'
    verify_bundle
    load_bundle
    CONFIG_TEMP=$(mktemp "$ROOT/.config-XXXXXX")
    if ! docker run --rm --pull=never --network none "$LOADED_APP" node scripts/credentials.mjs > "$CONFIG_TEMP"; then
      rm -- "$CONFIG_TEMP"
      die 'Could not generate administrator credentials.'
    fi
    if ! ln -- "$CONFIG_TEMP" "$ROOT/config.env"; then
      rm -- "$CONFIG_TEMP"
      die 'Could not install config.env without overwriting it.'
    fi
    rm -- "$CONFIG_TEMP"
    echo "Created $ROOT/config.env. Set SITE_ORIGIN before deploying."
    ;;
  deploy)
    verify_bundle
    TARGET=${2:-$BUNDLE_RELEASE}
    valid_id "$TARGET" || die 'Use a unique lowercase release ID, e.g. v0.1.0-abcdef1.'
    [[ ! -e $ROOT/releases/$TARGET ]] || die 'Release exists. Use a new ID, or rollback to an existing release.'
    [[ -f $ROOT/config.env ]] || die "Create $ROOT/config.env using the credentials command."
    chmod 600 "$ROOT/config.env"
    load_bundle
    mkdir "$ROOT/releases/$TARGET"
    cp "$SOURCE/deploy/compose.yaml" "$SOURCE/deploy/Caddyfile" "$ROOT/releases/$TARGET/"
    cp "$ROOT/config.env" "$ROOT/releases/$TARGET/runtime.env"
    cp "$SOURCE/release.env" "$ROOT/releases/$TARGET/release.env"
    echo "$LOADED_APP" > "$ROOT/releases/$TARGET/image"
    echo "$LOADED_PROXY" > "$ROOT/releases/$TARGET/proxy-image"
    chown 1000:1000 "$ROOT/data"
    switch_release "$TARGET"
    ;;
  rollback)
    TARGET=${2:-$(cat "$ROOT/previous")}
    valid_id "$TARGET" && [[ -f $ROOT/releases/$TARGET/image ]] || die 'Unknown release.'
    # Ordinary rollback preserves all current articles/images and requires the same schema.
    compose "$TARGET" run --rm --no-deps app node scripts/migrate-node.mjs --check
    switch_release "$TARGET"
    ;;
  backup)
    OLD=$(current); [[ -n $OLD ]] || die 'No active release.'
    TARGET=$OLD; NEED_RECOVERY=1
    compose "$OLD" stop proxy
    compose "$OLD" stop app
    snapshot "$OLD"
    restart_release "$OLD"
    NEED_RECOVERY=0
    echo "Consistent database + media backup: $SNAPSHOT"
    ;;
  restore)
    BACKUP=${2:?Usage: restore BACKUP_DIRECTORY --confirm-data-loss}
    [[ ${3:-} == --confirm-data-loss ]] || die 'Restore replaces current data. Review the backup, then pass --confirm-data-loss.'
    BACKUP=$(realpath "$BACKUP")
    [[ -f $BACKUP/release && -f $BACKUP/SHA256SUMS ]] || die 'Not a sparsity backup.'
    TARGET=$(cat "$BACKUP/release")
    valid_id "$TARGET" && [[ -f $ROOT/releases/$TARGET/image ]] || die 'Backup has no retained release/image.'
    (cd "$BACKUP" && sha256sum -c SHA256SUMS)
    OLD=$(current); [[ -n $OLD ]] || die 'Use the disaster-recovery procedure in the deployment guide for an empty host.'
    NEED_RECOVERY=1
    compose "$OLD" stop proxy
    compose "$OLD" stop app
    snapshot "$OLD"
    restore_data "$BACKUP"
    compose "$TARGET" run --rm --no-deps app node scripts/migrate-node.mjs --check
    compose "$TARGET" up -d --no-deps --force-recreate --wait --wait-timeout 120 app
    compose "$TARGET" exec -T app node scripts/smoke-node.mjs
    point_to "$TARGET"
    compose "$TARGET" up -d --no-deps --force-recreate proxy
    NEED_RECOVERY=0
    echo "Restored $TARGET from $BACKUP; newer data preserved in $SNAPSHOT"
    ;;
  status|logs)
    OLD=$(current); [[ -n $OLD ]] || die 'No active release.'
    if [[ $1 == status ]]; then compose "$OLD" ps; else compose "$OLD" logs --tail 100; fi
    ;;
  *)
    echo 'Usage: sudo bash deploy/manage.sh init | load | deploy [RELEASE] | rollback [RELEASE] | backup | restore BACKUP --confirm-data-loss | status | logs'
    ;;
esac
