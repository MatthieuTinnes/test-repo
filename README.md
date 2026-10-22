# test-repo

## Jeu

Un Flappy Bird en JavaScript, sans installation ni dépendance.

### Lancer le jeu

Ouvrez simplement `index.html` dans votre navigateur (Chrome ou Firefox). Le jeu fonctionne aussi en ouverture directe via `file://`.

### Commandes

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Faire monter l'oiseau | `Espace` ou `Flèche haut` | clic sur le jeu |
| Démarrer une partie | `Espace`, `Flèche haut` ou `Entrée` (sur l'écran de départ) | bouton « Jouer » |
| Rejouer après une défaite | `Espace`, `Flèche haut` ou `Entrée` | clic sur l'écran de fin ou bouton « Rejouer » |
| Couper / rétablir le son | `M` | bouton « Son » |

### Règles

- Passez entre les tuyaux sans les toucher ni toucher le sol.
- Chaque tuyau franchi rapporte 1 point.
- La vitesse augmente et l'ouverture entre les tuyaux se resserre au fil du score, jusqu'à un plafond.
- Le record est sauvegardé dans le navigateur (`localStorage`) et conservé d'une partie à l'autre.

### Fichiers

- `index.html` : structure de la page, canvas et écrans (départ, fin de partie).
- `style.css` : mise en page et habillage des écrans.
- `game.js` : boucle de jeu, physique, collisions, rendu, sons et entrées.
