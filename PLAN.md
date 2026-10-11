# Plan — Modpack Manager

Plan de réalisation de [TODO.md](TODO.md) : renommer l'application, refaire la partie publieur autour des profils
CurseForge, mettre à jour et tester les modpacks automatiquement, publier sur GitHub et/ou CurseForge, et donner à Claude
la main sur toute la gestion des modpacks par des commandes. Établi le 2026-10-11, à reprendre à chaque étape.

## Principes

1. **Un seul moteur, trois façades.** Toute opération sur les modpacks (lire les profils, chercher les mises à jour,
   tester, publier…) est une **commande** du moteur, en Node pur. L'interface, la ligne de commande et Claude appellent
   les mêmes commandes : rien n'est faisable dans une façade sans l'être dans les autres, et rien n'est codé deux fois.
2. **Déterministe d'abord, Claude pour le jugement.** Chercher les mises à jour, télécharger, vérifier les empreintes,
   lancer les tests et publier sont des étapes programmées, rejouables et testées. Claude intervient là où il faut
   comprendre : lire un crash, choisir quel mod revenir en arrière, juger un changelog, rédiger les notes de version.
   C'est moins cher, plus fiable, et le pipeline marche même sans Claude.
3. **Le profil du publieur n'est jamais touché sans son accord.** Une mise à jour se construit sur une **copie d'essai**
   du profil. Le profil d'origine n'est modifié qu'une fois la version validée (par les tests, puis par le publieur ou
   par sa règle de publication automatique).
4. **Chaque phase est livrable seule**, en une version de l'app, avec son entrée dans `CHANGELOG.md` et sa page de
   `docs/`. Rien ne reste à moitié branché entre deux versions.
5. **Les règles du dépôt restent valables** (CLAUDE.md) : français, Node pur testable hors Electron, champs facultatifs
   écrits seulement s'ils servent, aucune écriture dans un profil qui n'est pas géré par l'app.

## Décisions du propriétaire (2026-10-11)

| Sujet | Décision |
|---|---|
| Claude dans le projet | Permis de le nommer comme fonction (interface, docs, skill) ; toujours aucune attribution (commits…). |
| « Modpacks présents sur CurseForge » | Les profils de l'app CurseForge du PC. Le propriétaire a aussi un compte d'auteur et des modpacks déjà publiés sur curseforge.com. |
| Portée des mises à jour automatiques | Même version de Minecraft et même chargeur. Changer de version de Minecraft : à la demande, avec Claude. |
| Publication | Par défaut, une version qui passe les tests est « prête, à valider » ; option par modpack pour publier seule. |
| Test en jeu | Acceptable pendant un passage automatique (fenêtre Minecraft, compte du propriétaire). |
| Suppression | L'app ne supprime jamais un profil CurseForge. |
| Passage automatique | La tâche planifiée réveille le PC (à reporter si trop complexe). |
| Clé de l'API CurseForge | Demandée par le propriétaire (nécessaire à partir de la phase 4). |

### Ce que change l'existence de projets sur curseforge.com

- **Relier, pas seulement créer** : un modpack de l'app peut pointer vers un projet CurseForge existant
  (`targets.curseforge.projectId`). La vue publieur propose le lien : un profil installé depuis le projet a ce
  `projectID` dans `minecraftinstance.json` ; sinon, comparaison des mods du dernier fichier publié avec ceux des profils.
- **Numérotation** : les fichiers déjà publiés sur CurseForge gardent leur nom. L'app garde son `vN` interne et retient,
  par version, l'identifiant du fichier CurseForge ; le nom affiché sur CurseForge suit un modèle réglable par modpack
  (par défaut celui des fichiers existants, sinon `<nom> v<N>`).
- **Référence pour l'export** : les fichiers déjà acceptés par CurseForge servent de modèle pour vérifier que l'export
  de l'app (`manifest.json` + `overrides`) est identique à celui de CurseForge, avant toute mise en ligne.
- **Jeton d'auteur disponible tout de suite** : la mise en ligne peut être essayée tôt (phase 6 avancée si besoin),
  sur un projet de test ou en `alpha`.
- **Profil source** : le profil travaillé doit être un profil personnel, pas une installation du modpack publié
  (CurseForge pourrait le remettre à la version en ligne). L'app le signale si c'est le cas.
- **Bibliothèque des joueurs** : inchangée (GitHub). Montrer aussi les modpacks publiés seulement sur CurseForge
  (lien vers la page) est une question à trancher plus tard.

## Faits vérifiés pour ce plan

- **Dossiers de CurseForge** : `%LOCALAPPDATA%\Overwolf\Curse\GameInstances\groups.json` (`id`, `gameId: 432`, `name`),
  un seul niveau (pas de dossier dans un dossier). Chaque profil y est rattaché par le champ `groupId` de son
  `minecraftinstance.json` (absent = hors dossier). Sur ce PC : 4 dossiers (`~LMA~`, `Tests`, `Originals_modpacks`,
  `Public ModPacks`), 31 profils. `MinecraftGameInstance.json` (26 Mo) est l'index de CurseForge : ne pas y écrire.
- **Profils** : `minecraftinstance.json` donne la version du jeu, le chargeur (`baseModLoader.name`), les mods, packs de
  textures et shaders installés par CurseForge (`installedAddons`, avec projet et fichier CurseForge), et `projectID`
  (≠ 0 : modpack public installé depuis CurseForge, par exemple ATM10 ; 0 : profil personnel).
- **API de lecture CurseForge** (`api.curseforge.com`, en-tête `x-api-key`) : clé à demander dans la console
  CurseForge for Studios, formulaire relu par Overwolf en quelques jours. Une clé personnelle relève des conditions
  « CF Core » ; une clé ne doit jamais être livrée dans l'app (les récepteurs n'en ont pas besoin).
- **API de mise en ligne CurseForge** : `POST https://minecraft.curseforge.com/api/projects/{id}/upload-file`
  (multipart : `metadata` JSON + `file`), jeton d'auteur créé sur `authors.curseforge.com` (en-tête `X-Api-Token`).
  `metadata` : `changelog`, `changelogType` (`markdown` possible), `displayName`, `gameVersions`, `releaseType`
  (`alpha` / `beta` / `release`), `isMarkedForManualRelease`, `parentFileID` (pack serveur). Utilisée pour des modpacks
  par des outils publics. **Limites** : le projet doit déjà exister (création à la main sur le site, une fois par
  modpack), et chaque fichier passe par la **modération** de CurseForge avant d'être visible.
- **Format d'un modpack CurseForge** : zip avec `manifest.json` (`manifestType: minecraftModpack`, `files` =
  `projectID` + `fileID` de chaque mod) et un dossier `overrides` (configs, scripts, textures…). Les mods hébergés sur
  CurseForge sont référencés, pas inclus. C'est un autre format que le zip publié sur GitHub (dossier d'instance complet).
- **Claude** : la règle d'Anthropic interdit à une application de proposer la connexion claude.ai ou de faire passer
  ses requêtes par l'abonnement de ses utilisateurs (Agent SDK compris : clé d'API obligatoire). L'usage local de
  Claude Code par le publieur sur son propre PC n'est pas concerné. D'où le choix ci-dessous : **l'app n'embarque pas
  Claude, elle expose des commandes, et le Claude Code du publieur les pilote.**
- **Tests du jeu** : un serveur dédié se lance sans compte ni écran (Fabric, Forge et NeoForge ont des installeurs de
  serveur en ligne de commande). Pour le client, des lanceurs en ligne de commande existent (HeadlessMc, conçu pour la
  CI, prend en charge Fabric / Forge / NeoForge, mais demande un compte Minecraft valide) : à valider par un essai.

## Architecture cible

```
src/core/                 moteur, Node pur (aujourd'hui src/main/studio/ + une partie de src/main/)
  commands/               une commande par fichier : nom, description, paramètres (schéma), résultat JSON
  curseforge/             profils et dossiers (lecture), API de lecture, API de mise en ligne, export du format CF
  packs/                  registre des modpacks (pack.json v2), versions, réglages
  updates/                recherche des mises à jour, plan, copie d'essai, application
  tests/                  vérifications statiques, serveur dédié, client
  publish/                GitHub (existant) et CurseForge
  lock.ts                 verrou entre processus (fichier dans le dossier des modpacks)
  journal.ts              historique des opérations (JSON lignes), lu par l'interface et par Claude
src/cli/                  `mpm` : lit le registre des commandes, sortie lisible ou `--json`
src/mcp/                  serveur MCP (stdio) : les mêmes commandes exposées comme outils
src/main/                 Electron : fenêtre, IPC (appelle les commandes), mises à jour de l'app
.claude/skills/modpacks/  la méthode de Claude : quand lancer quoi, comment lire un échec, ce qu'il ne fait jamais
```

- **Registre de commandes** : chaque commande déclare ses paramètres avec un schéma (zod, déjà requis par le SDK MCP)
  et indique si elle modifie quelque chose. La ligne de commande, le serveur MCP, l'IPC et la documentation des
  commandes en sont **générés** : ajouter une commande = un fichier.
- **`mpm` dans l'app installée** : l'exécutable de l'app lancé en mode Node (`ELECTRON_RUN_AS_NODE=1`) sur le point
  d'entrée `out/cli`, via un petit `mpm.cmd` posé par l'installeur. Il marche app fermée (indispensable pour les
  tâches planifiées) et depuis le dépôt (`npm run mpm -- …`). `mpm mcp` démarre le serveur MCP ; un bouton des
  paramètres l'enregistre dans Claude Code (`claude mcp add modpack-manager -- mpm.cmd mcp`).
- **Verrou entre processus** : le verrou actuel du studio n'existe que dans le processus. Il devient un fichier
  (`.modpack-manager.lock` : pid, opération, heure) pris par toute commande qui modifie, libéré même en cas d'erreur,
  ignoré s'il est périmé (processus mort). L'app surveille déjà le dossier : elle affiche « Opération en cours
  (ligne de commande) » et se met à jour d'elle-même.
- **Journal** : chaque opération écrit son début, ses étapes et son résultat. L'interface en tire l'historique d'un
  modpack ; Claude le lit pour savoir ce qui s'est passé lors d'un passage automatique.
- **Tests du dépôt** : le dépôt n'a pas de tests intégrés (ils sont faits à part avec tsx). Un moteur de cette taille
  en a besoin : `npm test` (`node:test` + tsx), lancé par `npm run build` et par la CI. Faux serveurs GitHub et
  CurseForge dans `test/`.

### Modpack (pack.json v2)

Le `pack.json` du dossier des modpacks reste la fiche d'un modpack, et gagne :

| Champ | Rôle |
|---|---|
| `profile` | Le profil CurseForge source (`guid` de `minecraftinstance.json`, et son dossier en secours). |
| `targets` | `github` (oui / non) et `curseforge` (`projectId`, ou absent). |
| `updates.frequency` | `weekly`, `biweekly`, `monthly`, `manual` (seulement à la demande) ou `never`. |
| `updates.scope` | Ce qui est mis à jour : mods, packs de textures, shaders. |
| `updates.channel` | Versions acceptées : `release` seulement, ou aussi `beta`. |
| `updates.pinned` | Projets à ne jamais mettre à jour (mod figé volontairement). |
| `updates.autoPublish` | Publier seul si tous les tests passent, ou laisser la version « prête, à valider ». |

Le numéro de version `vN` reste unique et commun aux deux cibles : la v12 GitHub et la v12 CurseForge sont la même
version. Lecture des anciens `pack.json` sans conversion (champs absents = comportement d'aujourd'hui).

## Phases

### Phase 1 — Modpack Manager et nouveau logo (version 1.1.0)

**État : faite le 2026-10-11, pas encore publiée.** Mise à jour 1.0.5 → 1.1.0 testée sous l'identité de test (mise à
jour silencieuse, même exécutable, registre, menu Démarrer, raccourci du bureau renommé, réglages gardés,
désinstallation propre).

Le logo est en place (`build/icon.png`, seule source du logo). Renommer sans casser la mise à jour des installations existantes :

- `productName`, `shortcutName`, `artifactName`, titres, textes de l'interface, docs, `CHANGELOG.md` (titre), relais
  (mails) : « Modpack Manager ».
- **Garder les noms internes** : `appId`, nom du paquet (dossier d'installation), nom de l'exécutable
  (`Modpack Downloader.exe`, par `executableName` : l'installeur de la 1.0.5 et celui de la 1.1.0 repèrent l'app
  ouverte et l'installation existante à ce nom, et les épingles de la barre des tâches pointent vers lui), dossier de
  données (`%APPDATA%\Modpack Downloader`, fixé par l'app au lieu de suivre `productName`), marqueur des profils,
  dossiers temporaires. La 1.0.5 se met ainsi à jour sur place, sans rien perdre.
- **Raccourcis** : celui du menu Démarrer est refait par l'installeur sous le nouveau nom. Celui du bureau, créé par
  l'app, est renommé par l'app au lancement (`shortcut.ts`) ; la désinstallation retire les deux noms.
- Dépôt GitHub : **ne pas le renommer** dans cette phase. Les apps 1.0.x lisent leurs mises à jour à l'adresse
  actuelle ; un renommage se teste à part (redirections de l'API GitHub), plus tard si besoin.
- Test de bout en bout avec les deux installeurs sous l'identité de test (voir CLAUDE.md) : 1.0.5 → 1.1.0, réglages,
  jeton et raccourci gardés.

### Phase 2 — Le moteur et les commandes (1.2.0)

Aucune nouveauté visible pour les récepteurs ; c'est la fondation de tout le reste.

**État : faite le 2026-10-11, pas encore publiée.** 21 commandes (`src/core/commands/`), `mpm` et `mpm.cmd`, serveur
MCP, bouton « Connecter » (Paramètres → Claude Code et terminal), verrou entre processus, journal, `npm test` (20
tests, dont le serveur MCP piloté par un vrai client). Vérifié sur l'app compilée : `mpm.cmd` et le serveur MCP lisent
le vrai dossier des modpacks et GitHub.

Deux choix en cours de route :

- **L'IPC du studio ne passe pas par les commandes** : fenêtre et commandes appellent le même `StudioService`, où vivent
  la logique, le verrou et le journal. Les commandes restent une couche fine (paramètres, résolution d'un modpack par
  son nom, affichage) ; les faire traverser par l'IPC aurait réécrit l'interface sans rien gagner.
- **Pas de skill dans le dépôt** : la méthode de travail de Claude est dans les instructions du serveur MCP
  (`src/mcp/instructions.ts`), livrées avec l'application installée, donc valables hors du dépôt.

1. `npm test` et les premiers tests sur le code existant (rangement, plan de publication, choix du joueur).
2. Déplacer `src/main/studio/` (déjà en Node pur) vers `src/core/`, sans changer son comportement.
3. Registre de commandes, verrou entre processus, journal.
4. `mpm` avec les opérations d'aujourd'hui. Sortie `--json` stable.
5. Serveur MCP, page `docs/commandes.md` (remplace `ligne-de-commande.md` ; un test vérifie qu'elle cite chaque
   commande).

**Terminé quand** : dans une session Claude Code, Claude liste les modpacks, crée une version depuis un profil et la
publie sur GitHub uniquement par des commandes, pendant que l'app ouverte suit en direct. (À confirmer par le
propriétaire une fois la 1.2.0 installée et connectée.)

### Phase 3 — La vue publieur : profils CurseForge (1.3.0)

- Nouvelle vue « Modpacks » (remplace la vue Studio centrée sur les zips) : arborescence **dossiers CurseForge →
  profils**, plus « Sans dossier ». Les modpacks publics installés depuis CurseForge (`projectID` ≠ 0) sont rangés à
  part ou masqués (filtre).
- Sur chaque profil : modpack lié ou non ; dernière version publiée sur GitHub et sur CurseForge ; écart avec le profil
  (empreinte des mods, déjà calculée par `modsSignature.ts`) ; fréquence de mise à jour ; prochain passage.
- Actions : **créer un modpack** depuis un profil, **lier / délier**, **nouvelle version**, **réglages** (ceux d'aujourd'hui
  plus cibles et mises à jour), **supprimer** (releases et/ou fiche ; le profil CurseForge n'est jamais supprimé par
  l'app, à confirmer).
- Les zips du dossier des modpacks deviennent des fichiers produits (toujours gardés : ce sont les versions publiées),
  plus le point de départ de l'interface.
- Lecture seule de `groups.json` et de l'index de CurseForge.

### Phase 4 — Mises à jour des mods, packs de textures et shaders (1.4.0)

- Clé de l'API CurseForge du publieur, saisie dans les paramètres et chiffrée comme le jeton GitHub (DPAPI). Sans clé,
  la fonction est expliquée et désactivée.
- `updates check <pack>` : pour chaque élément de `installedAddons`, dernier fichier compatible (version du jeu,
  chargeur, canal), nouvelles dépendances requises, conflits déclarés. Fichiers posés à la main : reconnus par leur
  empreinte CurseForge si possible, sinon « non suivi ». Résultat : un **plan** lisible (avant / après, liens des
  changelogs, avertissements : changement de version majeure, dépendance ajoutée, mod retiré de CurseForge).
- `updates apply <pack> --trial` : **copie d'essai** du profil (`<nom> (essai)`, dans un dossier CurseForge « Essais »
  pour que le publieur puisse aussi y jouer après relance de CurseForge), téléchargement, vérification SHA-1, mise à
  jour de `installedAddons` au format exact de CurseForge (à relever sur de vrais profils avant d'écrire : c'est le
  point le plus fragile).
- `updates promote <pack>` : reporte la copie d'essai validée dans le profil d'origine (en gardant mondes et réglages
  du publieur, comme le fait déjà l'installeur pour les joueurs), puis supprime l'essai.
- Interface : plan de mise à jour à cocher (tout, rien, mod par mod), « Mettre à jour maintenant ».
- La montée de version de Minecraft (1.20.1 → 1.21.1) est hors du périmètre automatique : à la demande, avec Claude.

### Phase 5 — Tests avant publication (1.5.0)

Trois niveaux, chacun avec son rapport (réussi / échoué, durée, extrait des journaux du jeu) :

1. **Vérifications** (secondes) : dépendances présentes, un seul fichier par mod, versions du jeu et du chargeur
   cohérentes, fichiers exclus absents.
2. **Serveur dédié** (minutes, sans écran ni compte) : installe le serveur du chargeur dans un dossier de cache, copie
   les mods (sans ceux qui sont réservés au client), lance jusqu'à « Done » ou jusqu'au crash. Détecte la plupart des
   incompatibilités entre mods.
3. **Client** (minutes) : lance le jeu sur la copie d'essai, crée un monde (`--quickPlaySingleplayer`), attend que le
   joueur soit dans le monde, quitte. Demande le compte Minecraft du publieur et ouvre une fenêtre de jeu. Faisabilité
   à prouver en début de phase (HeadlessMc ou lanceur maison, réutilisation des fichiers du jeu déjà téléchargés par
   CurseForge).

Menu « Tester » dans l'interface : lancer chaque niveau, lire les rapports, **ouvrir la copie d'essai dans CurseForge**
pour y jouer soi-même. En cas d'échec, Claude reçoit le rapport et propose (ou applique, en mode automatique) une
correction : revenir en arrière sur le mod en cause, en retenir un autre, figer un mod (`pinned`), puis relancer.

### Phase 6 — Publication sur CurseForge (1.6.0)

- Cibles par modpack : GitHub, CurseForge, ou les deux ; tableau des versions avec leur état sur chaque cible.
- `export curseforge` : zip au format CurseForge (`manifest.json` + `overrides`, mods de CurseForge référencés, pas
  inclus). Un mod qui n'est pas sur CurseForge bloque l'export (à retirer, ou à garder seulement pour GitHub).
- `publish --target curseforge` : jeton d'auteur (chiffré), mise en ligne par l'API, notes de version en Markdown,
  `releaseType` choisi. Suivi de la **modération** (en revue, approuvée, refusée) affiché sur la version.
- Hors d'atteinte de l'automatisation : créer le projet sur le site (une fois par modpack, à la main ; l'app guide et
  demande ensuite l'identifiant du projet), et la modération elle-même.
- Solution de repli si l'API refuse les modpacks : l'app prépare tout (zip, notes, nom affiché) et ouvre la page de
  mise en ligne ; le publieur n'a plus qu'à déposer le fichier.

### Phase 7 — Mise à jour automatique (1.7.0)

- **Une seule tâche planifiée Windows** (quotidienne, créée et retirée par l'app, option « réveiller le PC ») lance
  `mpm maintenance --due` : les modpacks dont le tour est venu, selon `updates.frequency`.
- Pour chacun : recherche → s'il y a du nouveau, copie d'essai → tests → selon `autoPublish` : publication sur les
  cibles, ou version « prête, à valider » (notification Windows, et mail par le relais si le propriétaire le souhaite).
- **Claude dans la boucle** : la tâche appelle Claude Code en mode non interactif (`claude -p`, avec la skill) quand il
  y a besoin de jugement (test échoué, changement de version majeure, notes de version à rédiger). Ses droits sont
  limités aux commandes `mpm` (outils MCP), sans accès libre au système. Sa session est gardée dans le journal.
- **Claude à la demande** : dans une session Claude Code, « mets à jour tous mes modpacks », « pourquoi la v14 de X
  plante ? »… passent par les mêmes commandes.
- Le PC doit être allumé (ou réveillable) au moment du passage : tout se fait en local, car la source de vérité est
  le profil CurseForge du publieur.

### Transversal, à chaque phase

Docs (`docs/`, une page par fonction, sommaire), `CHANGELOG.md`, CLAUDE.md (architecture, faits CurseForge), tests,
compatibilité des récepteurs (ils ne voient que la Bibliothèque : chaque version doit rester lisible par les apps
installées, comme pour `MANIFEST_FIELDS` aujourd'hui).

## Risques principaux

| Risque | Parade |
|---|---|
| Format interne de CurseForge (`installedAddons`) non documenté, peut changer | Le relever sur de vrais profils, n'écrire que dans des copies d'essai, tests sur des profils copiés. |
| Clé de l'API CurseForge refusée ou lente à obtenir | La demander dès maintenant. Les phases 1 à 3 n'en ont pas besoin. |
| Modération CurseForge (délais, refus) | Suivi de l'état dans l'app ; GitHub reste immédiat. |
| Test du client sans intervention (compte, fenêtre, durée) | Le niveau serveur couvre l'essentiel en automatique ; le client peut rester un test lancé à la main. |
| CurseForge ne voit un nouveau profil qu'après redémarrage | Déjà géré : proposer « Relancer CurseForge ». |
| Coût et limites de Claude en mode automatique | Claude n'est appelé qu'en cas de besoin, pas à chaque passage. |
