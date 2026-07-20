#!/bin/bash
# Double-clic (ou "sh start.sh" dans un terminal) pour lancer la plateforme.
# Nécessite Docker Desktop installé et démarré, et Git installé.
cd "$(dirname "$0")"

echo "============================================"
echo "  B. Horizon Capital - Internal Terminal"
echo "============================================"
echo ""

if [ -d .git ]; then
  echo "Récupération des dernières mises à jour (git pull)..."
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if ! git pull origin "$BRANCH"; then
    echo ""
    echo "ATTENTION : le git pull a échoué (pas de connexion, ou conflit local)."
    echo "On continue avec le code déjà présent sur cette machine."
  fi
  echo ""
fi

echo "Démarrage en cours (peut prendre 1-2 min la première fois, ou après une mise à jour)..."
if ! docker compose up --build -d; then
  echo ""
  echo "ERREUR : Docker Desktop est-il bien installé et démarré ?"
  read -p "Appuyez sur Entrée pour fermer..."
  exit 1
fi

echo ""
echo "Prêt : http://localhost:3000"
echo "API  : http://localhost:8000/docs"
echo ""
echo "Pour tout arrêter : ./stop.sh"

# Ouvre le navigateur automatiquement si possible
sleep 2
if command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000
fi

read -p "Appuyez sur Entrée pour fermer cette fenêtre (les services continuent de tourner)..."
