#!/bin/sh
# Runs before nginx starts (/docker-entrypoint.d, after
# 18-validate-runtime-config.sh checked these settings): writes the files
# that let the phones open this site's /app/* links in the app, served at
# /.well-known/ (default.conf.template):
#   - apple-app-site-association, from APPLE_TEAM_ID and IOS_BUNDLE_ID;
#   - assetlinks.json, from ANDROID_PACKAGE and ANDROID_SHA256_CERT_FINGERPRINTS.
# The app claims the same paths (apps/mobile/src/lib/links.ts, APP_LINK_PATHS;
# apps/mobile/app.config.ts, APP.linkDomain). A pair left unset writes no
# file: nginx answers 404, the phones open the links in the browser (the
# open-in-app page), and the log says so. In /tmp, writable by nginx's
# unprivileged user and on a read-only root filesystem too.
set -eu

dir=${APP_LINKS_DIR:-/tmp/app-links}
mkdir -p "$dir"
rm -f "$dir/apple-app-site-association" "$dir/assetlinks.json"

if [ -n "${APPLE_TEAM_ID:-}" ]; then
  printf '{"applinks":{"details":[{"appIDs":["%s.%s"],"components":[{"/":"/app/*","comment":"The links of the app"}]}]}}\n' \
    "$APPLE_TEAM_ID" "$IOS_BUNDLE_ID" > "$dir/apple-app-site-association"
else
  echo "warning: APPLE_TEAM_ID and IOS_BUNDLE_ID are not set: no apple-app-site-association, iPhones open /app/* links in the browser" >&2
fi

if [ -n "${ANDROID_PACKAGE:-}" ]; then
  fingerprints=$(printf '%s' "$ANDROID_SHA256_CERT_FINGERPRINTS" | sed 's/[^,][^,]*/"&"/g')
  printf '[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"%s","sha256_cert_fingerprints":[%s]}}]\n' \
    "$ANDROID_PACKAGE" "$fingerprints" > "$dir/assetlinks.json"
else
  echo "warning: ANDROID_PACKAGE and ANDROID_SHA256_CERT_FINGERPRINTS are not set: no assetlinks.json, Android opens /app/* links in the browser" >&2
fi
