#!/bin/sh
# Runs before nginx renders its templates (/docker-entrypoint.d, in order:
# after 15-local-resolvers.envsh, before 19-app-links.sh and
# 20-envsubst-on-templates.sh): the runtime settings end up inside an nginx
# config and inside JSON (the app's link files), so each one must have the
# shape its consumer expects. A bad value stops the container with the
# variable's name, never its value (docs/environment.md#web-variables).
set -eu

fail() {
  echo "Environment variable $1 is invalid: $2" >&2
  exit 1
}

newline='
'
carriage_return=$(printf '\r')

# One line, and none of the characters that end or escape a JSON string or
# the single-quoted nginx string around it, or that nginx would read as a
# variable: checked first, since grep matches line by line, so a second line
# would ride in on a valid first one.
matches() {
  case "$1" in
    *"$newline"* | *"$carriage_return"* | *\"* | *\'* | *\\* | *\$*) return 1 ;;
  esac
  printf '%s' "$1" | grep -Eq "$2"
}

# Required: the site's public origin, written into the landing's absolute
# links (canonical and alternate links, sitemap, robots.txt) as they are
# served. A wrong one sends search engines elsewhere, so no default.
matches "${APP_ORIGIN:-}" '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' ||
  fail APP_ORIGIN 'the public origin of the site, such as https://app.example.com: no path, no trailing slash'
# The build (the image sets it from its APP_RELEASE build argument), served
# as /release.json.
matches "${APP_RELEASE:-}" '^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$' ||
  fail APP_RELEASE 'letters, digits, ".", "_", "+", "-"'
# Where /api goes (the image's default: http://api:3000), into the nginx
# string of proxy_pass: an origin, nothing after it. nginx sends a request to
# a proxy_pass variable that carries a path to that path, not to its own, so
# with one every /api/* call would reach the same URL.
matches "${API_UPSTREAM:-}" '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' ||
  fail API_UPSTREAM 'where /api goes, such as http://api:3000: a scheme, a host and an optional port; no path, no trailing slash'

# Optional, in pairs: the app's identity, for the files that let the phones
# open /app/* links in it (19-app-links.sh). Half a pair is a mistake, not a
# choice: it stops the container.
if [ -n "${APPLE_TEAM_ID:-}${IOS_BUNDLE_ID:-}" ]; then
  matches "${APPLE_TEAM_ID:-}" '^[A-Z0-9]{10}$' ||
    fail APPLE_TEAM_ID 'the 10-character Team ID of the Apple Developer account, set together with IOS_BUNDLE_ID'
  matches "${IOS_BUNDLE_ID:-}" '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' ||
    fail IOS_BUNDLE_ID 'the iOS bundle identifier (com.example.app), set together with APPLE_TEAM_ID'
fi
if [ -n "${ANDROID_PACKAGE:-}${ANDROID_SHA256_CERT_FINGERPRINTS:-}" ]; then
  matches "${ANDROID_PACKAGE:-}" '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$' ||
    fail ANDROID_PACKAGE 'the Android application id (com.example.app), set together with ANDROID_SHA256_CERT_FINGERPRINTS'
  matches "${ANDROID_SHA256_CERT_FINGERPRINTS:-}" '^[0-9A-F]{2}(:[0-9A-F]{2}){31}(,[0-9A-F]{2}(:[0-9A-F]{2}){31})*$' ||
    fail ANDROID_SHA256_CERT_FINGERPRINTS 'the SHA-256 fingerprints of the signing certificates, AB:CD:… in capitals, separated by commas, set together with ANDROID_PACKAGE'
fi

# From /etc/resolv.conf (15-local-resolvers.envsh): nginx looks API_UPSTREAM up
# again through it (default.conf.template).
[ -n "${NGINX_LOCAL_RESOLVERS:-}" ] ||
  fail NGINX_LOCAL_RESOLVERS 'no nameserver in /etc/resolv.conf to look API_UPSTREAM up with'
