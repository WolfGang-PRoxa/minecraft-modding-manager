# Historique des versions

Toutes les évolutions notables de Modding Manager (Modpack Manager jusqu’à la 1.9, Modpack Downloader jusqu’à la
1.0.5), de la plus récente à la plus ancienne. L’application affiche le même historique dans **Aide → Nouveautés**.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Pour tenir ce fichier à jour, voir
[Suivi des changements](docs/developpement.md#suivi-des-changements).

## [Non publié]

## [2.3.0] - 2026-10-26

### Ajouts

- L’application se lance au démarrage de Windows, réduite dans la barre des tâches. Un clic sur son icône l’ouvre en
  grand. Désactivable dans **Paramètres → Démarrage et mises à jour → Lancer avec Windows**.
- Une nouvelle version de l’application s’installe d’elle-même à son démarrage, puis l’application redémarre.
  Désactivable dans **Paramètres → Démarrage et mises à jour → Se mettre à jour au démarrage** : la mise à jour reste
  alors proposée en haut de la fenêtre.

## [2.2.1] - 2026-10-26

### Améliorations

- Studio : le dossier qui contient modpacks, mods, packs de ressources, shaders et plugins s’appelle désormais le
  **dossier des contenus**, et le dossier proposé par défaut devient `C:\Users\<nom>\Modding Manager` (au lieu de
  `Modpacks`). Un dossier déjà choisi ne change pas ; il se renomme ou se remplace dans **Paramètres → Dossier des
  contenus**.

## [2.2.0] - 2026-10-26

### Corrections

- Studio : un pack de ressources ou un shader s’envoie de nouveau sur CurseForge. L’envoi échouait avec « Invalid game
  version ID » : l’application le marquait `Client`, ce que CurseForge refuse sur ces projets.

## [2.1.0] - 2026-10-26

### Ajouts

- Studio : les mods, packs de ressources, shaders, plugins et modpacks sans profil se rangent dans des **groupes**,
  des sous-dossiers repliables de la colonne de gauche. Le groupe se donne dans **Infos et image** (champ **Groupe**),
  ou par la commande `packs group`. Rien ne bouge sur le disque ni chez les joueurs.

### Corrections

- Studio : un modpack, un contenu ou une version dont le nom a un accent ou un tiret long (« Lumière »,
  « MA3D – Plants ») se supprime de nouveau : sa mise à la corbeille échouait avec « introuvable ».

## [2.0.0] - 2026-10-24

<!-- moteur des mods, décrit avec leur interface : b49e265 -->

### Ajouts

- Studio : les **mods** du publieur se publient comme ses modpacks. **Nouveau contenu** part du dossier où le projet
  du mod dépose ses jars, qui reste lié : ses nouvelles versions s’y repèrent et s’importent en un clic. Chaque
  version devient une release GitHub, et s’envoie sur CurseForge avec sa version de Minecraft, son chargeur et ses
  dépendances. Aussi depuis le terminal et Claude Code (commandes `content`).
- Studio : les **plugins** de serveur (Paper, Spigot, Bukkit, Purpur, Folia) se publient aussi, depuis le dossier où
  leur projet dépose ses jars, sur GitHub, Modrinth et **Hangar** (clé dans Paramètres → **Compte Hangar** ;
  commandes `hangar`).
- Bibliothèque : les **mods**, **packs de ressources** et **shaders** publiés s’affichent sous les modpacks. Ils
  s’ajoutent en un clic aux profils installés par l’application, où ils restent quand le modpack se met à jour ; une
  autre version s’installe ou se retire depuis leur fiche.
- Studio : les **packs de ressources** et les **shaders** se publient aussi, depuis le dossier du pack en cours de
  création (zippé à chaque version) ou depuis des zips. Les versions de Minecraft d’un pack de ressources sont lues
  dans son `pack.mcmeta` ; celles d’un shader se donnent à la main.
- Studio : les mods se publient aussi sur **Modrinth**, avec un jeton enregistré dans Paramètres → **Compte Modrinth**
  (commandes `modrinth`).
- Paramètres → **Apparence** : six styles de couleurs au choix (dont **Neige**, un style clair, et **Contraste
  élevé**), et des styles personnalisés à créer soi-même : couleurs du fond, du texte et de l’accent, angles, police
  des titres, animations et effets de flou, avec un aperçu.
- La taille de l’interface se règle de 80 % à 150 %, dans Paramètres → Apparence ou avec `Ctrl` + `+`, `Ctrl` + `-` et
  `Ctrl` + `0`.

### Améliorations

- L’application s’appelle désormais **Modding Manager** : elle gère maintenant aussi les mods, les packs de
  ressources, les shaders et les plugins. La mise à jour reprend tout d’elle-même, sans rien demander : réglages,
  connexions, résultats des tests, modpacks installés, raccourci du bureau et épingles, et pour un publieur, les mises
  à jour automatiques et la connexion à Claude Code (voir
  [Passage à la 2.0.0](docs/mises-a-jour.md#passage-à-la-200)). Son dépôt devient
  `WolfGang-PRoxa/minecraft-modding-manager` (l’ancienne adresse redirige vers lui).
- Paramètres : la fenêtre est plus large et range ses sections côte à côte, en deux colonnes, ou trois pour un
  publieur sur un grand écran. Il n’y a plus besoin de la faire défiler pour tout voir.

## [1.9.3] - 2026-10-20

<!-- relais du mainteneur, sans effet dans l’application : aa93f74 2f35a2d 2d8faaf -->

### Corrections

- Studio, mises à jour automatiques : une mise à jour en attente dont l’essai a été gardé ou abandonné ailleurs
  (mises à jour du profil, terminal, Claude) ne reste plus affichée sur la carte du modpack. Avant, sa section ne
  pouvait plus être retirée : **Abandonner** et **Valider quand même** échouaient faute d’essai.

## [1.9.2] - 2026-10-20

<!-- relais du mainteneur, sans effet dans l’application : b983e05 -->

### Ajouts

- Un avertissement rappelle, au moment de suivre un autre dépôt que celui par défaut, qu’un modpack contient du code
  qui s’exécute pendant une partie : ne suivre que le dépôt d’une personne de confiance.

### Sécurité

- Un modpack dont l’empreinte n’est pas connue n’est plus installé, et une mise à jour de l’application dont GitHub
  ne donne pas l’empreinte n’est plus téléchargée : rien ne prouverait que le fichier reçu est celui publié.
- Les boutons **Ouvrir** n’ouvrent plus que des dossiers, jamais un fichier ou un programme.
- La fenêtre de l’application refuse caméra, micro, position et autres permissions (seule la copie dans le
  presse-papiers reste permise), et n’exécute plus aucun script écrit dans la page.
- Studio : les installeurs de Forge et de NeoForge des tests de serveur sont comparés à l’empreinte publiée par leur
  site, et un mod sans empreinte sur CurseForge n’est plus mis à jour par l’application.
- Mise à jour du SDK MCP utilisé par la connexion à Claude Code.

## [1.9.1] - 2026-10-20

### Améliorations

- L’aide est réécrite sur un ton neutre, sans tutoiement, et plusieurs pages sont précisées (tests d’une version
  avant publication, raccourci recréé après le passage à la 1.9.0).
- La présentation du projet sur GitHub existe désormais en anglais (affichée par défaut) et en français.

## [1.9.0] - 2026-10-20

### Améliorations

- L’application prend partout le nom **Modpack Manager** : exécutable `Modpack Manager.exe`, installée dans
  `Programs\minecraft-modpack-manager`, données dans `%APPDATA%\Modpack Manager`, dépôt
  `WolfGang-PRoxa/minecraft-modpack-manager`. La mise à jour reprend tout d’elle-même : l’ancienne application est
  retirée, tes réglages, ta connexion GitHub et tes modpacks installés sont gardés, et tes raccourcis, tes épingles de
  la barre des tâches, la tâche planifiée et la connexion à Claude Code lancent la nouvelle (voir
  [Passage à la 1.9.0](docs/mises-a-jour.md#passage-à-la-200)).
- La page **Confidentialité et sécurité** de l’aide liste tous les services que l’application contacte, et quand.

## [1.8.3] - 2026-10-19

### Ajouts

- Bouton **Offrir un café**, en haut à droite : la page Buy Me a Coffee du développeur, pour soutenir le projet.

### Améliorations

- Menus déroulants aux couleurs de l’application : liste arrondie, choix en cours coché, au clavier comme à la
  souris. Les cases à cocher et les boutons radio suivent le même style.

## [1.8.2] - 2026-10-19

### Améliorations

- Studio : les versions laissent aussi de côté le cache de Distant Horizons des serveurs visités (souvent plusieurs
  Go), les données d’Essential (compte, amis), les enregistrements et réglages du micro de Simple Voice Chat, et les
  données de JEI par monde.

### Corrections

- Studio : **Garder l’essai** ferme bien CurseForge quand il tourne dans Overwolf (il restait ouvert, verrouillait des
  fichiers du profil et pouvait réécrire sa liste de mods). Le report est désormais tout ou rien : si un fichier reste
  utilisé par un autre programme, ton profil est remis exactement comme avant, au lieu de rester à moitié mis à jour.
- Studio : un modpack publié seulement sur CurseForge n’est plus limité à 2 Go : cette limite est celle de GitHub.

## [1.8.1] - 2026-10-19

### Améliorations

- Studio : sur la ligne d’une version, le nom du zip n’est plus coupé. Les pastilles (GitHub, CurseForge, tests)
  passent sous le nom, et les boutons dessous quand la fenêtre est étroite. La pastille d’une version en ligne sur le
  site devient **Publiée sur CurseForge**, pour ne plus la confondre avec **Version sur CurseForge** (la version est
  dans tes profils).

## [1.8.0] - 2026-10-19

### Ajouts

- Studio : **partie de test avec de vrais joueurs**. Dans les tests d’un profil, le serveur de test démarre, puis 1 à 4
  vrais jeux Minecraft le rejoignent avec tous les mods du profil (ceux du jeu compris) : ils se dispersent dans le
  monde, de nuit, et l’on vérifie qu’aucun ne plante ni n’est déconnecté. Les joueurs n’ont pas de compte : ce sont des
  jeux hors ligne qui ne se connectent qu’au serveur de test, sur ton PC. **Tout tester** enchaîne fichiers, serveur et
  partie. En commandes : `tests players`, `tests all`.
- Studio : la vérification des fichiers contrôle aussi les **versions demandées** par chaque mod (de Minecraft, du
  chargeur et des autres mods) et les **incompatibilités déclarées**, comme le fera le jeu au démarrage.
- Studio : les erreurs des journaux du serveur et du jeu sont relevées, même quand ils démarrent.
- Studio : chaque version porte le bilan de ses derniers tests (**Testée**, **Testée en partie**, **Tests en échec**,
  **Pas testée**), rappelé à la publication sur GitHub et sur CurseForge.

### Améliorations

- Mises à jour automatiques : l’essai passe la partie avec des joueurs, et ses journaux sont comparés à ceux de ton
  profil. Une erreur qui n’apparaît qu’avec les mises à jour est signalée et retient la publication automatique.

### Corrections

- Vérification des fichiers : les mods embarqués par un mod Forge dans `META-INF/jars` sont reconnus (fausses
  dépendances manquantes, comme ESL pour Create: New Age) ; un jar multi-chargeurs est lu avec la description du
  chargeur du profil ; un mod fait pour un autre chargeur est signalé comme ignoré par le jeu, plus comme une erreur.

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

[Non publié]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.3.0...HEAD
[2.3.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.2.1...app-v2.3.0
[2.2.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.2.0...app-v2.2.1
[2.2.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.1.0...app-v2.2.0
[2.1.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.0.0...app-v2.1.0
[2.0.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.3...app-v2.0.0
[1.9.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.2...app-v1.9.3
[1.9.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.1...app-v1.9.2
[1.9.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.0...app-v1.9.1
[1.9.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.3...app-v1.9.0
[1.8.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.2...app-v1.8.3
[1.8.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.1...app-v1.8.2
[1.8.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.0...app-v1.8.1
[1.8.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.7.0...app-v1.8.0
[1.7.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.6.0...app-v1.7.0
[1.6.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.5.0...app-v1.6.0
[1.5.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.4.0...app-v1.5.0
[1.4.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.3.0...app-v1.4.0
[1.3.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.2.0...app-v1.3.0
[1.2.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.1.0...app-v1.2.0
[1.1.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.5...app-v1.1.0
[1.0.5]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.4...app-v1.0.5
[1.0.4]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.3...app-v1.0.4
[1.0.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.2...app-v1.0.3
[1.0.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.1...app-v1.0.2
[1.0.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.0...app-v1.0.1
[1.0.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/tag/app-v1.0.0
