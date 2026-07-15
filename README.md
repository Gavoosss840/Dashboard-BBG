# Boulet Capital — Internal Terminal

Terminal interne ("Bloomberg maison") pour la gestion de mandats individuels,
avant transition vers un fonds structuré. Backend FastAPI + frontend React.

**La plateforme démarre vide** — aucun client, aucune AUM fictive. Seule la
configuration structurelle est préchargée (devises, glossaire des frais, les
deux poches d'allocation Stock Picking / Arbitrage Algorithmique). Tout le
reste (clients, mandats, portefeuilles, positions, CRM, users) se crée et se
modifie entièrement depuis l'interface — voir "CRUD complet" ci-dessous.

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

### Raccourcis Bureau (Windows)

Pour avoir une icône directement sur le Bureau (comme une vraie application) :
double-clique une fois sur **`Installer les raccourcis Bureau.bat`** à la
racine du repo. Ça crée deux raccourcis sur ton Bureau Windows :

- **Boulet Capital - Demarrer**
- **Boulet Capital - Arreter**

Ensuite tu n'as plus jamais besoin d'ouvrir le dossier : tout se pilote depuis
ces deux icônes.

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

La base SQLite (`backend/boulet_capital.db`) est créée automatiquement au
premier démarrage du backend (`app/seed_data.py`), avec seulement la
configuration structurelle (voir plus haut). Supprimez le fichier pour repartir
d'un état vide propre.

### Mode démo (données fictives)

Pour recharger un jeu de données de démonstration (8 clients fictifs,
positions, CRM, watchlist, etc. — utile pour tester l'UI ou faire une démo,
jamais pour de vraies données client) : définissez `SEED_DEMO_DATA=true` avant
de démarrer le backend (ou dans `docker-compose.yml`), puis supprimez la base
existante pour forcer un re-seed :

```bash
SEED_DEMO_DATA=true uvicorn app.main:app --reload --port 8000
```

## CRUD complet

Tout se crée, modifie et supprime depuis l'interface :

- **Clients** (`/clients`) : créer/modifier/supprimer un client, ses mandats,
  ses portefeuilles et ses positions — directement depuis la fiche client.
- **CRM** (`/crm`) : créer/modifier/supprimer un contact (tous les champs, pas
  seulement l'étape du pipeline).
- **Users** (`/users`) : créer/modifier/supprimer un associé.

Supprimer un client supprime en cascade ses mandats, portefeuilles, positions,
historique NAV, cash-flows, transactions et documents de compliance associés.

## Modules

| Module | Route frontend | Description |
|---|---|---|
| Dashboard | `/` | AUM total, P&L YTD/since inception, NAV globale, répartition par poche/classe d'actifs |
| Clients | `/clients`, `/clients/:id` | Fiche client (dépôts, P&L, mandats, positions) |
| Portfolio | `/portfolio` | Composition consolidée (classe d'actifs, secteur, région, devise, client) |
| Financier | `/financier` | Tracker des frais + fee engine (calcul live, génération de facture, cristallisation de la performance fee) |
| Compliance | `/compliance` | Suivi KYC/AML/suitability par client, renouvellement en un clic, échéances de mandat |
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

## Pistes d'amélioration restantes

- Module de risque (VaR, stress test, corrélations, concentration)
- Reporting client automatisé (PDF/Excel, TWR/IRR vs benchmark)
- Audit trail immuable sur les transactions
- RBAC par rôle (admin/associé/lecture seule)
- Alerting multi-canal (email/SMS/push) sur drawdown, margin call, earnings
- Abstraction multi-custodian (au-delà d'IBKR)
- Data room pour les futurs documents de souscription du fonds
