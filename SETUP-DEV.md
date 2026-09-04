# 🛠️ Guide de Configuration de l'Environnement de Développement

## Table des matières
1. [Prérequis système](#prérequis-système)
2. [Configuration locale](#configuration-locale)
3. [Accès & Infrastructure Grist](#accès--infrastructure-grist)
4. [Comptes de service Grist](#comptes-de-service-grist)
5. [Structure du projet](#structure-du-projet)
6. [Backend](#backend)
7. [Widgets](#widgets)
8. [Stockage & Base de données](#stockage--base-de-données)
9. [Outils de développement](#outils-de-développement)
10. [Checklist de vérification](#checklist-de-vérification)

---

## Prérequis système

### 🖥️ Environnement minimal
- **OS** : Linux, macOS ou Windows (WSL2 recommandé)
- **Git** : v2.40+ (pour clonage repo)
- **Node.js** : v18+ (pour backend et outils)
- **Python** : v3.10+ (optionnel pour scripts de test)
- **Navigateur** : Chrome, Firefox, ou Edge (DevTools recommandé)
- **Postman ou cURL** : Pour tester l'API backend

### 📦 Installation des outils

#### Sur macOS/Linux :
```bash
# Installer Homebrew (si absent)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Installer les dépendances
brew install node git python3
node --version  # Vérifier v18+
npm --version   # Vérifier v9+
```

#### Sur Windows (WSL2) :
```bash
# Dans WSL2
sudo apt update
sudo apt install -y nodejs npm git python3-pip
node --version
npm --version
```

---

## Configuration locale

### 1️⃣ Cloner le repository

```bash
cd ~/Projects  # ou ton répertoire de développement
git clone https://github.com/lombre33/grist-sync-connector.git
cd grist-sync-connector
```

### 2️⃣ Initialiser le projet

```bash
# Créer les dossiers de base
mkdir -p backend widgets logs

# Créer un fichier .env local (NE PAS committer)
cat > .env.local << 'EOF'
# Backend
BACKEND_PORT=3000
BACKEND_ENV=development
NODE_ENV=development

# Grist Instance
GRIST_INSTANCE_URL=https://grist.numerique.gouv.fr
GRIST_API_VERSION=v1

# Clés API Source (à remplir après création compte de service)
SOURCE_GRIST_API_KEY=xxxxxxxxxxxx
SOURCE_DOCUMENT_ID=xxxxxxxxxxxx

# Logs
LOG_LEVEL=debug
LOG_DIR=./logs
EOF

# Créer un fichier .gitignore (s'il n'existe pas)
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
.env.*.local
*.log
logs/
dist/
build/
.DS_Store
.vscode/settings.json
__pycache__/
*.pyc
EOF

git add .gitignore
git commit -m "chore: ajouter .gitignore"
```

### 3️⃣ Initialiser npm (backend)

```bash
cd backend
npm init -y

# Installer les dépendances principales
npm install express cors dotenv axios crypto uuid winston

# Installer les dépendances de dev
npm install --save-dev nodemon jest supertest

# Ajouter les scripts dans package.json
# (voir section Backend pour le contenu complet)
```

---

## Accès & Infrastructure Grist

### 📍 Accès à l'instance Grist

**URL de l'instance** : https://grist.numerique.gouv.fr

**Prérequis** :
- Compte utilisateur actif sur l'instance Dinum
- Accès en lecture/écriture sur les documents de test
- Permission "Créer un compte de service" (demander à l'admin Grist)

### 📋 Documents de test à créer

Tu dois préparer **3 documents Grist** :

#### Document 1 : `Grist-Sync-Source` (Document source)
**Objectif** : Document qui fournira les données

**Tables à créer** :
```
Table: SourceData
├── id (Text, clé primaire)
├── name (Text)
├── email (Text)
├── department (Text)
└── [autres colonnes du jeu de test]

Table: Partages
├── id (Text)
├── email_cible (Text)
├── nom_organisation_cible (Text)
├── document_id_cible (Text)
├── table_source (Text, ex: "SourceData")
├── table_cible (Text, ex: "DataRecue")
├── statut (Choice: pending, accepted, rejected, revoked)
├── clé_api_chiffrée (Text) ← Chiffrée en frontend
├── date_demande (Date)
├── date_acceptation (Date)
└── date_révocation (Date)

Table: SyncLogs
├── id (Text)
├── timestamp (DateTime)
├── statut (Choice: success, error, warning)
├── partage_id (Text → FK Partages.id)
├── rows_synced (Integer)
├── error_message (Text)
├── duration_ms (Integer)
└── details (Text, JSON)
```

#### Document 2 : `Grist-Sync-Cible-1` (Document cible test 1)
**Objectif** : Document qui recevra les données

**Tables à créer** :
```
Table: DataRecue
├── [mêmes colonnes que SourceData de Source]
└── _grist_sync_metadata (Text) ← Métadonnées de sync

Table: SyncStatus
├── id (Text)
├── last_sync (DateTime)
├── source_document_id (Text)
├── source_table (Text)
├── rows_count (Integer)
├── status (Choice: idle, syncing, completed, failed)
└── error_message (Text)
```

#### Document 3 : `Grist-Sync-Cible-2` (Document cible test 2, optionnel)
Pour tester plusieurs cibles simultanément.

### 🔑 Permissions requises

| Rôle | Document Source | Partages | SyncLogs | Doc Cible |
|------|-----------------|----------|----------|-----------|
| Owner Source | Editor | Editor | Editor | - |
| Owner Cible | - | Viewer | Viewer | Editor |
| Backend Service | Editor | Editor | Editor | - |

---

## Comptes de service Grist

### 1️⃣ Créer le compte de service SOURCE (Backend)

**Qui** : Propriétaire du document source
**Où** : Dans Grist → Settings → Service accounts
**Permissions** : Editor sur `Grist-Sync-Source`

```bash
# Après création, tu recevras :
SOURCE_API_KEY=xxxxx_xxxxx_xxxxx

# Tester l'accès
curl -H "Authorization: Bearer xxxxx_xxxxx_xxxxx" \
  "https://grist.numerique.gouv.fr/o/docs/api/docs/{DOCUMENT_ID}"
```

**Stocker dans `.env.local`** :
```
SOURCE_GRIST_API_KEY=xxxxx_xxxxx_xxxxx
SOURCE_DOCUMENT_ID=97yiWFtwrJMV  # Exemple
```

### 2️⃣ Créer des comptes de service CIBLES (Pour les demandeurs)

**Qui** : Chaque propriétaire d'un document cible
**Où** : Dans son propre Grist → Settings → Service accounts
**Permissions** : Writer sur la table cible vide (ex: `DataRecue`)

```bash
# Après création
CIBLE_API_KEY_1=xxxxx_xxxxx_xxxxx
```

⚠️ **IMPORTANT** : Cette clé sera **chiffrée** et stockée dans la table `Partages` du document source.

### 3️⃣ Vérifier les accès

```bash
# Test 1 : Récupérer les infos du document source
curl -H "Authorization: Bearer $SOURCE_GRIST_API_KEY" \
  "https://grist.numerique.gouv.fr/o/docs/api/docs/$SOURCE_DOCUMENT_ID"

# Test 2 : Lister les tables
curl -H "Authorization: Bearer $SOURCE_GRIST_API_KEY" \
  "https://grist.numerique.gouv.fr/o/docs/api/docs/$SOURCE_DOCUMENT_ID/tables"

# Test 3 : Récupérer les records
curl -H "Authorization: Bearer $SOURCE_GRIST_API_KEY" \
  "https://grist.numerique.gouv.fr/o/docs/api/docs/$SOURCE_DOCUMENT_ID/tables/SourceData/records"
```

---

## Structure du projet

```
grist-sync-connector/
├── README.md                          # Description générale
├── CAHIER_DES_CHARGES.md             # Cahier complet
├── SETUP-DEV.md                      # Ce fichier
├── .gitignore                        # Fichiers à ignorer
├── .env.example                      # Template des variables
│
├── backend/                          # Backend Node.js/Python
│   ├── package.json
│   ├── .env.local                   # À créer localement
│   ├── server.js                    # Point d'entrée
│   ├── config/
│   │   ├── env.js
│   │   └── grist.js
│   ├── routes/
│   │   ├── sync.js
│   │   ├── partages.js
│   │   └── health.js
│   ├── controllers/
│   │   ├── syncController.js
│   │   └── partagesController.js
│   ├── services/
│   │   ├── gristService.js
│   │   ├── cryptoService.js
│   │   └── auditService.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── tests/
│   │   └── api.test.js
│   └── logs/
│       └── .gitkeep
│
├── widgets/                          # Widgets Grist (HTML/JS)
│   ├── source/
│   │   ├── index.html               # Widget source complet
│   │   └── README.md                # Doc widget source
│   └── cible/
│       ├── index.html               # Widget cible complet
│       └── README.md                # Doc widget cible
│
├── docs/                            # Documentation supplémentaire
│   ├── API.md                       # Spéc API backend
│   ├── WIDGETS.md                   # Spéc widgets
│   ├── SECURITY.md                  # Guide sécurité
│   └── DEPLOYMENT.md                # Guide déploiement
│
└── scripts/                         # Scripts utilitaires
    ├── create-test-documents.js     # Créer docs de test
    ├── seed-data.js                 # Charger données test
    └── cleanup.js                   # Nettoyer env de test
```

---

## Backend

### 1️⃣ Initialiser Node.js

```bash
cd backend
npm init -y
```

### 2️⃣ `package.json` recommandé

```json
{
  "name": "grist-sync-connector-backend",
  "version": "0.1.0",
  "description": "Backend pour synchronisation Grist",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint ."
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "axios": "^1.6.0",
    "crypto": "^1.0.1",
    "uuid": "^9.0.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "eslint": "^8.54.0"
  },
  "keywords": ["grist", "sync", "connector"],
  "author": "Dinum",
  "license": "MIT"
}
```

### 3️⃣ Structure backend

```bash
mkdir -p backend/{config,routes,controllers,services,middleware,tests,logs}

# Créer les fichiers de base
touch backend/server.js
touch backend/config/{env.js,grist.js}
touch backend/routes/{sync.js,partages.js,health.js}
touch backend/controllers/{syncController.js,partagesController.js}
touch backend/services/{gristService.js,cryptoService.js,auditService.js}
touch backend/middleware/{auth.js,errorHandler.js}
```

### 4️⃣ Fichier `server.js` minimal

```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './config/logger.js';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(err.status || 500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Backend started on http://localhost:${PORT}`);
});
```

### 5️⃣ Lancer le backend

```bash
cd backend
npm install
npm run dev  # Mode développement avec nodemon
```

L'app démarre sur `http://localhost:3000`

---

## Widgets

### 📍 Localisation des widgets

Les widgets Grist sont hébergés **directement dans l'instance Grist** via le Custom Widget Builder :
- **Widget Source** : Dans document `Grist-Sync-Source`, table `Partages`
- **Widget Cible** : Dans document `Grist-Sync-Cible-1`, table d'interface utilisateur

### 1️⃣ Structure fichiers widgets

```
widgets/
├── source/
│   ├── index.html          # HTML complet du widget
│   ├── README.md           # Documentation
│   └── manifest.json       # Infos widget (optionnel)
└── cible/
    ├── index.html
    ├── README.md
    └── manifest.json
```

### 2️⃣ Template widget source (index.html)

Chaque widget Grist c'est un **fichier HTML avec JS intégré** :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grist Sync - Widget Source</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .container { max-width: 600px; margin: 20px auto; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🔄 Gestion des partages</h2>
    <div id="partages"></div>
  </div>

  <script src="https://docs.getgrist.com/grist-plugin-api.js"></script>
  <script>
    grist.ready({ requiredAccess: 'full' });
    
    let userEmail = null;
    
    grist.onRecord(async (record) => {
      if (!record) return;
      
      // Traiter les données du partage
      console.log('Partage reçu:', record);
    });
    
    // Récupérer l'email de l'utilisateur
    const profile = await grist.getUserProfile();
    userEmail = profile?.email;
    console.log('Utilisateur connecté:', userEmail);
  </script>
</body>
</html>
```

### 3️⃣ Installer le widget dans Grist

1. Ouvrir le document `Grist-Sync-Source`
2. Ajouter une **nouvelle colonne** de type "Custom widget"
3. Cliquer sur "⚙️ Settings"
4. Coller le contenu du fichier `widgets/source/index.html`
5. Sauvegarder

---

## Stockage & Base de données

### 📊 Tables Grist = Base de données

Pour la **V1**, on stocke tout directement dans **Grist** (pas de PostgreSQL/MongoDB) :

**Tables requises dans le document source** :

#### 1. `SourceData` (Les vraies données à syncer)
```
Colonnes :
- id (Text, clé primaire)
- name (Text)
- email (Text)
- department (Text)
- [autres colonnes métier]
```

#### 2. `Partages` (Gestion des accès)
```
Colonnes :
- id (Text, unique)
- email_cible (Text)
- nom_org_cible (Text)
- document_id_cible (Text)
- table_source (Text)
- table_cible (Text)
- statut (Choice: pending, accepted, rejected, revoked)
- clé_api_chiffrée (Text) ← Clé du compte de service cible, chiffrée
- date_demande (Date)
- date_acceptation (Date)
- date_révocation (Date)
- notes (Text)
```

#### 3. `SyncLogs` (Audit des synchronisations)
```
Colonnes :
- id (Text, unique)
- timestamp (DateTime, auto)
- partage_id (Text → FK Partages.id)
- statut (Choice: success, error, warning, skipped)
- rows_synced (Integer)
- error_message (Text)
- duration_ms (Integer)
- backend_version (Text)
- details (Text) ← JSON stringifié
```

### 🔐 Chiffrement des clés API

**Où ça se passe** :

1. **Frontend (Widget Source)** :
   - Utilisateur rentre la clé API cible + passphrase
   - Chiffrer avec AES-256-GCM + passphrase
   - Envoyer le texte chiffré au backend

2. **Backend** :
   - Recevoir le texte chiffré
   - Stocker dans la table `Partages` colonne `clé_api_chiffrée`

3. **Lors de la sync** :
   - Backend récupère le texte chiffré
   - Demander la passphrase à l'utilisateur (en V1, c'est complexe)
   - Déchiffrer et utiliser la clé API réelle

⚠️ **Gestion de la passphrase** : À définir (voir CAHIER_DES_CHARGES.md, section Sécurité)

---

## Outils de développement

### 🧪 Tester l'API backend

#### Avec cURL

```bash
# Test 1 : Health check
curl http://localhost:3000/health

# Test 2 : Déclencher une sync manuelle
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "partage_id": "xxx",
    "user_email": "user@example.com"
  }'

# Test 3 : Récupérer les partages
curl http://localhost:3000/api/partages \
  -H "Authorization: Bearer $USER_TOKEN"
```

#### Avec Postman

Importer cette collection dans Postman :

```json
{
  "info": {
    "name": "Grist Sync Connector",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": "http://localhost:3000/health"
      }
    },
    {
      "name": "Trigger Sync",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/api/sync",
        "body": {
          "mode": "raw",
          "raw": "{\"partage_id\": \"xxx\"}"
        }
      }
    }
  ]
}
```

### 📝 Logs

Localisation : `backend/logs/`

```bash
# Voir les logs en temps réel
tail -f backend/logs/app.log

# Filtrer les erreurs
grep ERROR backend/logs/app.log
```

### 🐛 Debugging

#### DevTools Chrome

1. Ouvrir Grist dans Chrome
2. F12 → Console
3. Voir les logs du widget

#### Node.js debugging

```bash
# Lancer avec debugger Node.js
node --inspect server.js

# Accéder à chrome://inspect dans Chrome
```

---

## Checklist de vérification

### ✅ Avant de coder

- [ ] Compte Grist actif sur https://grist.numerique.gouv.fr
- [ ] Documents de test créés (`Grist-Sync-Source`, `Grist-Sync-Cible-1`)
- [ ] Tables créées dans les documents
- [ ] Comptes de service créés (Source + Cible)
- [ ] Clés API testées avec cURL
- [ ] Repository cloné localement
- [ ] Node.js v18+ installé
- [ ] Git configuré (`git config --global user.name/email`)

### ✅ Environnement local

- [ ] `.env.local` créé avec les bonnes clés API
- [ ] `.gitignore` configuré (pas de clés committées)
- [ ] `backend/package.json` créé et `npm install` lancé
- [ ] `npm run dev` démarre sans erreur
- [ ] `http://localhost:3000/health` répond

### ✅ Grist

- [ ] Widget source peut accéder à `grist.getUserProfile()`
- [ ] Widget cible peut accéder au widget
- [ ] Appels API Grist testés avec l'API key du backend
- [ ] Table `Partages` accessible et modifiable

### ✅ Avant le premier commit

- [ ] Aucune clé API commitée
- [ ] `npm run lint` passe (si eslint configuré)
- [ ] `npm run test` passe (si tests écrits)
- [ ] README.md à jour
- [ ] Commit message clair et détaillé

---

## Commandes rapides

```bash
# Clone & setup
git clone https://github.com/lombre33/grist-sync-connector.git
cd grist-sync-connector
cp .env.example .env.local
# ← Éditer .env.local avec tes valeurs

# Backend
cd backend
npm install
npm run dev

# Tests API
curl http://localhost:3000/health

# Logs
tail -f backend/logs/app.log

# Commit
git add .
git commit -m "feat: [description]"
git push origin main
```

---

## Points de contact

- **Grist Instance Admin** : Pour permissions compte de service, créer documents test
- **GitHub** : Pour code reviews, issues
- **Cahier des charges** : Pour questions sur specs

Good luck ! 🚀
