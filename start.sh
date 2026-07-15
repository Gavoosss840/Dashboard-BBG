#!/bin/bash
# Double-clic (ou "sh start.sh" dans un terminal) pour lancer la plateforme.
# Nécessite Docker Desktop installé et démarré.
cd "$(dirname "$0")"

echo "Démarrage de Boulet Capital — Internal Terminal..."
docker compose up --build -d

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
