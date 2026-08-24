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

# Ein Rebase spielt jeden eigenen Commit einzeln ein und kann bei JEDEM davon
# erneut kollidieren. Die erste Fassung dieses Skripts loeste genau einen
# Konflikt und rief dann "rebase --continue" — der zweite Konflikt liess das
# Skript mit abgebrochenem Rebase und losgeloestem HEAD zurueck.
rebase_läuft() { [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; }

konflikte_lösen() {
  # news.json wird ohnehin stündlich neu gebaut -> die eigene, neuere nehmen.
  if git diff --name-only --diff-filter=U | grep -q "$NEWS"; then
    [[ -f $TMP/news.mine.json ]] && cp "$TMP/news.mine.json" "$NEWS"
    git add "$NEWS"
  fi

  # Übersetzungs-Cache vereinigen statt eine Seite wegzuwerfen. Die beiden
  # Seiten kommen direkt aus dem Index, nicht aus zwischengelegten Kopien —
  # bei mehreren Commits hintereinander sind die sonst veraltet.
  if git diff --name-only --diff-filter=U | grep -q "$CACHE"; then
    git show :2:"$CACHE" > "$TMP/a.json" 2>/dev/null || echo '{}' > "$TMP/a.json"
    git show :3:"$CACHE" > "$TMP/b.json" 2>/dev/null || echo '{}' > "$TMP/b.json"
    node -e "
      const fs = require('fs')
      const read = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} } }
      const a = read('$TMP/a.json'), b = read('$TMP/b.json')
      const merged = { ...a, ...b }
      fs.writeFileSync('$CACHE', JSON.stringify(merged))
      console.log('     Cache vereinigt ->', Object.keys(merged).length, 'Einträge')
    "
    git add "$CACHE"
  fi

  # Bleibt etwas anderes offen, ist Handarbeit gefragt.
  local rest
  rest=$(git diff --name-only --diff-filter=U)
  if [[ -n "$rest" ]]; then
    echo "     Konflikt außerhalb der generierten Dateien:"
    echo "$rest" | sed 's/^/       /'
    echo "     Bitte von Hand lösen, dann: git rebase --continue"
    exit 1
  fi
}

if git rebase origin/main >/dev/null 2>&1; then
  echo "3/4  Keine Konflikte."
else
  echo "3/4  Konflikte auflösen …"
  runde=0
  while rebase_läuft; do
    runde=$((runde + 1))
    if (( runde > 20 )); then
      echo "     Zu viele Runden — bitte manuell prüfen (git status)."
      exit 1
    fi
    konflikte_lösen
    if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
      # Kein Fortschritt und kein Rebase mehr offen -> fertig oder kaputt.
      rebase_läuft || break
    fi
  done
  echo "     $runde Konflikt(e) gelöst."
fi

if rebase_läuft; then
  echo "     Rebase steckt noch. Bitte 'git status' ansehen."
  exit 1
fi

echo "4/4  Hochladen …"
git push
echo
echo "Fertig. $(git log --oneline -1)"
