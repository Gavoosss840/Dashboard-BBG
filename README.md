# Boulet Capital — Internal Terminal

Terminal interne ("Bloomberg maison") pour la gestion de mandats individuels,
avant transition vers un fonds structuré. Backend FastAPI + frontend React,
données de démonstration (mock) en attendant la connexion Interactive Brokers.

## Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend**: React + TypeScript + Vite + Tailwind v4 + Recharts (`frontend/`)

## Lancer en local — le plus simple

Double-clique sur **`start.sh`** (Mac/Linux) ou **`start.bat`** (Windows) à la
racine du repo — il faut avoir Docker Desktop installé et lancé au préalable.
Le script construit les images, démarre les services en arrière-plan et ouvre
http://localhost:3000 dans ton navigateur. Pour tout arrêter : double-clique
sur `stop.sh` / `stop.bat`.

> Sur Mac, un double-clic sur un `.sh` peut l'ouvrir dans un éditeur de texte
> plutôt que l'exécuter (dépend des réglages du Finder) — dans ce cas,
> clique droit → "Ouvrir avec" → "Terminal", ou lance-le depuis un terminal :
> `./start.sh`.

## Lancer en local — Docker (manuel)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend / API: http://localhost:8000 (docs interactives sur http://localhost:8000/docs)

La base SQLite vit dans un volume Docker nommé (`backend-data`) : les données
persistent entre les redémarrages (`docker compose down` sans `-v` conserve le
volume ; `docker compose down -v` repart d'un jeu de données propre).

Pour reconstruire après une modification de code : `docker compose up --build`.
Pour tout arrêter : `docker compose down`.

## Lancer en local — sans Docker

```bash
# Backend (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

La base SQLite (`backend/boulet_capital.db`) est créée et peuplée automatiquement
au premier démarrage du backend (`app/seed_data.py`). Supprimez le fichier pour
regénérer un jeu de données propre.

## Modules

| Module | Route frontend | Description |
|---|---|---|
| Dashboard | `/` | AUM total, P&L YTD/since inception, NAV globale, répartition par poche/classe d'actifs |
| Clients | `/clients`, `/clients/:id` | Fiche client (dépôts, P&L, mandats, positions) |
| Portfolio | `/portfolio` | Composition consolidée (classe d'actifs, secteur, région, devise, client) |
| Financier | `/financier` | Tracker des frais de gestion / performance, statuts de facturation |
| Mandats | `/mandates` | Répertoire des mandats de gestion (frais, hurdle, HWM, benchmark) |
| CRM | `/crm` | Pipeline prospects/clients en kanban |
| Watchlist & News | `/market` | Watchlist éditable + fil d'actualités |
| Earnings | `/earnings` | Calendrier de résultats avec alertes on/off |
| Allocation de capital | `/allocation` | Outil de répartition Stock Picking / Arbitrage Algo (risk parity) |
| Référence | `/reference` | Glossaire, structure des frais, procédures internes |
| Users | `/users` | Profils des associés |

Devise d'affichage commutable (USD/EUR/CHF/HKD/JPY/GBP/AED) en haut à droite —
tous les montants sont reconvertis à la volée via `/api/fx/rates`.

## Allocation de capital — méthode

`backend/app/services/risk_parity.py` implémente une allocation en **Equal
Risk Contribution (risk parity pure)**, sans contrainte min/max, entre les
poches de stratégie (`Stock Picking`, `Arbitrage Algorithmique`). Pour deux
poches, la solution ERC est mathématiquement équivalente à une pondération
inverse-vol (indépendante de la corrélation) — c'est le cas fermé utilisé ici.
Un solveur numérique général (SLSQP) prend le relais automatiquement si une
3ᵉ poche est ajoutée. La vol réalisée est calculée sur une fenêtre glissante
de 60 jours (paramétrable par bucket).

## Intégration Interactive Brokers (à venir)

Toutes les données sont actuellement mockées (`backend/app/seed_data.py`,
seed déterministe, ancré au 15/07/2026) pour permettre de développer et
tester chaque module sans dépendre de l'accès IBKR. Le point d'entrée prévu
pour la connexion réelle est `backend/app/services/ibkr.py` — voir les
commentaires du fichier pour le mapping exact (positions, NAV, P&L réalisé)
vers les modèles existants (`Position`, `NavHistory`). Une fois le connecteur
IBKR autorisé, aucune modification de l'API ni du frontend n'est nécessaire :
il suffit d'implémenter `IBKRClient` et un job planifié qui synchronise les
tables au lieu du seed aléatoire.

## Pistes d'amélioration identifiées

- Moteur de frais automatisé (facturation, high-water mark, hurdle) relié au
  module Financier
- Module de compliance/KYC-AML avec échéances de renouvellement
- Module de risque (VaR, stress test, corrélations, concentration)
- Reporting client automatisé (PDF/Excel, TWR/IRR vs benchmark)
- Audit trail immuable sur les transactions
- RBAC par rôle (admin/associé/lecture seule)
- Alerting multi-canal (email/SMS/push) sur drawdown, margin call, earnings
- Abstraction multi-custodian (au-delà d'IBKR)
- Data room pour les futurs documents de souscription du fonds
