# Grist Sync Connector — widget V1

Widget personnalisé Grist à installer **dans le document source**. Il lit la table actuellement associée au widget via `grist-plugin-api.js`, puis pousse les données vers une table préexistante d’un autre document.

## Hébergement

Les fichiers `index.html`, `style.css` et `main.js` sont statiques et ne nécessitent aucun backend. Hébergez le dossier `widget/` sur un hébergement HTTPS (GitHub Pages recommandé). Pour activer GitHub Pages : ouvrez **Settings → Pages**, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis enregistrez. L’URL prévisible est :

`https://lombre33.github.io/grist-sync-connector/widget/`

Si le dépôt est privé ou si Pages n’est pas activé, utilisez un autre hébergement statique HTTPS. Dans Grist, ajoutez un **Custom Widget** et renseignez l’URL HTTPS du `widget/index.html` hébergé. Le widget doit être placé dans la vue du document source et avoir l’accès requis à la table en lecture.

## Préparer la cible

Le propriétaire du document cible doit :

1. créer une table de réception vide ;
2. créer/renommer ses colonnes avec les mêmes noms que les colonnes source à recevoir ;
3. fournir une clé de compte de service limitée à l’écriture sur cette table ;
4. transmettre cette clé par un canal de confiance.

Dans la configuration du widget, renseignez l’URL de l’instance cible, le `docId`, le `tableId` et la clé API. Le bouton **Tester la connexion** effectue un GET sur la table cible avant toute synchronisation.

## Fonctionnement V1 et limites

- La lecture source utilise l’API native du widget (`grist.docApi.fetchTable`), sans clé source.
- Les colonnes sont associées par **nom identique**. Les colonnes source absentes de la cible sont signalées clairement et ignorées ; les colonnes correspondantes continuent d’être synchronisées. La table cible doit exposer sa structure via l’API ; une table vide sans métadonnées lisibles est refusée pour éviter une purge silencieuse.
- Une synchronisation confirme d’abord l’opération, puis exécute `DELETE /api/docs/{docId}/tables/{tableId}/records` sur les lignes visibles et `POST` bulk avec toutes les lignes source correspondantes. C’est une **purge complète puis réécriture complète**.
- Les `rowId` cible sont recréés à chaque run. Considérez la cible comme un miroir généré : n’y placez pas de formules, annotations ou données annexes dépendant de ces lignes, sauf si leur perte est acceptable.
- Il n’y a ni retry automatique ni rollback : une coupure entre DELETE et POST peut laisser la cible incomplète. Le statut détaille l’erreur HTTP/réseau et recommande une relance.
- Le déclenchement est manuel, avec option **Synchroniser automatiquement à l’ouverture**. Il n’y a pas de planification.
- Le journal des cinq dernières tentatives est local à la session. La date de dernière réussite et le compteur sont affichés pendant la session.

## Sécurité

La clé est stockée via `grist.widget.getOptions/setOptions` dans le document source, dans un champ password et sans affichage DOM en clair. Elle n’est jamais journalisée dans la console. Elle reste néanmoins soumise aux droits/à la visibilité des options du widget dans Grist : utilisez une clé strictement limitée et ne la commitez jamais dans Git. La suppression depuis l’interface efface la configuration locale ; elle ne révoque pas la clé côté Grist.

## Développement

Aucune dépendance de build. Le script officiel `https://docs.getgrist.com/grist-plugin-api.js` est chargé par CDN dans `index.html` ; le choix est commenté en tête de `main.js`. Testez sur une instance Grist réelle avec une table cible dédiée et une clé limitée avant usage en production.
