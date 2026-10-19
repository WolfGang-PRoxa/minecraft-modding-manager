# Historique des versions

Toutes les évolutions notables de Modpack Manager (Modpack Downloader jusqu’à la 1.0.5), de la plus récente à la plus
ancienne. L’application affiche le même historique dans **Aide → Nouveautés**.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Pour tenir ce fichier à jour, voir
[Suivi des changements](docs/developpement.md#suivi-des-changements).

## [Non publié]

## [1.7.0] - 2026-10-19

### Ajouts

- Studio : la ligne **Publié sur CurseForge** d’un modpack lié à son projet dit combien de versions y sont déjà, et
  laquelle est la dernière (« 28 versions, dernière : V27 »). Un clic ouvre la liste de toutes ses versions, y compris
  celles mises en ligne depuis le site : numéro, date, type, versions de Minecraft, état de modération, lien vers la
  page de chaque fichier. Sur les lignes des versions, la pastille **Sur CurseForge** apparaît aussi pour les numéros
  déjà en ligne depuis le site. La commande `curseforge versions` donne la même liste.

### Corrections

- Studio : une version dont le numéro est déjà sur CurseForge (mise en ligne depuis le site), ou plus ancienne que la
  dernière qui s’y trouve, ne propose plus **Publier sur CurseForge**, et son envoi est refusé.

## [1.6.0] - 2026-10-11

### Ajouts

- Studio : **mises à jour automatiques**. Chaque modpack a sa fréquence (chaque semaine, toutes les deux semaines,
  chaque mois, à la demande ou jamais) : à son tour, ses mods sont mis à jour sur une copie de son profil, testés
  (fichiers puis serveur), et la nouvelle version attend ta validation sur sa carte, ou se publie seule si tu le
  permets. Mods figés, versions bêta au choix. Une tâche planifiée de Windows fait les passages chaque jour, en
  réveillant le PC si tu veux, puis une notification résume ce qui a changé. Claude Code peut analyser les échecs.
  En commandes : `maintenance run`, `maintenance validate`, `maintenance schedule`…

## [1.5.0] - 2026-10-11

### Ajouts

- Studio : **publication sur CurseForge**. Lie un modpack à son projet CurseForge (la numérotation continue après tes
  versions déjà publiées), puis publie sa dernière version en un clic : export au format de CurseForge, nom affiché
  `<nom>_V<N>.zip`, notes de version, puis suivi de la modération sur la carte. Un modpack peut être publié sur GitHub,
  sur CurseForge, ou les deux. En commandes : `curseforge link`, `curseforge publish`, `curseforge versions`…
- Studio : **tests avant publication**, dans le détail d’un profil ou de son essai. **Vérifier les fichiers** trouve
  en quelques secondes les mods en double, les dépendances manquantes et les mods faits pour un autre chargeur ;
  **Tester sur un serveur** démarre un vrai serveur Minecraft avec les mods du profil et dit s’il démarre, ou pourquoi
  il plante. Les mêmes tests en commandes : `tests check` et `tests server`.

## [1.4.0] - 2026-10-11

### Ajouts

- Studio : **mises à jour des mods**. Dans le détail d’un profil, l’application cherche sur CurseForge les nouvelles
  versions de ses mods, packs de textures et shaders (même version de Minecraft, même chargeur, dépendances
  manquantes comprises). Celles que tu choisis sont appliquées à une **copie d’essai** du profil, à tester dans
  CurseForge ; tu la gardes (ses mises à jour passent dans ton profil, tes mondes, réglages et mods désactivés restent
  les tiens) ou tu l’abandonnes. Ton profil n’est jamais modifié sans ton accord.
- Les mêmes opérations en commandes, pour toi et pour Claude : `updates check`, `updates changelog`, `updates apply`,
  `updates promote`, `updates discard`.

### Corrections

- Un modpack installé reçoit sa propre identité CurseForge, partout dans le profil : il ne peut plus être confondu
  avec le profil du publieur d’où vient la version. Les versions créées ensuite ne contiennent plus l’identité du
  profil du publieur.

## [1.3.0] - 2026-10-11

### Ajouts

- Publieurs : **Paramètres → Compte CurseForge** enregistre ta clé de l’API CurseForge et ton jeton d’auteur,
  vérifiés par CurseForge puis chiffrés par Windows. Ils prépareront la mise à jour des mods et la mise en ligne sur
  CurseForge.
- Studio : tes **profils CurseForge**, rangés dans les mêmes dossiers que dans CurseForge, chacun face au modpack qui
  en vient. Une pastille dit s’il est à jour ou s’il a changé depuis la dernière version, et un clic propose la suite :
  créer la version suivante, ou créer un modpack depuis un profil (avec sa v1) en une fois.

## [1.2.0] - 2026-10-11

### Ajouts

- Publieurs : **Claude Code** peut gérer tes modpacks. Connecte-le dans **Paramètres → Claude Code et terminal** :
  à ta demande, il crée une version depuis ton profil CurseForge, règle le modpack, écrit les notes et publie, en te
  montrant avant ce qui changera sur GitHub.
- Publieurs : toutes les opérations du Studio existent aussi en commandes, dans un terminal (`mpm.cmd`, à côté de
  l’application).

### Améliorations

- Le Studio, le terminal et Claude ne peuvent plus se gêner : une seule opération d’écriture tourne à la fois, et la
  mise à jour de l’application attend qu’elle soit finie.
- Chaque opération du Studio (création de version, réglages, publication, suppression) est notée dans un journal,
  avec son auteur et son résultat.

## [1.1.0] - 2026-10-11

### Améliorations

- Modpack Downloader devient **Modpack Manager**, avec un nouveau logo : dans l’application, sur l’icône du
  programme et de ses raccourcis, et dans les fenêtres de l’installeur. La mise à jour garde tout : réglages,
  connexion GitHub, modpacks installés, raccourcis et épingles de la barre des tâches.

## [1.0.5] - 2026-10-03

### Ajouts

- Studio : **Réglages des versions** de chaque modpack. Choisis les fichiers que tu ne publies jamais (tes options du
  jeu, tes shaders, un mod personnel…), les mods que les joueurs reçoivent désactivés, et si les configurations qu’ils
  ont modifiées sont gardées à chaque mise à jour.
- Studio : un zip qui contient des fichiers exclus le signale avant d’être publié, et **Retirer du zip** les enlève.
- Les mods qu’un publieur propose en option sont installés désactivés : active ceux que tu veux dans CurseForge.
- Une fenêtre **Mise à jour**, distincte de celle de l’installation, indique ta version et la nouvelle (par exemple
  `1.0.4 → 1.0.5`).
- Lancé pendant que l’application est ouverte, l’installeur prévient qu’il va la fermer (**Fermer et continuer** ou
  **Annuler**), puis la rouvre à la fin.

### Améliorations

- La mise à jour d’un modpack garde les mods que tu as activés ou désactivés dans CurseForge, et, si le publieur l’a
  choisi, les fichiers de configuration que tu as modifiés.
- Les fenêtres de l’installeur et du désinstalleur prennent le style de l’application : fond sombre, logo, couleurs,
  boutons et barre de progression.
- Relancé alors que l’application est déjà installée, l’installeur affiche une page claire (**Ouvrir l’application**,
  **Réinstaller** ou **Annuler**) au lieu d’une boîte Oui / Non / Annuler. De même quand une version plus récente est
  installée.
- La désinstallation demande confirmation dans une fenêtre du même style, puis se ferme d’elle-même.

## [1.0.4] - 2026-10-03

### Ajouts

- **Aide intégrée** : toute la documentation de l’application (installer et jouer, publier avec le Studio,
  paramètres, dépannage…) s’ouvre avec le bouton **Aide** de la barre de titre ou la touche `F1`, avec une recherche
  dans toutes les pages.
- Page **Nouveautés** : l’historique des versions de l’application, consultable à tout moment depuis l’aide ou
  **Paramètres → À propos**.
- Après une mise à jour de l’application, la notification propose **Voir les nouveautés**, qui met en avant les
  changements depuis ta version précédente.
- La barre de mise à jour présente ce qu’apporte la nouvelle version avant de l’installer (bouton **Nouveautés**).

### Corrections

- Studio : le message qui refuse un export CurseForge cite le bon bouton, « Créer la v… depuis CurseForge ».

## [1.0.3] - 2026-10-02

### Ajouts

- Studio : suppression d’une version (son zip part à la corbeille et sa release est retirée de GitHub tout de suite)
  ou d’un modpack entier, après une confirmation qui dit ce qui va changer pour les joueurs. Les releases dont le zip
  a disparu peuvent aussi être retirées sans attendre la publication. <!-- 1f4d1c4 -->
- Studio : bouton **Contenu** sur chaque version et chaque zip à ranger, pour voir ses mods (nom donné par
  CurseForge, auteur, lien vers leur page) et parcourir ses fichiers, avec un aperçu des configurations et des
  images. <!-- 335bee1 -->
- La fenêtre s’ouvre en grand, la barre des tâches restant visible ; `F11` passe en plein écran et en fait sortir.
  <!-- 8f35361 -->

### Améliorations

- La pastille « dans ton CurseForge » devient « Version sur CurseForge : v2 » (« Versions » s’il y en a plusieurs).
  <!-- 3e5ccb0 -->

### Corrections

- Un modpack installé ou mis à jour pendant que CurseForge était ouvert n’y apparaissait pas, ou affichait « 404 » :
  l’application le signale et propose **Relancer CurseForge**, qui rouvre CurseForge avec tous ses profils. Le même
  bouton est dans **Paramètres → CurseForge**. <!-- 58d0a17 -->
- Une image de modpack carrée ou en portrait était rognée : elle est maintenant affichée en entier dans son cadre.
  <!-- cbda3b3 -->
- Après une mise à jour de l’application, le raccourci du bureau pouvait perdre son icône. <!-- bbf0122 -->

## [1.0.2] - 2026-10-02

### Ajouts

- **Signaler un problème** : un formulaire, ouvert par le bouton en forme d’insecte de la barre de titre ou depuis
  **Paramètres → À propos**, pour décrire un problème ou proposer une idée. Avec un compte GitHub connecté, le
  signalement devient directement une issue du dépôt ; sinon, la page GitHub s’ouvre déjà remplie. <!-- 71316b4 -->
- Chaque signalement est suivi : le mainteneur est prévenu aussitôt et peut faire préparer une correction, publiée
  après sa validation. <!-- c678c5f -->

### Corrections

- Le bouton qui annule une installation est annoncé « Annuler l’installation », avec l’apostrophe typographique du
  reste de l’interface. <!-- 38fe174 -->

## [1.0.1] - 2026-10-02

### Ajouts

- L’application indique les versions de modpack déjà présentes dans ton CurseForge (« v2 dans ton CurseForge »),
  même si ce n’est pas la dernière et même pour un profil qu’elle n’a pas installé : elle le reconnaît à ses mods.
  Elle ne modifie jamais un tel profil : **Installer** en crée un à part. <!-- 86621eb -->
- Studio : chaque modpack indique quelle version se trouve dans ton CurseForge et si elle est en ligne. Les versions
  déjà publiées sont complétées à la publication suivante pour être reconnues chez les joueurs (seul leur
  `modpack.json` est renvoyé). <!-- 86621eb -->

## [1.0.0] - 2026-10-02

Première version publique.

### Ajouts

- **Bibliothèque** : les modpacks publiés sur le dépôt suivi, avec leurs notes et l’historique de leurs versions.
  Installation en un clic, directement comme profil CurseForge, avec vérification de l’empreinte de chaque
  téléchargement.
- Mise à jour d’un modpack sur place : mondes, options, captures d’écran, packs de ressources et réglages du profil
  (mémoire, arguments Java) sont conservés.
- Détection de CurseForge (Overwolf ou application autonome) et de son dossier `Instances`, modifiable dans les
  paramètres ; CurseForge s’ouvre après une installation.
- Fonctionnement hors ligne avec la dernière liste connue, et relecture de GitHub toutes les 30 minutes tant que
  l’application reste ouverte.
- Rôles **récepteur** et **publieur**, choisis au premier lancement et modifiables dans les paramètres. Un
  récepteur peut suivre les modpacks d’un autre dépôt public.
- **Studio** pour les publieurs : un dossier par modpack, numérotation des zips déposés, notes de version, image de
  couverture, zip créé directement depuis une instance CurseForge, et publication qui met les releases GitHub en
  accord avec le dossier. Les mêmes opérations existent en ligne de commande.
- Connexion GitHub du publieur, chiffrée par Windows et partagée avec la ligne de commande, avec repli sur une
  session GitHub CLI ou la variable `GITHUB_TOKEN`.
- Raccourci sur le bureau, ou à l’emplacement de ton choix, proposé au premier lancement.
- L’installeur reconnaît une application déjà installée : il propose de l’ouvrir plutôt que de la réinstaller, et
  prévient avant un retour à une version plus ancienne.
- Mises à jour de l’application proposées en haut de la fenêtre, quelle que soit la vue : téléchargement vérifié,
  installation et redémarrage automatiques.

[Non publié]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.7.0...HEAD
[1.7.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.6.0...app-v1.7.0
[1.6.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.5.0...app-v1.6.0
[1.5.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.4.0...app-v1.5.0
[1.4.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.3.0...app-v1.4.0
[1.3.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.2.0...app-v1.3.0
[1.2.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.1.0...app-v1.2.0
[1.1.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.5...app-v1.1.0
[1.0.5]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.4...app-v1.0.5
[1.0.4]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.3...app-v1.0.4
[1.0.3]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.2...app-v1.0.3
[1.0.2]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.1...app-v1.0.2
[1.0.1]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/compare/app-v1.0.0...app-v1.0.1
[1.0.0]: https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/releases/tag/app-v1.0.0
