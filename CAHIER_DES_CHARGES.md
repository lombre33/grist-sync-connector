# Cahier des Charges - Grist Sync Connector V1

**Version :** 1.0  
**Date :** Septembre 2024  
**Auteur :** Équipe Dinum / La Suite  
**Statut :** Approuvé pour développement V1

---

## 1. Contexte & Enjeux

### 1.1 Problématique

Permettre à deux utilisateurs de documents Grist **différents et non liés** de synchroniser des données de manière **sécurisée et contrôlée**, sachant que :
- Les documents n'appartiennent pas aux mêmes personnes
- L'utilisateur **source doit rester maître** de ses données
- Les clés API ne doivent **jamais transiter** en clair
- L'outil doit être utilisable par **des non-développeurs**
- L'infrastructure doit rester **minimaliste** (pas de BDD complexe)

### 1.2 Enjeux de sécurité

1. **Authentification** : Vérifier l'identité réelle des utilisateurs → email de session Grist
2. **Confidentialité** : Les données ne doivent pas transiter en clair → chiffrement E2E
3. **Intégrité** : Les données ne doivent pas être modifiées en transit
4. **Contrôle d'accès** : Source doit pouvoir accepter/refuser et révoquer les accès
5. **Audit** : Tracer tous les accès et synchronisations
6. **Isolation des clés** : Les clés API ne sont jamais exposées au navigateur

### 1.3 Contraintes

- ✅ V1 en local (backend simple)
- ✅ Pas de ProConnect (utiliser authentification Grist native)
- ✅ Pas de BDD dédiée (stocker via Grist)
- ✅ Widgets natifs Grist (HTML/JS minimal)
- ✅ Cibles : 500 lignes × 50 colonnes en médian
- ✅ Email unique par utilisateur

---

## 2. Architecture Générale

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│ Grist Instance Dinum / La Suite                                 │
│                                                                 │
│  ┌──────────────────────────────┐   ┌─────────────────────┐   │
│  │ Document SOURCE (Utilisateur A)       │ Document CIBLE (Utilisateur B)  │   │
│  │                              │   │                     │   │
│  │ ┌──────────────────────────┐ │   │ ┌─────────────────┐ │   │
│  │ │ Table: "Données"         │ │   │ │ Table: "Import" │ │   │
│  │ │ - 500 lignes             │ │   │ │ - Vide au départ│ │   │
│  │ │ - 50 colonnes            │ │   │ │ - Cible de sync │ │   │
│  │ └──────────────────────────┘ │   │ └─────────────────┘ │   │
│  │                              │   │                     │   │
│  │ ┌──────────────────────────┐ │   │ ┌─────────────────┐ │   │
│  │ │ Widget SOURCE            │ │   │ │ Widget CIBLE    │ │   │
│  │ │ - Gère les demandes      │ │   │ │ - Demande accès │ │   │
│  │ │ - ACL & révocation       │ │   │ │ - Mapping cols  │ │   │
│  │ │ - Logs de sync           │ │   │ │ - Décrypt data  │ │   │
│  │ └──────────────────────────┘ │   │ └─────────────────┘ │   │
│  │                              │   │                     │   │
│  │ ┌──────────────────────────┐ │   │                     │   │
│  │ │ Table: "Partages"        │ │   │                     │   │
│  │ │ (ACL + logs)             │ │   │                     │   │
│  │ └──────────────────────────┘ │   │                     │   │
│  └──────────────────────────────┘   └─────────────────────┘   │
│                  ↕ (HTTPS + chiffrement E2E)                   │
│           ┌──────────────────────────┐                         │
│           │ Backend (Node.js/Python) │                         │
│           │ - Stockage clés source   │                         │
│           │ - Orchestration sync     │                         │
│           │ - Chiffrement/déchiffrement         │                         │
│           │ - Cron 24h               │                         │
│           └──────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Flux de données (synchronisation)

```
1. DEMANDE D'ACCÈS (Cible → Source)
   ├─ Email cible
   ├─ Clé API compte service cible (chiffrée avec passphrase en mémoire)
   ├─ Table source demandée
   └─ Formulaire rempli

2. ACCEPTATION (Source valide manuellement)
   ├─ Création mapping colonne-colonne
   ├─ Ajout ligne dans ACL
   ├─ Déchiffrement clé cible (stockée temporairement en mémoire source)
   └─ Notification cible

3. SYNCHRONISATION (Cron 24h + bouton manuel)
   ├─ Backend récupère clé API source (depuis config interne)
   ├─ Backend fetch table source via API Grist
   ├─ Backend chiffre données avec clé publique cible
   ├─ Backend envoie HTTPS vers API cible
   ├─ Widget cible reçoit données
   ├─ Widget cible déchiffre (clé privée stockée en mémoire)
   ├─ Widget cible applique mapping
   ├─ Widget cible écrit en base via API Grist
   └─ Log succès/erreur dans table "Partages" (source)

4. RÉVOCATION (Source clique "Révoquer")
   ├─ Suppression ligne ACL
   ├─ Arrêt des prochaines syncs
   └─ Log révocation
```

---

## 3. Rôles & Acteurs

### 3.1 Utilisateur SOURCE

**Définition** : Propriétaire du document source qui initie le partage.

**Responsabilités** :
- ✅ Créer un compte de service avec accès lecture sur sa table
- ✅ Installer le widget SOURCE dans sa table de données
- ✅ Accepter/refuser les demandes d'accès des cibles
- ✅ Valider le mapping des colonnes
- ✅ Révoquer les accès si nécessaire
- ✅ Consulter les logs de synchronisation
- ✅ Gérer la table d'ACL et d'audit

**Permissions Grist** :
- Éditeur sur son document
- Accès lecture à la table source
- Accès complet à la table "Partages" (widget + logs)

**Table créée automatiquement** : `Partages`
```
Colonnes:
- email_cible (text, unique)
- compte_service_cible (text, chiffré)
- table_source (text)
- table_cible (text)
- mapping_colonnes (json)
- date_acceptation (date)
- statut_sync (enum: "ok", "error", "pending")
- last_sync (datetime)
- error_message (text)
- date_revocation (date, nullable)
```

### 3.2 Utilisateur CIBLE

**Définition** : Utilisateur qui demande l'accès à des données d'un document source.

**Responsabilités** :
- ✅ Créer un compte de service avec accès écriture sur une table vide
- ✅ Installer le widget CIBLE
- ✅ Faire une demande d'accès au document source
- ✅ Valider/affiner le mapping des colonnes
- ✅ Recevoir et valider les données synchronisées
- ✅ Voir le statut des syncs

**Permissions Grist** :
- Éditeur sur son document
- Accès écriture sur la table cible (d'abord vide)

### 3.3 Admin Grist (optionnel V1)

**Optionnel mais recommandé** : Configure les sources disponibles.

**Responsabilités** :
- Ajouter manuellement les sources disponibles dans une liste
- Voir les syncs globales en cas de debug
- Gérer les habilitations Grist

---

## 4. Authentification & Autorisation

### 4.1 Authentification

**Approche** : Email de la session Grist + Vérification backend

**Flux** :

```
1. Utilisateur accède au widget
2. Widget appelle grist.getUserProfile()
   → Récupère { email: "user@gouv.fr", ... }
3. Widget envoie email au backend avec la requête
4. Backend VÉRIFIE :
   - Email présent dans la table ACL (pour source → checksum)
   - Email = demandeur pour cible
5. Si OK → traiter la requête
6. Si KO → 403 Unauthorized
```

**Avantage** :
- ✅ Aucune dépendance ProConnect (V1)
- ✅ Email vérifiable côté backend
- ✅ Audit facile
- ✅ Pas de token OAuth à gérer

**Limitation** :
- Suppose que l'administrateur Grist a créé les utilisateurs correctement
- Pas de vérification supplémentaire (sera ajoutée en V2 avec ProConnect)

### 4.2 Autorisation

**Principe** : Basé sur la table `Partages` (ACL)

**Vérification backend** :
```python
def peut_syncer(email_source, email_cible, doc_id_source, doc_id_cible):
    acl = grist_client.get_acl(doc_id_source)
    ligne = acl.filter(
        email_cible == email_cible AND
        statut_sync != "revoked"
    ).first()
    return ligne is not None
```

**Cas d'usage** :
- Source A → Cible B : ACL OK, sync autorisée
- Source A → Cible C : ACL inexistant, sync refusée
- Source A → Cible B (revoked) : ACL marquée revoked, sync refusée

---

## 5. Gestion des Clés API

### 5.1 Clé API Source

**Propriétaire** : Utilisateur source  
**Créée par** : Utilisateur source (guide fourni)  
**Stockage** : Backend (chiffrée)  
**Accès** : Backend uniquement

**Processus de configuration V1** :
1. Source crée un compte de service dans Grist (lecture sur sa table)
2. Source génère une clé API
3. Source transmet la clé **DE MANIÈRE SÉCURISÉE** au backend :
   - Par fichier .env local (V1)
   - Ou par paramètre de déploiement (V2)
4. Backend la stocke chiffrée en mémoire ou config
5. Clé n'est JAMAIS stockée dans Grist

### 5.2 Clé API Cible

**Propriétaire** : Utilisateur cible  
**Créée par** : Utilisateur cible  
**Stockage** : Dans la demande d'accès, chiffrée  
**Accès** : Backend + Widget cible

**Processus** :
1. Cible crée compte de service (écriture sur une table vide)
2. Cible génère clé API
3. Cible **chiffre la clé** avec une passphrase (en mémoire, jamais stockée)
   - Utilisée pour la demande d'accès
   - Passphrase = connue de cible uniquement
4. Source reçoit clé chiffrée dans demande
5. Si acceptation : clé reste chiffrée en base Grist source
6. Lors sync : Backend envoie clé chiffrée au widget cible
7. Widget cible déchiffre avec passphrase en mémoire
8. Widget cible utilise clé pour écrire les données

**Algorithme de chiffrement** : 
- Clé API cible : **AES-256-GCM** (symétrique)
- Données : **AES-256-GCM** (E2E)
- Clé passphrase : **KDF PBKDF2** (1M iterations)

---

## 6. Flux de Synchronisation

### 6.1 Demande d'accès (Cible)

**Acteur** : Widget CIBLE

**Pré-requis** :
- Cible a créé un compte de service avec clé API
- Cible a une passphrase en tête (jamais stockée)
- Source a été configurée dans une liste "sources disponibles"

**Étapes** :
1. Widget cible affiche liste des sources (récupérée du backend)
2. Cible sélectionne une source
3. Cible remplit formulaire :
   ```
   - Email cible (auto-rempli depuis grist.getUserProfile())
   - Clé API compte service cible (input text)
   - Passphrase (input password, en mémoire uniquement)
   - Table source demandée (select dropdown)
   - Description/remarques (textarea)
   ```
4. Widget CHIFFRE la clé API avec la passphrase (AES-256-GCM)
5. Widget envoie demande au backend :
   ```json
   {
     "email_cible": "user@gouv.fr",
     "email_source": "source@gouv.fr",
     "doc_source_id": "xyz123",
     "table_source": "Données",
     "cle_api_cible_chiffree": "base64(...)",
     "nonce": "random_bytes(12)",
     "description": "...",
     "timestamp": "2024-09-04T18:00:00Z"
   }
   ```
6. Backend stocke la demande dans table `Partages` (statut: "en_attente")
7. Notification source : "Nouvelle demande de Cible X"

**Sécurité** :
- ✅ Clé API chiffrée avant transit
- ✅ Email de cible vérifiable
- ✅ Passphrase jamais transmise
- ✅ Timestamp pour replay attack protection

### 6.2 Acceptation d'accès (Source)

**Acteur** : Widget SOURCE

**Pré-requis** :
- Source voit une demande en attente
- Source a ses credentials Grist

**Étapes** :
1. Widget source affiche liste des demandes en_attente
2. Source peut voir :
   ```
   - Email demandeur
   - Table source demandée
   - Date de demande
   - Description
   - Boutons: Accepter / Refuser
   ```
3. Source clique "Accepter"
4. Widget source affiche formulaire MAPPING :
   ```
   Colonnes source → Colonnes cible (à définir)
   
   Source         │ → Cible
   ───────────────┼──────────────
   nom (text)     │ → name (text)
   prénom (text)  │ → first_name (text)
   email (text)   │ → email (text)
   salaire (num)  │ → (non mappé / à ignorer)
   ```
   Options :
   - Mode AUTO (si cible vide) : créer colonne avec même nom
   - Mode MANUEL : source choisit chaque colonne

5. Source valide le mapping
6. Widget SOURCE envoie acceptation au backend :
   ```json
   {
     "demande_id": "req_123",
     "action": "accept",
     "mapping": {
       "nom": "name",
       "prénom": "first_name",
       "email": "email"
     },
     "table_cible": "Import",
     "timestamp": "2024-09-04T18:05:00Z"
   }
   ```
7. Backend met à jour table `Partages` :
   - Statut : "accepted"
   - Mapping stocké en JSON
   - Date d'acceptation
   - Clé API cible reste chiffrée
8. Backend **envoie notification cible** : "Accepté ! Sync démarrera dans 24h"

### 6.3 Synchronisation (Automatique 24h + Manuelle)

**Acteur** : Backend + Widget cible

**Déclenchement** :
- **Cron automatique** : Toutes les 24h
- **Manuelle** : Bouton "Syncer maintenant" dans widget source ou cible

**Pré-requis** :
- Statut demande = "accepted"
- Clé API source disponible au backend
- Clé API cible chiffrée en base source

**Étapes** :

```
┌─────────────────────────────────────┐
│ 1. BACKEND : Récupère données source│
│    - Clé API source (config interne)│
│    - Appel GET /api/docs/{id}/table │
│    - Récupère toutes les lignes     │
│    - Logs : "Sync started"          │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 2. BACKEND : Prépare payload chiffré│
│    - Applique mapping colonnes      │
│    - Chiffre données (AES-256-GCM)  │
│    - Inclut metadata :              │
│      - table_cible                  │
│      - mapping_applique             │
│      - nonce / IV                   │
│      - checksum (SHA256)            │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 3. BACKEND : Envoie vers cible      │
│    POST /sync-receiver              │
│    Headers: Authorization Bearer X  │
│    Body: {chiffré}                  │
│    HTTPS + TLS 1.3                  │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 4. WIDGET CIBLE : Reçoit données    │
│    - Appel grist.onRecord() trigger │
│    - Reçoit payload chiffré         │
│    - Logs : "Sync received"         │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 5. WIDGET CIBLE : Déchiffre + mappe │
│    - Récupère passphrase (mémoire)  │
│    - Déchiffre clé API cible        │
│    - Déchiffre données              │
│    - Vérifie checksum               │
│    - Applique mapping inverse       │
│    - Prépare records pour Grist     │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 6. WIDGET CIBLE : Écrit en base      │
│    Option A (V1) : Supprime tout    │
│    - DELETE * from table_cible      │
│    - INSERT all records             │
│                                     │
│    Option B (V2) : Diff intelligent │
│    - Détecte changements            │
│    - UPDATE / INSERT / DELETE       │
│                                     │
│    Logs : "Sync completed"          │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│ 7. BACKEND : Log succès (source)    │
│    - Maj table Partages :           │
│      - last_sync = now()            │
│      - statut_sync = "ok"           │
│      - error_message = null         │
└─────────────────────────────────────┘
```

**V1 : Full Replace**
```
- À chaque sync : supprime toutes les lignes cible
- Puis réinsère les données source
- Simple, garanti d'avoir une copie parfaite
- Charge réseau acceptable (500×50 = 25k cells)
```

**V2 : Diff intelligente**
```
- Détecter lignes supprimées (ID source manquant)
- Détecter lignes modifiées (checksum différent)
- Détecter nouvelles lignes
- Permet éditions cible entre syncs
- Plus complexe, meilleur UX
```

### 6.4 Gestion des erreurs

**Cas d'erreur possibles** :

| Erreur | Source | Gestion | Log |
|--------|--------|---------|-----|
| Clé API source invalide | Backend | Retry 3x, puis arrêt | ❌ "Invalid API key" |
| Clé API cible invalide | Widget cible | Affiche erreur UI | ❌ "Cible API invalid" |
| Déchiffrement échoue | Widget cible | Erreur "Passphrase incorrecte" | ❌ "Decryption failed" |
| Réseau / timeout | Backend | Retry 3x, puis skip | ⏱️ "Network timeout" |
| Table cible n'existe pas | Widget cible | Crée table automatiquement | ✅ "Table created" |
| Colonne mapping intro | Widget cible | Crée colonne manquante | ✅ "Column created" |
| Statut revoked | Backend | Arrête sync | ⚠️ "Access revoked" |

**Logs** : Table `Partages` (source)
```
- timestamp : datetime
- statut : "ok" / "error" / "pending"
- error_message : text (si erreur)
- lignes_syncees : int
- duree_secondes : int
```

### 6.5 Révocation

**Acteur** : Widget SOURCE

**Étapes** :
1. Source voit ligne ACL avec bouton "Révoquer"
2. Source clique "Révoquer"
3. Confirmation : "Êtes-vous sûr ? Les futures syncs seront stoppées."
4. Widget source envoie :
   ```json
   {
     "action": "revoke",
     "email_cible": "cible@gouv.fr",
     "timestamp": "2024-09-04T18:10:00Z"
   }
   ```
5. Backend met à jour table `Partages` :
   - Statut : "revoked"
   - date_revocation : now()
6. Prochain cron : Backend voit statut revoked, skip la sync
7. Données **restent** en base cible (pas suppression auto)
8. Log : "Accès révoqué"

---

## 7. Interface Utilisateur (Widgets)

### 7.1 Widget SOURCE

**Localisation** : Table source du document source  
**Mode d'hébergement** : Natif Grist (HTML/JS)

**Sections** :

#### 7.1.1 Demandes en attente
```
┌─────────────────────────────────┐
│ 📨 DEMANDES EN ATTENTE (2)      │
├─────────────────────────────────┤
│                                 │
│ ▶ De: alice@gouv.fr             │
│   Table: Données                │
│   Date: 2024-09-03 14:00        │
│   [Accepter] [Refuser]          │
│                                 │
│ ▶ De: bob@gouv.fr               │
│   Table: Données                │
│   Date: 2024-09-02 09:30        │
│   [Accepter] [Refuser]          │
│                                 │
└─────────────────────────────────┘
```

#### 7.1.2 Accès actifs
```
┌─────────────────────────────────┐
│ ✅ ACCÈS ACTIFS (3)             │
├─────────────────────────────────┤
│                                 │
│ alice@gouv.fr                   │
│   Table: Données → Import       │
│   Last sync: 2024-09-04 18:00   │
│   Statut: ✅ OK                 │
│   [Révoquer] [Voir logs]        │
│                                 │
│ bob@gouv.fr                     │
│   Table: Données → UsersData    │
│   Last sync: ⏳ En attente      │
│   Statut: 🔄 Sync en cours      │
│   [Révoquer] [Syncer maintenant]│
│                                 │
│ charlie@gouv.fr (révoqué)       │
│   Table: Données → Archive      │
│   Révoqué le: 2024-09-01 12:00  │
│   [Restaurer accès?]            │
│                                 │
└─────────────────────────────────┘
```

#### 7.1.3 Logs de synchronisation
```
┌─────────────────────────────────┐
│ 📊 LOGS                         │
├─────────────────────────────────┤
│ Filtre: [Tous] [OK] [Erreurs]   │
│                                 │
│ 2024-09-04 18:00  alice@gouv    │
│   ✅ 500 lignes syncées en 2.3s │
│                                 │
│ 2024-09-04 12:00  bob@gouv      │
│   ❌ Erreur: API key invalid    │
│                                 │
│ 2024-09-03 18:00  charlie@gouv  │
│   ⚠️ Accès révoqué, sync skippée│
│                                 │
└─────────────────────────────────┘
```

### 7.2 Widget CIBLE

**Localisation** : N'importe quelle table du document cible  
**Mode d'hébergement** : Natif Grist (HTML/JS)

**Sections** :

#### 7.2.1 Sources disponibles
```
┌──────────────────────────────────┐
│ 📦 SOURCES DISPONIBLES           │
├──────────────────────────────────┤
│                                  │
│ ▶ "Données budgétaires"          │
│   Source: source@gouv.fr         │
│   Description: Données budget    │
│   Tables: Données (500 lignes)   │
│   [Demander accès]               │
│                                  │
│ ▶ "Données RH"                   │
│   Source: rh@gouv.fr             │
│   Description: Annuaire staff    │
│   Tables: Salariés (1000 lignes) │
│   [Demander accès]               │
│                                  │
└──────────────────────────────────┘
```

#### 7.2.2 Formulaire demande
```
┌──────────────────────────────────┐
│ 📝 DEMANDER UN ACCÈS             │
├──────────────────────────────────┤
│                                  │
│ Source : "Données budgétaires"   │
│ ├─ Email cible : alice@gouv.fr   │ (auto)
│ ├─ Clé API : [__________]        │
│ ├─ Passphrase : [__________]     │
│ ├─ Table source : [Données ▼]    │
│ └─ Remarques : [_________]       │
│                                  │
│ [Annuler] [Demander accès]       │
│                                  │
└──────────────────────────────────┘
```

#### 7.2.3 Statut accès
```
┌──────────────────────────────────┐
│ 🔗 MON ACCÈS                     │
├──────────────────────────────────┤
│                                  │
│ Source: "Données budgétaires"    │
│ Statut: 🔄 Demande en attente    │
│ Demandé le: 2024-09-04 15:00     │
│                                  │
│ Source: "Données RH"             │
│ Statut: ✅ Accepté               │
│ Accepté le: 2024-09-03 10:00     │
│ Last sync: 2024-09-04 18:00      │
│ Lignes: 500                      │
│ [Syncer maintenant] [Voir logs]  │
│                                  │
│ Source: "Données Archive"        │
│ Statut: ⛔ Révoqué               │
│ Révoqué le: 2024-09-01 12:00     │
│                                  │
└──────────────────────────────────┘
```

#### 7.2.4 Mapping colonnes (modal)
```
┌──────────────────────────────────┐
│ 🔗 MAPPER LES COLONNES           │
├──────────────────────────────────┤
│                                  │
│ Mode: [Auto créer] [Manuel]      │
│                                  │
│ Source → Cible                   │
│ ─────────────────────────────    │
│ • nom → [name ▼]                 │
│ • prénom → [first_name ▼]        │
│ • email → [email ▼]              │
│ • salaire → [🗑️ Ignorer]         │
│                                  │
│ [Ajouter colonne] [Annuler]      │
│ [Valider mapping]                │
│                                  │
└──────────────────────────────────┘
```

---

## 8. Infrastructure & Déploiement

### 8.1 Back-end V1 (Local)

**Stack** : Node.js + Express (ou Python + Flask)

**Fichiers** :
```
backend/
├── app.js                    # App principale
├── routes/
│   ├── sync.js              # POST /sync-receiver
│   ├── auth.js              # Vérification email
│   └── health.js            # GET /health
├── services/
│   ├── grist-client.js      # Client API Grist
│   ├── crypto.js            # AES-256-GCM, PBKDF2
│   └── cron-sync.js         # Cron 24h
├── config/
│   ├── env.example          # Template env
│   └── constants.js         # Clés API source (chiffrées)
├── tests/
│   └── crypto.test.js       # Tests chiffrement
├── package.json
├── .gitignore
└── README.md
```

**Environnement** :
```bash
# .env
GRIST_API_KEY_SOURCE=xxxxx        # Clé API source (chiffrée)
GRIST_INSTANCE_URL=https://grist.numerique.gouv.fr
GRIST_DOC_SOURCE_ID=97yiWFtwrJMV
GRIST_TABLE_SOURCE=Données
GRIST_TABLE_PARTAGES=Partages

SYNC_CRON_INTERVAL=86400           # 24h en secondes
SYNC_PORT=3001

ENCRYPTION_ALGORITHM=aes-256-gcm
LOG_LEVEL=info
```

**API Endpoints** :

| Endpoint | Méthode | Auth | Description |
|----------|---------|------|-------------|
| `/health` | GET | - | Health check |
| `/sync-receiver` | POST | Bearer | Recevoir données chiffrées |
| `/sync-request` | POST | Email | Soumettre demande accès |
| `/sync-accept` | POST | Email | Accepter demande |
| `/sync-revoke` | POST | Email | Révoquer accès |
| `/logs` | GET | Email | Récupérer logs |

### 8.2 Widgets (Natifs Grist)

**Format** : HTML + CSS inline + JS

**Hébergement** : 
- V1 : Fichiers upload directs dans Grist (si feature existe)
- V2 : CDN GitHub Pages / Netlify

**Dépendances externes** :
- `crypto-js` (chiffrement navigateur)
- `https://docs.getgrist.com/grist-plugin-api.js` (Grist API)

### 8.3 Stockage des données

**Où quoi est stocké** :

| Donnée | Où | Chiffré | Accès |
|--------|-----|---------|-------|
| Clé API source | Backend config (.env) | Oui | Backend only |
| Clé API cible | Table `Partages` (source) | Oui (AES256) | Backend + Widget source |
| Données source | Table source | Non | Via API Grist |
| Données cible | Table cible | Non | Via API Grist |
| Table ACL/logs | Table `Partages` | Non | Via API Grist |
| Données en transit | Réseau | Oui (AES256) | Backend + Widget |
| Passphrase cible | Mémoire navigateur | N/A | Widget cible (jamais stocké) |

---

## 9. Sécurité

### 9.1 Principes de sécurité

✅ **Defense in depth** : Plusieurs couches de protection  
✅ **Zero trust** : Vérifier chaque requête  
✅ **Least privilege** : Chaque composant a permissions minimales  
✅ **Encryption by default** : Données chiffrées en transit et au repos (partiellement)  
✅ **Audit trail** : Tous les accès loggés  

### 9.2 Menaces & mitigations

| Menace | Vecteur | Mitigation |
|--------|--------|-----------|
| **Clé API exposée** | Navigateur / réseau | Stockée backend, jamais exposée |
| **Man-in-the-middle** | Réseau HTTP | HTTPS TLS 1.3 + chiffrement E2E |
| **Replay attack** | Requête dupliquée | Timestamp + nonce unique |
| **Injection SQL** | Paramètres API | Utilisation API Grist (pas SQL direct) |
| **XXS widget** | HTML malveillant | Widgets contenus, pas d'exec externe |
| **Admin backend lit données** | Accès serveur compromis | Données chiffrées en transit, logs seulement |
| **Passphrase compromise** | Attaque brute-force | Stockée mémoire, jamais stockée disque |
| **Compte service volé** | Clé API divulguée | Clé stockée backend, revocation possible |
| **Accès après révocation** | Bug ou drift | Vérification ACL à chaque sync |

### 9.3 Gestion des secrets

**Secrets à protéger** :
1. Clé API source
2. Clé API cible (chiffrée)
3. Passphrase cible (en mémoire)

**Stockage sécurisé** :
```
- Clé API source : .env (backend) → pas dans git
- Clé API cible : Chiffrement AES-256 avant stockage Grist
- Passphrase : Mémoire navigateur uniquement (jamais stockée/transmise)
```

**Exemple chiffrement clé cible** :
```javascript
// Côté widget cible (demande)
const passphrase = "mon-secret-ici";
const apiKey = "grist_xxxxx";
const salt = crypto.randomBytes(16);
const key = pbkdf2(passphrase, salt, 1000000, 32); // AES-256
const encrypted = aes256gcm.encrypt(apiKey, key);
// Envoyer: { encrypted, salt, nonce }

// Côté backend (stockage)
// Chiffré en base Grist, backend n'a pas la passphrase

// Côté backend (sync)
// Récupère { encrypted, salt, nonce }
// Envoie chiffré au widget cible
// Widget déchiffre avec passphrase (en mémoire)
```

---

## 10. Cas d'usage détaillés

### 10.1 Happy path : Demande → Acceptation → Sync

```
T0 : Cible remplit formulaire
├─ Email: alice@gouv.fr
├─ Clé API: grist_f1a2b3c4
├─ Passphrase: "monmotdepasse2024!"
└─ Table source: "Données"

T1 : Widget cible envoie demande (chiffrée)
Backend stocke:
{
  "email_cible": "alice@gouv.fr",
  "cle_api_cible_chiffree": "base64(aes256gcm(...))",
  "statut": "en_attente",
  "date_demande": "2024-09-04T15:30:00Z"
}

T2 : Source reçoit notification (dans widget)
Source clique "Accepter"
Widget affiche mapping:
- nom → name
- email → email

T3 : Source valide mapping
Backend met à jour:
{
  "statut": "accepted",
  "mapping": { "nom": "name", "email": "email" },
  "date_acceptation": "2024-09-04T15:45:00Z"
}

T4 : Sync automatique 24h après (ou manuelle)
Backend:
1. Récupère clé API source
2. GET /api/docs/source_id/tables/Données/records
3. Chiffre: { records, mapping, nonce }
4. POST /sync-receiver body=chiffré

Widget cible:
1. Reçoit payload chiffré
2. Déchiffre avec passphrase (en mémoire)
3. Applique mapping
4. DELETE * FROM Import
5. INSERT 500 records

T5 : Log succès
Partages table:
{
  "email_cible": "alice@gouv.fr",
  "last_sync": "2024-09-04T18:00:00Z",
  "statut_sync": "ok",
  "lignes_syncees": 500
}
```

### 10.2 Erreur : Clé API cible invalide

```
T0 : Cible remplit avec clé API invalide
Backend stocke demande

T2 : Source accepte
Backend ne le sait pas encore (clé pas vérifiée à cette étape)

T4 : Sync automatique
Backend envoie au widget cible
Widget cible reçoit payload
Essaie de déchiffrer → OK (passphrase en mémoire)
Essaie d'écrire → API retourne 403 "Invalid API key"

Widget cible log:
{
  "error": "API key rejected by Grist",
  "timestamp": "2024-09-04T18:00:00Z"
}

Backend log:
{
  "email_cible": "alice@gouv.fr",
  "statut_sync": "error",
  "error_message": "Widget reported: API key rejected",
  "last_sync": "2024-09-04T18:00:00Z"
}

Source voit dans widget:
"❌ Erreur: Clé API cible invalide (alice@gouv.fr)"
[Détails] [Contacter cible]
```

### 10.3 Révocation : Source désactive accès

```
T0 : Source voit accès "alice@gouv.fr" → [Révoquer]
Click confirmation

T1 : Backend met à jour
{
  "email_cible": "alice@gouv.fr",
  "statut": "revoked",
  "date_revocation": "2024-09-04T16:00:00Z"
}

T2 : Prochain cron 24h
Backend check: statut = "revoked" → skip sync
Log: "Access revoked, sync skipped"

T3+ : Alice peut pas faire nouvelle demande ?
Widget cible montre "Accès révoqué"
Alice doit demander restauration ?
Backend peut refuser auto (V1) ou accepter (V2)

Note : Données chez Alice restent (pas delete auto)
```

---

## 11. Tests & Validation

### 11.1 Tests unitaires (Backend)

```javascript
describe('Encryption', () => {
  test('AES256GCM encrypt/decrypt roundtrip', () => {
    const data = { records: [...] };
    const encrypted = encryptAES256(data, key);
    const decrypted = decryptAES256(encrypted, key);
    expect(decrypted).toEqual(data);
  });

  test('Invalid key fails decryption', () => {
    const encrypted = encryptAES256(data, key1);
    expect(() => decryptAES256(encrypted, key2)).toThrow();
  });

  test('PBKDF2 passphrase KDF', () => {
    const passphrase = "test";
    const key1 = pbkdf2(passphrase, salt, 1000000);
    const key2 = pbkdf2(passphrase, salt, 1000000);
    expect(key1).toEqual(key2);
  });
});

describe('API Auth', () => {
  test('Valid email allows sync', async () => {
    const res = await post('/sync-receiver', {
      email: "alice@gouv.fr",
      ...
    });
    expect(res.status).toBe(200);
  });

  test('Invalid email rejected', async () => {
    const res = await post('/sync-receiver', {
      email: "fake@fake.fr",
      ...
    });
    expect(res.status).toBe(403);
  });
});
```

### 11.2 Tests d'intégration (E2E)

```gherkin
Feature: Complete sync flow
  Scenario: Happy path
    Given Source has document with 500 records
    And Target has empty document
    When Target submits access request with valid API key
    And Source accepts with mapping
    And Cron sync runs
    Then Target has 500 records
    And Logs show success
    And Audit trail is complete
```

### 11.3 Validation manuelle

- [ ] Clé API exposée ? (devtools → network → no cleartext)
- [ ] Passphrase persiste ? (refresh page → dissapear)
- [ ] Mapping appliqué ? (colonnes cibles nommées correctement)
- [ ] 500 lignes syncées ? (comptage exact)
- [ ] Erreur affichée user-friendly ? (pas stacktrace)
- [ ] Révocation bloque sync ? (pas requête backend)
- [ ] Logs complets ? (tous les événements)

---

## 12. Limitations & Considérations V1

### 12.1 Limitations acceptées (V1)

⚠️ **Full replace** : À chaque sync, on supprime tout et réinsère  
⚠️ **Pas de diff** : Éditions côté cible écrasées à chaque sync  
⚠️ **Pas de filtre colonne** : Toute la table source est envoyée  
⚠️ **Pas de filtre ligne** : Pas de WHERE clause  
⚠️ **Accès document** : Pas par table/colonne (V2)  
⚠️ **Sync unidirectionnelle** : Source → Cible uniquement  
⚠️ **Pas de restauration accès** : Révocation = blocage définitif  

### 12.2 Évolutions V2+

✅ **Diff intelligente** : Détection changements  
✅ **Filtre colonne** : Source choisit colonnes envoyées  
✅ **Filtre ligne** : WHERE clause dans tableau  
✅ **ProConnect OAuth** : Authentification robuste  
✅ **Bi-directionnel** : Sync source → cible et retour  
✅ **Webhooks** : Sync immédiate (pas attendre 24h)  
✅ **UI web indépendante** : Web app côté backend (plus simple)  

---

## 13. Livrables & Timeline

### 13.1 V1 Livrables

**Code source** :
- [ ] Backend (Node.js/Python) avec tests
- [ ] Widget SOURCE (HTML/JS)
- [ ] Widget CIBLE (HTML/JS)
- [ ] Documentation setup + déploiement
- [ ] Tests E2E

**Documentation** :
- [ ] README complet
- [ ] ARCHITECTURE.md détaillé
- [ ] Guide utilisateur SOURCE
- [ ] Guide utilisateur CIBLE
- [ ] Guide admin

**Infrastructure** :
- [ ] .env.example
- [ ] Docker (optionnel)
- [ ] Tests local OK

### 13.2 Timeline estimée

```
Semaine 1 : Backend core + crypto
Semaine 2 : Widgets SOURCE + CIBLE
Semaine 3 : Intégration + tests
Semaine 4 : Documentation + déploiement V1
```

---

## 14. Points de décision en attente

**À confirmer** :

1. **Stockage Grist configs** : Utiliser une table `Config` ou fichier backend ?
2. **Notification cible** : Comment avertir cible de nouvelle demande ? (email, notification Grist ?)
3. **Restauration accès** : Après révocation, peut-on redemander ? (auto-refus ou acceptation possible ?)
4. **Autres tables** : À chaque document, une table `Partages` ou une unique centralisée ?
5. **Rate limiting** : Limiter requests API backend ? (par email, par IP ?)

---

## 15. Glossaire

| Terme | Définition |
|-------|-----------|
| **Sync** | Synchronisation des données source vers cible |
| **ACL** | Access Control List = table Partages |
| **Mapping** | Association colonnes source → colonnes cible |
| **Cron** | Tâche programmée automatique (24h) |
| **Passphrase** | Mot de passe en mémoire pour déchiffrement |
| **E2E** | End-to-end = chiffrement de bout en bout |
| **Nonce** | Nombre aléatoire pour chiffrement |
| **PBKDF2** | Fonction dérivation clé sécurisée |
| **AES-256-GCM** | Algorithme chiffrement symétrique + authentification |
| **Replay attack** | Renvoi d'une requête précédente pour fraud |

---

## Signature

- **Rédigé par** : Assistant IA
- **Approuvé par** : [À confirmer]
- **Date** : Septembre 2024
- **Version** : 1.0
