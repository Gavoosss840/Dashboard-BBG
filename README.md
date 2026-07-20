# B. Horizon Capital — Internal Terminal

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

## Authentification & sécurité

Toute l'API (sauf `/api/health` et les endpoints de login) exige un token —
sans compte, aucune donnée n'est accessible. Au tout premier lancement,
l'application affiche un écran de **création du compte administrateur**
(nom, email, mot de passe ≥ 8 caractères) au lieu du login, tant qu'aucun
compte n'existe. Ensuite, c'est un écran de connexion classique.

Le token de session vit dans `sessionStorage` du navigateur : il survit à un
rafraîchissement de page mais disparaît à la fermeture de l'onglet/navigateur.

- **Clé de signature** : générée aléatoirement au premier démarrage et
  stockée dans le volume de données (`auth_secret.key`) — aucune valeur par
  défaut forgeable. `AUTH_SECRET_KEY` en variable d'environnement permet
  d'imposer sa propre clé.
- **Anti brute-force** : 5 échecs de connexion sur un email → compte
  verrouillé 15 minutes (HTTP 429).
- **Rôles appliqués (RBAC)** :
  | Rôle | Droits |
  |---|---|
  | `admin` | Tout, y compris gestion des utilisateurs, suppression de clients, journal d'audit |
  | `associate` / `analyst` | Tout sauf gestion des utilisateurs et suppression de clients |
  | `viewer` | Lecture seule (peut changer son propre mot de passe) |
- **Journal d'audit** (`/audit`, admins uniquement) : trace immuable de
  chaque action de modification — qui, quoi, quand, résultat — y compris les
  tentatives de connexion et les actions refusées. Les corps de requêtes ne
  sont jamais stockés (ils peuvent contenir des mots de passe).

## Sauvegardes

La base est sauvegardée automatiquement **une fois par jour** (et à la
demande depuis la page Données & Synchro) dans le dossier `backups/` du
projet, directement sur ta machine — il survit même à un
`docker compose down -v`. Les 30 dernières copies sont conservées.
Recommandé : synchroniser ce dossier vers OneDrive/Drive pour une copie hors
machine. Pour restaurer : arrêter la plateforme, remplacer la base du volume
par le fichier de sauvegarde choisi, redémarrer.

## Lancer en local — le plus simple

Double-clique sur **`start.sh`** (Mac/Linux) ou **`start.bat`** (Windows) à la
racine du repo — il faut avoir Docker Desktop **et Git** installés, et Docker
Desktop lancé au préalable. Le script :

1. récupère automatiquement les dernières mises à jour (`git pull`) — pas
   besoin d'ouvrir VS Code ni un terminal pour ça,
2. construit les images si besoin,
3. démarre les services en arrière-plan,
4. ouvre http://localhost:3000 dans ton navigateur.

Pour tout arrêter : double-clique sur `stop.sh` / `stop.bat`. Si le `git pull`
échoue (pas de connexion, conflit local), le script continue quand même avec
le code déjà présent sur la machine plutôt que de bloquer.

> Sur Mac, un double-clic sur un `.sh` peut l'ouvrir dans un éditeur de texte
> plutôt que l'exécuter (dépend des réglages du Finder) — dans ce cas,
> clique droit → "Ouvrir avec" → "Terminal", ou lance-le depuis un terminal :
> `./start.sh`.

### Raccourcis Bureau (Windows)

Pour avoir une icône directement sur le Bureau (comme une vraie application) :
double-clique une fois sur **`Installer les raccourcis Bureau.bat`** à la
racine du repo. Ça crée deux raccourcis sur ton Bureau Windows :

- **B. Horizon Capital - Demarrer**
- **B. Horizon Capital - Arreter**

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

**Migrations** : il n'y a pas d'Alembic ici — `app/migrate.py` ajoute
automatiquement au démarrage les colonnes qu'un modèle a gagné depuis la
dernière fois (ex: l'ajout du mot de passe, des frais d'entrée/sortie), sans
jamais toucher aux données déjà présentes. Une mise à jour normale
(`git pull` + relancer) suffit donc à absorber les évolutions de schéma — pas
besoin de `docker compose down -v` à chaque fois, ce reset reste réservé à un
vrai retour à zéro volontaire.

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
  ses portefeuilles, ses positions, ses dépôts/retraits (liste éditable avec
  modifier/supprimer par ligne) et ses **contributions récurrentes (DCA)** —
  directement depuis la fiche client.
- **CRM** (`/crm`) : créer/modifier/supprimer un contact (tous les champs, pas
  seulement l'étape du pipeline).
- **Users** (`/users`) : créer/modifier/supprimer un associé.
- **Objectifs d'AUM** (`/financier`) : créer/modifier/supprimer un objectif
  d'AUM cible, avec barre de progression vs AUM réelle.

Supprimer un client supprime en cascade ses mandats, portefeuilles, positions,
historique NAV, cash-flows, transactions et documents de compliance associés.

## Modules

| Module | Route frontend | Description |
|---|---|---|
| Dashboard | `/` | AUM total, P&L YTD/since inception, NAV globale, répartition par poche/classe d'actifs |
| Clients | `/clients`, `/clients/:id` | Fiche client (dépôts, P&L, mandats, positions) |
| Portfolio | `/portfolio` | Composition consolidée (classe d'actifs, secteur, région, devise, client) |
| Financier | `/financier` | Objectifs d'AUM éditables, tracker des frais + fee engine (calcul live, génération de facture, cristallisation de la performance fee) |
| Compliance | `/compliance` | Suivi KYC/AML/suitability par client, renouvellement en un clic, échéances de mandat |
| Mandats | `/mandates` | Répertoire des mandats de gestion (frais d'entrée/gestion/sortie/performance, hurdle, HWM, benchmark) |
| CRM | `/crm` | Pipeline prospects/clients en kanban |
| Marchés | `/markets` | Vue globale : indices mondiaux, devises, matières premières, crypto, taux US + fil d'actualités live |
| Recherche Equity | `/research/:symbol?` | Workflow de recherche : 4 feeds (prix, news, données, sentiment) → verdict de valorisation → Risk Gate |
| Watchlist & News | `/market` | Watchlist éditable + actualités live par valeur |
| Page titre | `/security/:symbol` | Page complète par valeur : cours quasi temps réel, graphique 1J→MAX (volume, MM50/MM200), ratios complets, consensus analystes, historique de résultats, profil société, actualités, détention interne |
| Earnings | `/earnings` | Calendrier de résultats **live** (dates Yahoo Finance) pour les valeurs de la watchlist, avec alertes on/off |
| Allocation de capital | `/allocation` | Outil de répartition Stock Picking / Arbitrage Algo (risk parity) |
| Référence | `/reference` | Glossaire, structure des frais, procédures internes |
| Users | `/users` | Profils des associés |

Devise d'affichage commutable (USD/EUR/CHF/HKD/JPY/GBP/AED) en haut à droite —
tous les montants sont reconvertis à la volée via `/api/fx/rates`.

## Terminal de marché

**Vue des marchés (`/markets`)** : le tableau de bord global — 9 indices
(S&P 500, Nasdaq, Dow, CAC 40, DAX, FTSE, Euro Stoxx 50, Nikkei, Hang Seng),
6 paires de devises (dont EUR/CHF), 6 matières premières (or, argent, WTI,
Brent, gaz, cuivre), crypto (BTC/ETH/SOL) et la courbe des taux US (3 mois →
30 ans). Chaque ligne est cliquable et rafraîchie toutes les 30 s, avec le
fil d'actualités live en colonne de droite.

**La page titre (`/security/:symbol`)** en détail :

- **Graphique** : 8 périodes (1J → MAX), volume en barres superposées,
  moyennes mobiles 50 et 200 jours activables sur les périodes quotidiennes.
- **Ratios & données financières** en 5 blocs : *Valorisation* (cap., valeur
  d'entreprise, PER trailing/forward, PEG, P/B, P/S, VE/EBITDA, VE/CA, bêta),
  *Rentabilité & croissance* (CA, croissances, marges brute/op./nette, EBITDA,
  ROE, ROA, BPA), *Santé financière* (trésorerie, dette, dette/fonds propres,
  current & quick ratio, FCF, cash-flow op.), *Dividende* (rendement, montant,
  payout, ex-date, moyenne 5 ans), *Actionnariat & flottant* (actions en
  circulation, flottant, initiés, institutionnels, short interest).
- **Consensus analystes** : note et libellé, répartition achat fort → vente
  forte en barre, fourchette d'objectifs bas/moyen/haut avec position du
  cours actuel et upside, prochaine date de résultats.
- **Historique de résultats** : BPA trimestriel réel vs estimé, CA et
  bénéfice net annuels sur 4 ans.
- **Profil** : description, industrie, siège, effectifs, site web, dirigeants.
- Les champs indisponibles (indices, FX, crypto…) sont masqués — la page
  dégrade proprement selon le type d'instrument.

**Actualités live** : agrégées par valeur de la watchlist (dédupliquées,
triées par heure), affichées sur `/markets` et dans l'onglet News de
`/market`, avec lien vers la source.

## Recherche Equity & Risk Gate

Le workflow de recherche (`/research`) suit le principe *« d'abord, la
recherche ; le risque peut bloquer le trade — c'est tout l'intérêt »* :

1. **Quatre feeds d'entrée** par titre : 01 Price Feed (cours, plages),
   02 News Feed (dernières actualités), 03 Market Data (indicateurs et
   fondamentaux clés), 04 Sentiment (répartition des recommandations
   analystes, note moyenne, short interest, détention institutionnelle).
2. **Verdict de valorisation** (`backend/app/services/valuation.py`) :
   estime une juste valeur et le potentiel de hausse/baisse à l'instant T,
   avec un verdict SOUS-ÉVALUÉ / CORRECT / SURÉVALUÉ et une jauge. Deux
   moteurs partagent le même affichage :
   - **Algo Taurus** (`backend/app/services/taurus.py`) — **port fidèle**
     (validé bit-à-bit) du moteur Modigliani-Miller de la stratégie
     [Trading-strategy-Taurus](https://github.com/Gavoosss840/Trading-strategy-Taurus).
     Valeur théorique levée `VL = valeur d'entreprise − coûts de détresse
     (Merton, queue Student-t ν=5) − coûts d'agence`, avec taux de distress
     par secteur, spread de crédit fonction du levier, et probabilité de
     défaut de Merton. La **divergence** `(VL − capitalisation) / capitalisation`
     donne directement le sur/sous-évaluation à l'instant T (seuil ±25 %,
     comme dans Taurus). La carte affiche la décomposition complète (VE,
     dette nette, bouclier fiscal, détresse, agence, P(défaut), levier) et le
     **momentum vol-ajusté** (Jegadeesh-Titman 12M‑1M / Barroso-Santa-Clara)
     comme confirmation de tendance. Actif dès que Yahoo fournit le bilan
     (capitalisation, dette, fonds propres) — badge « ⬢ Algo Taurus ».
   - **Modèle standard** (fallback transparent) — objectif analystes pondéré,
     nombre de Graham, juste valeur PEG=1 (Lynch), DCF simplifié FCF — utilisé
     pour les instruments sans bilan (indices, ETF, FX, crypto).

3. **Signal composite Taurus** (`backend/app/services/taurus_factors.py` +
   `taurus_universe.py`) — la stratégie complète, sur la page Recherche
   Equity. Le signal est `0.40·z(alpha FF5/6) + 0.30·z(divergence MM) +
   0.30·z(momentum)`, exactement comme dans le repo :
   - **Jambe alpha (CAPM + FF5/FF6 → SML alpha)** : régression OLS vectorisée
     des rendements mensuels du titre sur les facteurs Ken French **régionaux**
     (US / Europe / Japon / Asie-Pacifique, choisis selon la cotation), avec
     erreurs-types **HC1** et seuil **Student-t (ν=5)**. Port validé bit-à-bit
     de `taurus/factors.py`. La carte affiche l'alpha annualisé, le t-stat, la
     significativité, le R² et les 6 betas factoriels (Marché, SMB, HML, RMW,
     CMA, UMD).
   - **z-score cross-sectionnel** : un signal composite se normalise contre une
     distribution de pairs. Un **batch univers** (constituants de l'indice de
     la région) calcule les 3 jambes sur ~40-50 pairs, en déduit la
     médiane/MAD de chaque jambe (mis en cache 24 h, calculé en tâche de fond),
     et place le titre dedans (z robuste, clip ±3). Le composite pondéré donne
     un score et une orientation LONG (≥ +0,5) / NEUTRE / SHORT (≤ −0,5).
   - Pendant le calcul du batch, la carte montre « univers en cours de
     calcul » et la jambe alpha reste disponible immédiatement.

   > Ce qui reste dans le repo Python (hors terminal) : la **construction de
   > portefeuille** — CML/min-variance, beta-neutral, covariance Ledoit-Wolf,
   > sector caps — qui dimensionne et équilibre un book de 25 longs / 25 shorts
   > sur l'univers. Ce n'est pas une valorisation par titre : ça appartient au
   > moteur de rebalancement mensuel, pas à la fiche recherche.
   > Aide à la décision interne, pas un conseil d'investissement.
3. **Risk Gate** (`backend/app/routers/risk.py`) : le trade proposé passe
   5 règles évaluées contre le portefeuille réel — taille de position
   (% NAV), exposition sectorielle après trade, gel en cas de drawdown
   au-delà du seuil, stop loss de discipline (niveau d'invalidation
   suggéré), et un **kill switch** d'arrêt d'urgence. Toutes les règles
   passent, ou le trade est BLOQUÉ — aucune exception. Les seuils sont
   éditables dans l'interface (`/api/risk/settings`).

La carte de valorisation apparaît aussi sur chaque page titre, avec un lien
« Recherche Equity → » pour ouvrir le workflow complet.

Trois éléments transverses, présents sur toutes les pages :

- **Bande de cotation défilante** (sous la barre du haut) : les valeurs de la
  watchlist avec prix et variation du jour, rafraîchies toutes les 30 s.
  Cliquer une valeur ouvre sa page titre ; survoler met la bande en pause.
  Si Yahoo est injoignable, la bande affiche la dernière valeur connue (grisée).
- **Barre de commande `Ctrl+K`** (ou le bouton ⌕ en haut) : recherche
  instantanée sur les marchés mondiaux (actions, ETF, indices, crypto — via
  Yahoo), sur les clients et sur les pages de la plateforme. Navigation au
  clavier (↑ ↓, Entrée, Échap).
- **Page titre `/security/:symbol`** : le cœur du terminal. Prix rafraîchi
  toutes les 15 s, plage du jour et 52 semaines, graphique de cours sur
  8 périodes (1J, 5J, 1M, 6M, YTD, 1A, 5A, MAX), fondamentaux et consensus
  analystes (capitalisation, PER, BPA, dividende, bêta, marge, croissance,
  objectif de cours), profil complet de la société, actualités, bouton
  watchlist, et le croisement avec **vos portefeuilles** (quels clients
  détiennent le titre, quantités, PRU). Tous les tickers de la plateforme
  (watchlist, positions, blotter) sont cliquables et mènent à cette page.

Précision honnête sur le « temps réel » : les cours viennent de Yahoo Finance
en polling (15–30 s). C'est du temps réel pour les places US ; certaines
bourses (selon les licences Yahoo) peuvent être différées de 15 min. Le vrai
streaming tick-par-tick nécessiterait IB Gateway — étape ultérieure prévue.

## Allocation de capital — méthode

`backend/app/services/risk_parity.py` implémente une allocation en **Equal
Risk Contribution (risk parity pure)**, sans contrainte min/max, entre les
poches de stratégie (`Stock Picking`, `Arbitrage Algorithmique`). Pour deux
poches, la solution ERC est mathématiquement équivalente à une pondération
inverse-vol (indépendante de la corrélation) — c'est le cas fermé utilisé ici.
Un solveur numérique général (SLSQP) prend le relais automatiquement si une
3ᵉ poche est ajoutée. La vol réalisée est calculée sur une fenêtre glissante
de 60 jours (paramétrable par bucket).

## Structure de frais

Chaque mandat porte les 4 frais classiques de la gestion d'actifs / hedge fund :

- **Frais d'entrée** (`entry_fee_pct`) : appliqué automatiquement quand tu
  enregistres un dépôt (`+ Dépôt / Retrait` sur la fiche client) — génère une
  transaction `entry_fee` dans Financier.
- **Frais de gestion** (`mgmt_fee_pct`) : accrual live pro-rata NAV, facturé via
  le fee engine.
- **Frais de sortie** (`exit_fee_pct`) : appliqué automatiquement sur un
  retrait, même logique que les frais d'entrée.
- **Performance fee** (`perf_fee_pct`, avec High-Water Mark et hurdle
  optionnel) : cristallisée via le fee engine.

## Intégration Interactive Brokers (Flex Web Service)

La plateforme se synchronise sur les **relevés officiels IBKR** via le Flex
Web Service (`backend/app/services/ibkr.py`) — sans logiciel Gateway à faire
tourner. Chaque synchro importe, par compte IBKR (le `accountId` U1234567
doit correspondre à l'« ID Portefeuille » d'un portefeuille de la plateforme) :

- **Positions** avec les marks officiels du custodian (remplacées à chaque synchro)
- **Trades** dans le blotter, dédupliqués par identifiant d'exécution IBKR
- **Dépôts/retraits** → flux de trésorerie du client (les dividendes/intérêts
  sont exclus des flux : c'est de la performance, pas des apports)
- **NAV officielle** par jour → historique de NAV (base du calcul TWR)
- **Cash par devise** → soldes de trésorerie du portefeuille

Tout est **automatique dès que le portefeuille est rattaché** (voir plus
haut) : ajouter un portefeuille avec le bon « ID Portefeuille » suffit — la
prochaine synchro (auto ou manuelle) importe positions, NAV, dépôts/retraits
et cash pour ce compte, sans autre configuration par client.

**Plusieurs logins IBKR** (ex : un login séparé par client) : ajouter une
connexion par login. Une seule connexion suffit si tous les comptes sont
visibles sous un seul login (compte advisor/master).

Configuration : la Flex Query et le token se créent toujours manuellement
dans le portail IBKR (aucun système tiers n'a d'accès direct à cette étape,
IBKR ne propose pas de connexion en un clic pour ce type d'accès) — le guide
pas-à-pas complet est sur la page **Données & Synchro**. Une fois le token en
main, deux façons de le renseigner :

- **Directement dans la plateforme** (recommandé) : carte **« Connexions
  IBKR »** sur la page Données & Synchro — colle le token et le Query ID,
  donne un libellé, clique *Ajouter la connexion*. Actif immédiatement, sans
  éditer de fichier ni redémarrer. Le bouton **Tester** vérifie tout de suite
  que la connexion fonctionne (appel réel à IBKR) et affiche les comptes
  couverts. Stocké dans `backend/ibkr_connections.json` — **un fichier séparé
  de la base de données**, chmod 600, jamais inclus dans les sauvegardes
  automatiques (donc jamais synchronisé vers OneDrive/Drive avec elles),
  jamais dans git (`.gitignore`). Le token n'est jamais renvoyé en clair par
  l'API après enregistrement — seuls les 4 derniers caractères sont affichés.
- **Via `docker-compose.yml`** (méthode historique, toujours supportée) :
  `IBKR_FLEX_TOKEN` / `IBKR_FLEX_QUERY_ID` (ou `_1`, `_2`… pour plusieurs
  connexions). Nécessite d'éditer le fichier et de redémarrer la plateforme
  à chaque changement.

Le token ne quitte jamais ta machine, quelle que soit la méthode. La synchro
tourne automatiquement au démarrage (si la dernière date de plus de 12h) et
à la demande depuis la page. Pour la **première** synchro, configurer la
Flex Query sur *Last 365 Calendar Days* pour rattraper l'historique de
l'année, puis repasser sur *Last Business Day*.

> ⚠ La déduplication des dépôts/retraits importés se fait sur le **contenu**
> (date + montant + devise + type), pas sur un identifiant stable. Modifier
> ou supprimer un mouvement **saisi manuellement** est permanent. Modifier ou
> supprimer un mouvement **importé depuis IBKR** peut le faire réapparaître
> à la prochaine synchro, puisque la ligne d'origine ne sera plus trouvée et
> sera réimportée telle quelle.

## Contributions récurrentes (DCA)

Pour les clients qui versent un montant fixe chaque mois : sur la fiche
client, carte **« Contributions récurrentes (DCA) »**, définir un montant,
un jour du mois (1-28, pour rester valide tous les mois) et une date de
début. La plateforme génère automatiquement le dépôt (ou retrait) correspondant
dès que la date est atteinte — avec les mêmes frais d'entrée/sortie du mandat
actif qu'un dépôt manuel — sans doublon même si la vérification tourne
plusieurs fois dans le mois (`backend/app/services/recurring.py`). On peut
suspendre/réactiver, modifier ou supprimer une récurrence à tout moment ;
la prochaine échéance est affichée dans la liste.

## Données de marché (gratuit)

- **Prix** : Yahoo Finance — quasi temps réel sur la bande de cotation et les
  pages titres (polling 15–30 s), et rafraîchissement périodique des prix
  stockés (watchlist, positions) entre deux synchros IBKR. Pour les places
  étrangères, renseigner le « symbole data » (ex : `0700.HK`, `MC.PA`,
  `NESN.SW`) dans la watchlist.
- **Fondamentaux, ratios, consensus analystes, historique de résultats,
  profil société, recherche et actualités** : Yahoo Finance
  (`backend/app/services/securities.py`). L'accès aux fondamentaux passe par
  le mécanisme cookie+crumb de Yahoo ; si Yahoo le durcit un jour, la page
  titre dégrade proprement (cours et graphique restent).
- **Caches côté backend** pour la réactivité et pour ménager les quotas
  Yahoo : cotations 20 s, graphiques 1 min (intraday) / 10 min (historique),
  fondamentaux 30 min, actualités 5 min. Les fetchs multi-symboles (bande,
  vue des marchés, news) sont parallélisés.
- **Calendrier de résultats** (`/earnings`) : la prochaine date de résultats
  de chaque valeur de la **watchlist** est récupérée sur Yahoo Finance
  (`backend/app/services/earnings.py`) et mise à jour automatiquement toutes
  les 12h (ou à la demande via le bouton **Synchroniser** sur la page, ou la
  carte dédiée de Données & Synchro). Une valeur ajoutée à la watchlist
  n'apparaît dans le calendrier qu'après la première synchro. Les indices,
  ETF, devises et crypto n'ont pas de date de résultats et sont ignorés. Si
  une synchro échoue ponctuellement pour un ticker, la date déjà connue
  n'est pas effacée — seule une nouvelle date valide la remplace.
- **Taux de change** : open.er-api.com (taux réels, AED inclus), rafraîchis
  au démarrage et à la demande.
- La couche est abstraite dans `backend/app/services/market_data.py` pour
  basculer vers un fournisseur payant (EODHD, Polygon…) plus tard sans rien
  changer d'autre.

## Performance : NAV vivante et TWR

La NAV courante d'un portefeuille = cash + valeur de marché des positions
(les marks IBKR font foi). Le P&L client est **ajusté des flux** (un dépôt
n'est pas un gain), et le **TWR** (time-weighted return) est calculé en
chaînant les NAV officielles quotidiennes avec les flux — c'est la mesure de
performance présentable à un client ou un régulateur.

## Pistes d'amélioration restantes

- Moteur d'alertes + centre de notifications (prix cible, drawdown, earnings,
  échéances compliance) — prochain chantier
- Module de risque (VaR, stress test, corrélations, concentration)
- Reporting client automatisé (PDF/Excel, TWR/IRR vs benchmark)
- Abstraction multi-custodian (au-delà d'IBKR)
- Data room pour les futurs documents de souscription du fonds
