#!/bin/sh
set -e

# Tailscale is optional — only start it when credentials are provided.
# Works with tailscale.com or any Headscale-compatible server via
# TAILSCALE_LOGIN_SERVER.
if [ -n "${TAILSCALE_AUTH_KEY}" ] || [ -n "${TAILSCALE_OAUTH_CLIENT_SECRET}" ]; then
  tailscaled --tun=linux --socket=/var/run/tailscale/tailscaled.sock &
  sleep 2

  TS_ARGS="--hostname dflow --accept-dns"
  [ -n "${TAILSCALE_LOGIN_SERVER}" ] && TS_ARGS="${TS_ARGS} --login-server ${TAILSCALE_LOGIN_SERVER}"

  if [ -n "${TAILSCALE_OAUTH_CLIENT_SECRET}" ]; then
    tailscale up --authkey="${TAILSCALE_OAUTH_CLIENT_SECRET}?preauthorized=true" ${TS_ARGS} || true
  else
    tailscale up --authkey="${TAILSCALE_AUTH_KEY}" ${TS_ARGS} || true
  fi

  trap 'echo "Logging out of Tailscale..."; tailscale logout; exit 0' TERM INT
fi

readonly PRIMARY='\033[38;2;120;66;242m'
readonly NC='\033[0m'

{
    printf '%b\n' \
    '                                                  ' \
    '                       ****                       ' \
    '                     *******                      ' \
    '                    ********                      ' \
    '                   +++*****                       ' \
    '                  ++++++++                        ' \
    '                +++++++++   ++***                 ' \
    '                +++++++    +++++**                ' \
    '              =+++++++   ++++++++                 ' \
    '             =====+++   ++++++++   ++             ' \
    '            ========   ++++++++   ++++            ' \
    '           ========  ===++++++  +++++++           ' \
    '         =========  =======++  +++++++++          ' \
    '        ========   ========    +++++++++++        ' \
    '       ----====   ========   ====++++++++++       ' \
    '      -------=   ========   ========++++++++      ' \
    '     ------------======    ========  ==++++++     ' \
    '   -----------------==-   ========  ======++++    ' \
    '   ------------------     =======  ==========++   ' \
    '    ----------------       -==-    ===========    ' \
    '                                                  ' \
    "     ${PRIMARY}█████ ███████████ ████${NC}                          " \
    "    ${PRIMARY}░░███ ░░███░░░░░░█░░███${NC}                          " \
    "  ${PRIMARY}███████  ░███   █ ░  ░███   ██████  █████ ███ █████${NC}" \
    " ${PRIMARY}███░░███  ░███████    ░███  ███░░███░░███ ░███░░███${NC} " \
    "${PRIMARY}░███ ░███  ░███░░░█    ░███ ░███ ░███ ░███ ░███ ░███${NC} " \
    "${PRIMARY}░███ ░███  ░███  ░     ░███ ░███ ░███ ░░███████████${NC}  " \
    "${PRIMARY}░░████████ █████       █████░░██████   ░░████░████${NC}   " \
    " ${PRIMARY}░░░░░░░░ ░░░░░       ░░░░░  ░░░░░░     ░░░░ ░░░░${NC}    " \
    '' \
    '=====================================================' \
    '             🚀 Welcome to dFlow! 🚀' \
    '          A lightweight developer PaaS  ' \
    '             powered by ⚙️  Dokku' \
    '' \
    '        🌐 GitHub:    https://github.com/Dvorinka/dflow  ' \
    '    '
    printf '%b\n' \
    '====================================================='
}

if [ -n "${TAILSCALE_AUTH_KEY}" ] || [ -n "${TAILSCALE_OAUTH_CLIENT_SECRET}" ]; then
  tailscale status | awk '
  {
    status = ($NF == "-" ? "online" : "offline")
    if ($2 ~ /^vmi/) {
      dflow[status]++
    } else if ($2 ~ /^dfi/) {
      custom[status]++
    }
  }
  END {
    printf "\ndFlow servers:\n"
    printf "🟢 Online devices:  %d\n", dflow["online"] + 0
    printf "🔴 Offline devices: %d\n", dflow["offline"] + 0

    printf "\ncustom servers:\n"
    printf "🟢 Online devices:  %d\n", custom["online"] + 0
    printf "🔴 Offline devices: %d\n", custom["offline"] + 0
  }'
fi


# 🔁 Replace placeholders in built output
NEXT_PUBLIC_WEBSITE_URL="${NEXT_PUBLIC_WEBSITE_URL}"
NEXT_PUBLIC_PROXY_DOMAIN_URL="${NEXT_PUBLIC_PROXY_DOMAIN_URL}"
NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN="${NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN}"
NEXT_PUBLIC_BETTER_STACK_INGESTING_URL="${NEXT_PUBLIC_BETTER_STACK_INGESTING_URL}"
NEXT_PUBLIC_PROXY_CNAME="${NEXT_PUBLIC_PROXY_CNAME}"

# 🪄 Replace values in built static files
find .next -type f -exec sed -i "s~__NEXT_PUBLIC_WEBSITE_URL__~${NEXT_PUBLIC_WEBSITE_URL}~g" {} +
find .next -type f -exec sed -i "s~__NEXT_PUBLIC_PROXY_DOMAIN_URL__~${NEXT_PUBLIC_PROXY_DOMAIN_URL}~g" {} +
find .next -type f -exec sed -i "s~__NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN__~${NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN}~g" {} +
find .next -type f -exec sed -i "s~https://s1.eu.betterstackdata.com~${NEXT_PUBLIC_BETTER_STACK_INGESTING_URL}~g" {} +
find .next -type f -exec sed -i "s~__NEXT_PUBLIC_PROXY_CNAME__~${NEXT_PUBLIC_PROXY_CNAME}~g" {} +

# Run your Next.js app
exec node server.js
