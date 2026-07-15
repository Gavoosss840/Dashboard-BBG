#!/bin/bash
cd "$(dirname "$0")"
docker compose down
read -p "Services arrêtés. Appuyez sur Entrée pour fermer..."
