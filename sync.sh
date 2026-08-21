#!/usr/bin/env bash
#
# Eigene Änderungen hochladen, ohne mit dem News-Bot zu kollidieren.
#
# Der Bot committet stündlich docs/data/news.json und docs/data/i18n-cache.json.
# Wer zwischendurch selbst etwas ändert, bekommt beim Push ein "rejected
# (fetch first)". Dieses Skript räumt das auf:
#
#   1. Den Bot-Stand holen
#   2. Die eigenen Commits darauf setzen (rebase)
#   3. Bei Konflikten in den generierten Dateien automatisch entscheiden:
#      - news.json  -> die eigene, neuere Fassung
#      - i18n-cache -> beide Seiten VEREINIGEN, damit keine bereits bezahlte
#                      Übersetzung verloren geht und neu angefordert wird
#   4. Pushen
#
# Aufruf:  ./sync.sh
set -euo pipefail
cd "$(dirname "$0")"

NEWS=docs/data/news.json
CACHE=docs/data/i18n-cache.json
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Es liegen uncommittete Änderungen vor. Bitte zuerst committen."
  git status --short
  exit 1
fi

echo "1/4  Bot-Stand holen …"
git fetch -q origin main

if git merge-base --is-ancestor origin/main HEAD; then
  echo "     Nichts Neues vom Bot."
else
  echo "     $(git rev-list --count HEAD..origin/main) neue Bot-Commits."
fi

# Eigene Fassung der generierten Dateien sichern, bevor der Rebase sie anfasst.
[[ -f $NEWS ]] && cp "$NEWS" "$TMP/news.mine.json"
[[ -f $CACHE ]] && cp "$CACHE" "$TMP/cache.mine.json"
git show origin/main:$CACHE > "$TMP/cache.remote.json" 2>/dev/null || echo '{}' > "$TMP/cache.remote.json"

echo "2/4  Eigene Commits daraufsetzen …"
if ! git rebase origin/main >/dev/null 2>&1; then
  if [[ ! -d .git/rebase-merge && ! -d .git/rebase-apply ]]; then
    echo "     Rebase fehlgeschlagen und kein Konflikt offen — bitte manuell prüfen."
    exit 1
  fi
  echo "3/4  Konflikte in den generierten Dateien auflösen …"

  # news.json wird ohnehin stündlich neu gebaut -> die eigene, neuere nehmen.
  [[ -f $TMP/news.mine.json ]] && cp "$TMP/news.mine.json" "$NEWS"

  # Übersetzungs-Cache vereinigen statt eine Seite wegzuwerfen.
  node -e "
    const fs = require('fs')
    const read = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} } }
    const mine = read('$TMP/cache.mine.json')
    const remote = read('$TMP/cache.remote.json')
    const merged = { ...remote, ...mine }
    fs.writeFileSync('$CACHE', JSON.stringify(merged))
    console.log('     Cache vereinigt:', Object.keys(remote).length, '+', Object.keys(mine).length,
                '->', Object.keys(merged).length, 'Einträge')
  "

  git add "$NEWS" "$CACHE"
  GIT_EDITOR=true git rebase --continue >/dev/null
else
  echo "3/4  Keine Konflikte."
fi

echo "4/4  Hochladen …"
git push
echo
echo "Fertig. $(git log --oneline -1)"
