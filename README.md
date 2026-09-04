# Grist Sync Connector 🔄

**Connecteur de synchronisation inter-documents Grist avec authentification par email, chiffrement des données et contrôle d'accès granulaire.**

## Vue d'ensemble

Grist Sync Connector permet à deux utilisateurs de documents Grist différents de synchroniser des données de façon sécurisée, avec :
- ✅ Authentification par email de session Grist
- ✅ Chiffrement bout-à-bout des données en transit
- ✅ Contrôle d'accès basé sur demande et révocation
- ✅ Widgets intégrés dans Grist (source et cible)
- ✅ Back-end minimaliste (stockage via Grist, pas de BDD)
- ✅ Logs d'audit complets
- ✅ Synchronisation automatique 24h + manuelle

## Structure du projet

```
grist-sync-connector/
├── CAHIER_DES_CHARGES.md      # Spécifications complètes (v1)
├── backend/                    # Backend Node.js/Python (V1 local)
│   ├── app.js
│   ├── package.json
│   └── ...
├── widgets/
│   ├── source-widget.html      # Widget côté source (Grist natif)
│   └── target-widget.html      # Widget côté cible (Grist natif)
└── docs/
    ├── ARCHITECTURE.md         # Détail technique
    └── ROADMAP.md             # Évolutions futures
```

## Quick Start (V1)

Voir `CAHIER_DES_CHARGES.md` pour les détails complets.

## Licence

MIT
