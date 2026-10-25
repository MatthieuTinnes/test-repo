# test-repo

## Déploiement

Les jeux sont déployés automatiquement sur GitHub Pages à chaque push sur `main` :

<https://matthieutinnes.github.io/test-repo/>

Le workflow `.github/workflows/deploy-pages.yml` publie la page d'accueil (`index.html`) ainsi que les dossiers `flappy/`, `plateforme/` et `lapin/`. Il peut aussi être lancé manuellement depuis l'onglet « Actions » du dépôt.

## Jeux

Le dépôt contient trois jeux en JavaScript, sans installation ni dépendance. La page d'accueil `index.html` permet de choisir entre eux.

### Lancer les jeux

Ouvrez `index.html` dans votre navigateur (Chrome ou Firefox), ou directement l'un des jeux :

- `flappy/index.html` : Flappy Bird
- `plateforme/index.html` : jeu de plateforme en 3 niveaux
- `lapin/index.html` : Lapin, un jeu type Doodle Jump

Les trois jeux fonctionnent en ouverture directe via `file://`.

### Flappy Bird (`flappy/`)

#### Commandes

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Faire monter l'oiseau | `Espace` ou `Flèche haut` | clic sur le jeu |
| Démarrer une partie | `Espace`, `Flèche haut` ou `Entrée` (sur l'écran de départ) | bouton « Jouer » |
| Rejouer après une défaite | `Espace`, `Flèche haut` ou `Entrée` | clic sur l'écran de fin ou bouton « Rejouer » |
| Couper / rétablir le son | `M` | bouton « Son » |

#### Règles

- Passez entre les tuyaux sans les toucher ni toucher le sol.
- Chaque tuyau franchi rapporte 1 point.
- La vitesse augmente et l'ouverture entre les tuyaux se resserre au fil du score, jusqu'à un plafond.
- Le record est sauvegardé dans le navigateur (`localStorage`) et conservé d'une partie à l'autre.

#### Fichiers

- `flappy/index.html` : structure de la page, canvas et écrans (départ, fin de partie).
- `flappy/style.css` : mise en page et habillage des écrans.
- `flappy/game.js` : boucle de jeu, physique, collisions, rendu, sons et entrées.

### Plateforme (`plateforme/`)

#### Commandes

| Action | Clavier | Écran tactile |
| --- | --- | --- |
| Se déplacer | `Flèche gauche` / `Flèche droite` | boutons ◀ et ▶ |
| Sauter (hauteur contrôlée) | `Espace` ou `Flèche haut` | bouton ▲ |
| Démarrer ou rejouer | `Entrée` | bouton « Jouer » ou « Rejouer » |

Les boutons tactiles supportent le multi-touch : on peut marcher et sauter en même temps.

#### Règles

- Trois niveaux enchaînés : Prairie, Collines, Ciel.
- Ramassez les pièces (10 points chacune) et atteignez le drapeau pour passer au niveau suivant.
- Écrasez un ennemi en lui tombant dessus par le haut. Un contact latéral lui fait perdre une vie.
- Vous avez 3 vies. Tomber dans un trou en fait perdre une. Après une perte de vie, le niveau reprend au départ, sans dégât pendant quelques secondes.
- Le drapeau du dernier niveau affiche l'écran de victoire.

#### Niveaux

Chaque niveau est une grille de caractères déclarée dans `plateforme/game.js` (`LEVELS`) :

| Caractère | Élément |
| --- | --- |
| `#` | bloc solide |
| `C` | pièce |
| `E` | ennemi (posé sur un bloc) |
| `S` | départ |
| `F` | drapeau d'arrivée |
| `.` | vide |

#### Fichiers

- `plateforme/index.html` : structure de la page, canvas, écrans et boutons tactiles.
- `plateforme/style.css` : mise en page, habillage des écrans et des boutons tactiles.
- `plateforme/game.js` : niveaux, physique, collisions, caméra, rendu et entrées.

### Lapin (`lapin/`)

#### Commandes

| Action | Clavier | Écran tactile |
| --- | --- | --- |
| Se déplacer | `Flèche gauche` / `Flèche droite` | boutons ◀ et ▶ |
| Démarrer ou rejouer | `Espace`, `Flèche haut` ou `Entrée` | bouton « Jouer » ou « Rejouer » |

Les boutons tactiles supportent le multi-touch. Le lapin rebondit tout seul : il n'y a pas de bouton de saut.

#### Règles

- Le lapin monte sans fin : la caméra le suit vers le haut.
- Il rebondit sur une plateforme quand il tombe dessus par le haut. Il la traverse par en dessous.
- Quatre types de plateformes : normale (verte), mobile (bleue, va-et-vient), cassable (brune, disparaît après un rebond) et ressort (jaune, rebond plus haut).
- Le score est la hauteur maximale atteinte, en mètres. Le record est sauvegardé dans le navigateur (`localStorage`, clé `lapin.record`).
- Plus le lapin monte, plus les plateformes sont espacées et plus les mobiles et cassables sont fréquents, jusqu'à un plafond.
- La partie se termine quand le lapin tombe sous l'écran.

#### Fichiers

- `lapin/index.html` : structure de la page, canvas, écrans (départ, fin de partie) et boutons tactiles.
- `lapin/style.css` : mise en page, habillage des écrans et des boutons tactiles.
- `lapin/game.js` : génération des plateformes (graine), physique, rebonds, caméra, rendu et entrées.

### Tests

Les tests des jeux tournent avec Node, sans navigateur :

```sh
node --test
```

Les fichiers de tests sont `tests/plateforme.test.js` (niveaux et physique de `plateforme/`) et `tests/lapin.test.js` (génération, rebonds et fin de partie de `lapin/`). Le montage DOM minimal partagé est dans `tests/support/loadGame.js`.
