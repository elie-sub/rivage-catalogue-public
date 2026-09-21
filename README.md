# Rivage — catalogue public de Granville

Faits issus des annonces publiques et hypothèses de simulation indicatives. Aucune coordonnée personnelle, préférence privée, donnée financière personnelle ou clé d’accès. La disponibilité des biens reste à confirmer. Couverture non exhaustive.

Actualisation quotidienne dans GitHub Actions puis publication du seul fichier catalog.json sur GitHub Pages.


## Leboncoin et projets de division

Leboncoin refuse la collecte directe. La source est un import assisté des alertes officielles reçues via le connecteur Gmail autorisé. Aucun appel caché ni contournement. `scripts/parse-leboncoin-alerts.mjs` prend des arbres MIME stockés seulement dans un emplacement privé et écrit une liste de faits publics. `scripts/import-leboncoin.mjs /chemin/prive/faits.json` applique une liste blanche, conserve les observations les plus récentes, dédoublonne et met à jour `data/leboncoin.json` et le catalogue. Ne jamais publier MIME, destinataire, identifiant Gmail, lien de suivi ou donnée personnelle. Une alerte n’établit ni disponibilité actuelle ni date de publication.

Le fichier d’import reste présent lors des collectes quotidiennes. Les nouveaux imports Gmail nécessitent la veille Codex locale active ; le job cloud ne dispose pas du connecteur Gmail. `lastCollectedAt` distingue la vraie collecte des agences d’un import : l’import ne doit pas faire sauter la collecte du jour.

`data/division.json` est une sélection de maisons et immeubles situés uniquement à Granville. `scripts/refresh-division.py` tente chaque jour de vérifier les fiches déjà sélectionnées et conserve leur date lorsqu’une source n’est pas exploitable. Ce n’est pas une découverte exhaustive de nouveaux immeubles. Les plans de division et montants restent des hypothèses distinctes des faits publiés. L’actualisation ne valide jamais une division ou un rendement.
