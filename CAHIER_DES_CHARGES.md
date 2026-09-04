# Cahier des charges — Widget de synchronisation Grist (Source → Cible)

**Statut** : V1 — Version de travail
**Date** : 04/09/2026
**Contexte** : Instance Grist DINUM / La Suite numérique

---

## 1. Contexte et objectif

Deux documents Grist appartenant à des personnes/organisations différentes, hébergés sur la même instance Grist (La Suite). L'objectif est de permettre à un propriétaire de document **source** de partager (dupliquer puis maintenir à jour) une table de données vers un document **cible**, appartenant à une autre personne, **sans exposer ses propres clés API**, **sans backend dédié**, et en gardant **le contrôle total sur ce qui est partagé et quand**.

### Enjeux principaux

- **Sécurité** : aucune clé API à privilège élevé ne doit être stockée ou transmise à un tiers. Le flux de données ne doit pas permettre à la cible d'accéder à autre chose que ce qui est explicitement poussé.
- **Simplicité d'usage** : les utilisateurs finaux ne sont pas développeurs. Le setup doit être guidé, sans configuration serveur, sans notion technique complexe (pas de terminal, pas de déploiement).
- **Absence de backend dédié** : la solution doit tourner entièrement comme *custom widget* Grist, exécuté côté navigateur dans l'instance Grist elle-même — pas d'infrastructure supplémentaire à héberger/maintenir en V1.
- **Contrôle par le propriétaire de la donnée source** : c'est lui qui décide quand la synchronisation a lieu, et il peut la stopper à tout moment.

---

## 2. Architecture retenue

### 2.1 Principe général

Le **widget est déployé dans le document source**. Il **pousse** (push) les données vers une table du document cible, via l'API Grist, en utilisant une **clé de compte de service fournie par la cible**, scopée en écriture sur une seule table.

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│   DOCUMENT SOURCE            │          │   DOCUMENT CIBLE               │
│   (propriétaire A)           │          │   (propriétaire B)             │
│                               │          │                                 │
│  ┌─────────────────────┐     │  push    │   ┌─────────────────────┐      │
│  │  Table à partager    │     │ ───────► │   │ Table de réception   │      │
│  └─────────────────────┘     │  (API)   │   │ (structure préparée  │      │
│                               │          │   │  par B : colonnes    │      │
│  ┌─────────────────────┐     │          │   │  créées et nommées)  │      │
│  │  Widget de sync       │────┼──────────┼──►│                       │      │
│  │  (clé API cible       │     │          │   └─────────────────────┘      │
│  │   stockée ici)         │     │          │                                 │
│  └─────────────────────┘     │          │   Compte de service :          │
│                               │          │   droit ÉCRITURE seule         │
└─────────────────────────────┘          │   sur cette table uniquement   │
                                            └──────────────────────────────┘
```

### 2.2 Pourquoi ce sens de flux (push depuis la source)

- Le propriétaire du document source garde la maîtrise complète : il choisit quand déclencher la sync, quelles colonnes sont exposées, et peut cesser le partage en supprimant simplement la clé du widget.
- La clé transmise par la cible au propriétaire de la source n'a qu'un **scope d'écriture sur une table vide dédiée** : en cas de fuite, l'impact est limité à une pollution possible de cette table (pas de lecture de données sensibles, ni côté source ni côté cible).
- Ce modèle permet une **gestion fine et décentralisée des partages** : un widget/une clé par document cible, révocable indépendamment.

### 2.3 Rôle du compte de service Grist

Les comptes de service Grist permettent de générer une clé API limitée à certains documents/dossiers/organisations (cf. [documentation communautaire](https://forum.grist.libre.sh/t/comptes-de-services-une-cle-api-limitee-a-certains-documents-dossiers-organisations/2198)).

**Côté cible** :
- Le propriétaire du document cible crée un compte de service.
- Il configure les droits d'accès (Access Rules) pour que ce compte de service ait uniquement un droit d'**écriture** sur la table de réception dédiée (pas de lecture, pas d'accès aux autres tables du document).
- Il transmet la clé API de ce compte de service au propriétaire du document source (canal à définir — voir section 6).

**Côté source** :
- Aucun compte de service n'est nécessaire pour le document source lui-même : le widget s'exécute avec les droits de l'utilisateur qui l'ouvre (le propriétaire ou un collaborateur ayant accès en lecture à la table à partager).

---

## 3. Préparation de la table cible (V1)

- La table cible est **créée à l'avance, vide**, par le propriétaire du document cible.
- Il doit créer/renommer les **colonnes** pour qu'elles correspondent (même nom) aux colonnes de la table source qu'il souhaite recevoir.
- Le **mapping de colonnes en V1 se fait par correspondance de nom identique** : le widget lit les noms de colonnes de la source et cherche les colonnes de même nom dans la table cible.
  - Si une colonne source n'a pas de correspondance dans la cible, elle est ignorée (avec message d'avertissement dans le widget).
  - Si une colonne cible n'a pas de correspondance dans la source, elle reste vide/inchangée (utile si la cible souhaite ajouter ses propres colonnes annexes — à documenter comme risque, voir section 5).

---

## 4. Mécanique de synchronisation (V1)

### 4.1 Déclenchement

- **Manuel uniquement en V1** : à l'ouverture du widget (sync automatique proposée par défaut) et/ou via un bouton "Synchroniser maintenant".
- Pas d'automatisation planifiée (cron, webhook) en V1 — nécessiterait un composant serveur, hors périmètre V1.

### 4.2 Stratégie de mise à jour : purge + réécriture complète

Pour la V1, la stratégie retenue est la plus simple et robuste :

1. **DELETE** (bulk) de toutes les lignes existantes dans la table cible.
2. **POST** (bulk) de toutes les lignes actuelles de la table source (avec mapping par nom de colonne).

**Justification** : à l'échelle visée (exemple dimensionnant : 500 lignes × 30 colonnes = 15 000 cellules), la charge réseau et le temps d'exécution sont négligeables (2 appels API bulk, de l'ordre de 1 à 2 secondes au total). Cette approche évite toute logique de diff complexe pour la V1.

**Limites acceptées et à documenter pour les utilisateurs** :
- Les `rowId` de la table cible sont **recréés à chaque synchronisation**. Toute formule, vue filtrée, ou annotation manuelle construite sur les `rowId` de cette table sera cassée après une sync.
- ⚠️ **Contrainte d'usage à communiquer clairement** : *la table cible doit être considérée comme une table générée/miroir en lecture, sans dépendances construites dessus (pas de formules basées sur rowId, pas d'ajout de colonnes annexes avec des données propres, sauf si l'utilisateur accepte qu'elles soient perdues à chaque sync).*
- Pas de rollback automatique en cas d'échec partiel (ex. coupure réseau entre le DELETE et le POST) : risque accepté en V1 (voir 4.3).

### 4.3 Gestion des erreurs

- En cas d'échec à n'importe quelle étape (delete ou insert), le widget affiche un **message d'erreur explicite** ("La synchronisation a échoué, la table cible peut être incomplète — relancez la synchronisation").
- Pas de mécanisme de retry automatique, pas de rollback, pas de table temporaire intermédiaire en V1.
- Amélioration possible en V2 (voir section 8).

### 4.4 Historique / statut affiché dans le widget

- Date et heure de la dernière synchronisation réussie.
- Statut de la dernière tentative (succès / échec avec message).

---

## 5. Sécurité

### 5.1 Principes

- **Aucune clé API à privilège de lecture sur le document source n'est jamais transmise à un tiers.** Le document source n'expose que ce que le widget choisit de pousser.
- **La clé transmise (cible → source) est scopée au strict nécessaire** : écriture uniquement, sur une seule table dédiée, pas de lecture, pas d'accès aux autres tables/documents du compte cible.
- **Aucun stockage de clé côté serveur externe** : tout se passe dans le widget, exécuté dans le navigateur, dans le contexte de l'instance Grist. Pas de backend tiers en V1.

### 5.2 Stockage de la clé API dans le widget

- La clé API du compte de service cible est saisie une fois par le propriétaire du document source dans la configuration du widget.
- Elle est stockée via les mécanismes natifs de configuration de widget Grist (options du widget, persistées dans le document source).
- **Point de vigilance à valider techniquement** : les options de configuration d'un widget Grist sont-elles visibles par tout collaborateur ayant accès au document source (y compris en lecture) ? Si oui, il faut restreindre l'accès à la configuration du widget aux seuls éditeurs/propriétaires du document source, ou avertir explicitement que tout collaborateur avec droits d'édition sur le document source pourra voir cette clé.
- Étant donné le scope très restreint de la clé (écriture seule, une table vide dédiée), le risque résiduel en cas de fuite est jugé acceptable en V1 sans mécanisme de chiffrement additionnel (passphrase, etc. — pistes explorées puis écartées pour la V1 au profit de la simplicité, cf. historique des échanges).

### 5.3 Canal de transmission de la clé (cible → source)

- À définir par les utilisateurs eux-mêmes (canal jugé de confiance : messagerie interne, échange direct, etc.), hors du périmètre technique du widget en V1.
- Recommandation à formuler dans la documentation utilisateur : ne jamais transmettre la clé par un canal non maîtrisé (ex. lien public, ticket externe non chiffré).

---

## 6. Setup utilisateur (parcours cible, non-dev)

### Côté document cible (destinataire des données)

1. Créer une table vide dans le document cible.
2. Créer/renommer les colonnes pour qu'elles correspondent aux colonnes à recevoir depuis la source.
3. Créer un compte de service (via l'interface Grist / admin de compte).
4. Configurer les droits d'accès du compte de service : écriture uniquement, limité à cette table.
5. Transmettre la clé API générée au propriétaire du document source (canal de confiance à leur charge).

### Côté document source (propriétaire des données à partager)

1. Ajouter le widget personnalisé (custom widget) sur la vue de la table à partager.
2. Ouvrir la configuration du widget, renseigner :
   - la clé API du compte de service (fournie par la cible),
   - l'identifiant du document cible,
   - l'identifiant de la table cible.
3. Lancer une première synchronisation (bouton "Synchroniser maintenant").
4. Vérifier dans le document cible que les données sont bien arrivées.
5. Pour les synchronisations suivantes : ouvrir le widget et/ou cliquer sur "Synchroniser maintenant".

---

## 7. Interface du widget — proposition

### 7.1 Écran principal

- **Bouton principal** : "🔄 Synchroniser maintenant"
- **Statut** : "Dernière synchronisation : [date/heure] — ✅ Réussie" ou "❌ Échouée : [message]"
- **Aperçu rapide** : nombre de lignes et colonnes détectées côté source, nombre de colonnes effectivement mappées vers la cible.
- **Avertissements** (si applicable) : liste des colonnes source sans correspondance dans la cible ("Ces colonnes ne seront pas synchronisées : ...").

### 7.2 Écran de configuration (accessible via une icône ⚙️)

- Champ : Clé API du compte de service cible (masqué, type "password", avec option d'affichage temporaire).
- Champ : Identifiant du document cible.
- Champ : Identifiant de la table cible.
- Bouton : "Tester la connexion" (vérifie que la clé et les identifiants permettent bien d'accéder en écriture à la table, sans encore pousser de données) — retour visuel clair (✅/❌).
- Bouton : "Enregistrer la configuration".
- Bouton : "Supprimer la configuration / révoquer" (efface la clé stockée localement — ne révoque pas la clé côté Grist, à faire par la cible si besoin).

### 7.3 Fonctionnalités additionnelles cohérentes avec le cahier des charges (proposées, à valider)

- **Confirmation avant sync** si c'est la première fois ou si un délai important s'est écoulé depuis la dernière sync ("Vous allez remplacer entièrement le contenu de la table cible. Continuer ?").
- **Journal des synchronisations** (log local simple, les N dernières tentatives avec horodatage et statut) pour audit/debug sans complexité serveur.
- **Indicateur du nombre de lignes source vs. dernière sync poussée**, pour visualiser rapidement si la source a évolué depuis la dernière synchronisation (sans faire de diff complet — juste un compteur informatif).

---

## 8. Hors périmètre V1 / pistes V2

- **Synchronisation automatique planifiée** (nécessiterait un backend/scheduler — hors périmètre "widget seul").
- **Diff intelligent** (update/insert/delete ciblés sur une clé métier stable) pour préserver les `rowId` cible et permettre des annotations pérennes côté cible.
- **Chiffrement de la clé API stockée** (ex. via passphrase connue uniquement par l'utilisateur) si le scope des clés venait à s'élargir ou si le contexte de sensibilité l'exigeait.
- **Mapping de colonnes configurable manuellement** (au-delà de la correspondance par nom identique), pour gérer des renommages ou des transformations.
- **Synchronisation multi-tables** depuis un seul widget.
- **Historique/audit plus poussé** des synchronisations (au-delà du simple journal local).

---

## 9. Risques identifiés et arbitrages

| Risque | Décision V1 | Justification |
|---|---|---|
| Perte des rowId cible à chaque sync | Accepté | Charge négligeable à l'échelle visée ; V2 pourra introduire un diff si besoin réel constaté |
| Échec partiel de sync (delete réussi, insert échoué) | Accepté, message d'erreur simple | Pas de complexité de rollback en V1 ; table cible traitée comme non critique entre deux syncs |
| Visibilité de la clé API dans la configuration du widget par des collaborateurs du doc source | À valider techniquement | Dépend des capacités natives de Grist sur la visibilité des options de widget ; scope de clé volontairement restreint pour limiter l'impact |
| Absence d'automatisation | Accepté | Cohérent avec l'absence de backend en V1 ; sync manuelle/à l'ouverture suffisante pour le besoin exprimé |
| Fuite de la clé de compte de service cible | Impact limité | Scope restreint à l'écriture sur une table vide dédiée : pas de lecture de données sensibles possible |

---

## 10. Prochaines étapes techniques

1. **Valider concrètement** (test sur l'instance Grist DINUM/La Suite) que les Access Rules d'un compte de service permettent bien de restreindre les droits à *écriture seule sur une seule table*, sans lecture ni accès aux autres tables/documents.
2. Vérifier la visibilité des options de configuration d'un custom widget Grist (qui peut les lire/modifier parmi les collaborateurs du document).
3. Spécifier précisément les appels API Grist utilisés (endpoints `/records` bulk POST/DELETE, format des payloads).
4. Développer un prototype minimal du widget (lecture table source, configuration, bouton de sync, appel API cible).
5. Tester en conditions réelles avec deux documents distincts appartenant à deux comptes différents.
