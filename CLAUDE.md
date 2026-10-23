# CLAUDE.md

Le projet s'appelle **Modpack Manager** (Modpack Downloader jusqu'à la 1.0.5).

Application Windows (Electron) qui affiche les modpacks Minecraft publiés en releases sur
`WolfGang-PRoxa/minecraft-modpack-manager` et les installe directement comme profils CurseForge.
Une seule fenêtre, deux vues : la **Bibliothèque** (installer les modpacks) et le **Studio** (ranger ses zips et
publier les releases), réservé aux publieurs. Au premier lancement, l'utilisateur choisit son rôle : **récepteur** (par
défaut) ou **publieur** (dépôt GitHub + compte qui a le droit d'y publier). Changer de rôle change la vue, jamais de
fenêtre ni de processus. Interface et messages en français.

## Règles git — impératif

- **Aucune attribution à Claude** dans les commits, PR, tags ou fichiers : pas de ligne `Co-Authored-By`, pas de
  « Generated with Claude Code », pas de Claude parmi les contributeurs ou les auteurs. L'auteur des commits est celui
  de la config git locale. Nommer Claude comme **fonction** de l'application (gestion des modpacks par Claude Code,
  skill, commandes, interface, docs) est permis.
- Messages de commit en français, au format conventionnel (`feat: …`, `fix: …`, `docs: …`).
- Ne pas créer de release ni pousser de tag sans demande explicite (un tag `app-v*` déclenche la CI).
- Tout commit `feat`, `fix` ou `perf` visible des utilisateurs ajoute son entrée dans la section `## [Non publié]` de
  `CHANGELOG.md` (rubriques `Ajouts`, `Améliorations`, `Corrections`, `Sécurité`, `Suppressions`), **dans le même
  commit**, écrite pour les utilisateurs en français. Un changement de comportement met aussi à jour la page de
  `docs/` qui le décrit (elle est affichée telle quelle dans l'aide de l'app).

## Commandes

```bash
npm run dev              # app en développement (HMR)
npm run typecheck        # tsc sur main/preload/scripts puis sur le renderer
npm run docs:verifier    # docs/ (sommaire, titres, liens, ancres, pas de HTML) et format de CHANGELOG.md
npm test                 # tests (test/*.test.ts, node:test + tsx) : moteur, commandes, serveur MCP, faux GitHub
npm run build            # typecheck + docs:verifier + test + build electron-vite dans out/ (index.js et cli.js)
npm run changelog        # « Non publié » et commits feat/fix/perf depuis le dernier tag app-v*, mentionnés ou non
npm run changelog -- --brouillon       # ajoute à « Non publié » une entrée par commit non mentionné
npm run changelog -- --version 1.2.0   # « Non publié » → 1.2.0 datée du jour, package(-lock).json en 1.2.0 (ni commit ni tag)
npm run changelog -- --notes 1.2.0     # texte de la release GitHub (--sortie <fichier>), utilisé par la CI
npm run build:win        # build + images de l'installeur + installeur NSIS dans dist/
npm run studio           # app en développement, ouverte sur la vue Studio (--studio)
npm run mpm -- <commande> # commandes du moteur (sans argument : la liste ; --json, --yes, --dir, --repo)
npm run mpm -- mcp       # serveur MCP (stdio) pour Claude Code
npm run modpacks:ranger  # = mpm ranger : aperçu, confirmation, numérotation des zips déposés
npm run modpacks:publier # = mpm publier : aperçu, confirmation, publication
npx tsx scripts/generate-installer-images.ts   # build/installer/logo-<n>.bmp depuis build/icon.png (non versionné, fait par build:win)
```

## Architecture

- `src/main/` — processus principal Electron (un seul, une seule fenêtre). Le métier est dans `src/core/`.
  - `index.ts` : verrou d'instance, protocole `studio-media:` déclaré avant `ready`, IPC de l'app puis du studio.
    Relancée pendant qu'elle tourne (`second-instance`, éventuellement avec `--studio`) → `app:activated`.
  - `windowState.ts` : fenêtre ouverte agrandie (barre des tâches visible), plein écran par F11 qui ramène à la taille
    d'avant ; le bouton de la barre de titre agrandit / ramène au niveau inférieur (canaux `window:*`).
  - `github.ts` : lecture des releases du dépôt suivi (cache ETag sur disque, mode hors ligne), `modpack.json` via
    l'URL publique (hors quota API), mises à jour de l'app toujours lues dans `APP_REPO` (tags `app-v*`) :
    `findAppUpdate` ne propose qu'une release dont l'installeur `.exe` est en ligne.
  - `installer.ts` : téléchargement → vérif SHA-256 → extraction dans un dossier de travail sur le même disque
    que `Instances` → basculement par renommage. Mise à jour sur place en conservant les données du joueur
    (`PLAYER_DATA`) et ses champs de `minecraftinstance.json` (`PRESERVED_INSTANCE_FIELDS`). `minecraftinstance.json`
    n'entre dans l'instance qu'une fois le dossier en place, puis il est réécrit (`placeInstanceFile`) : voir « Faits
    CurseForge ». `InstallResult.curseForgeRunning` fait proposer « Relancer CurseForge » au lieu de l'ouvrir.
    Les choix du joueur passent ensuite par `playerChoices.ts` : à l'installation, le marqueur note ce que fournit la
    version (`configFiles` : SHA-1 de chaque fichier de `config/` ; `disabledByDefault` : mods installés désactivés,
    clés de `modKey`) ; à la mise à jour, ce qui s'en écarte vient du joueur. `carryOverConfigs` (seulement si
    `keepPlayerConfigs`) garde ses fichiers de config modifiés (marqueur sans empreintes : date du fichier après
    `installedAt`) ; `applyModStates` désactive les mods demandés par le publieur (`disabledMods`) puis rend à chaque
    mod l'état que le joueur lui avait donné. `InstallResult.keptConfigs` est annoncé dans la notification.
  - `shortcut.ts` : raccourci `.lnk` de l'app (bureau ou emplacement choisi). Non packagée : cible
    `electron.exe "<projet>"` et icône `.ico` générée depuis `build/icon.png`.
  - `appUpdate.ts` : mise à jour de l'app. `installAppUpdate` relit lui-même les releases (rien ne vient de la
    fenêtre), télécharge l'installeur dans `%TEMP%\modpack-manager`, compare son SHA-256 au `digest` publié par
    GitHub, le lance détaché avec `--updated` puis quitte ; l'installeur relance l'app avec `--updated`.
    Refusée pendant une installation de modpack ou une opération du studio (`busyWith`) ; à l'inverse, tant qu'elle
    est en cours (`appUpdateTask`), `install:start` et le verrou du studio (`blockedBy`) refusent de démarrer.
    `noteRunningVersion` (réglage `lastRunVersion`) dit au lancement si l'app vient d'être mise à jour, et depuis
    quelle version (`LaunchInfo.previousVersion` : la page Nouveautés marque « Nouveau » ce qui a été reçu depuis).
    `AppUpdateInfo.releases` porte le texte de chaque release `app-v*` plus récente que l'app, jusqu'à celle proposée.
  - `report.ts` : signalement d'un problème (canaux `report:*`). Issue créée sur `APP_REPO` avec le compte GitHub
    connecté (`resolveCredential`) ; sans compte, ou si GitHub refuse, la page « nouvelle issue » s'ouvre préremplie
    dans le navigateur. Le corps (`src/shared/report.ts`) est du Markdown simple, lisible tel quel dans un mail ; les
    informations techniques jointes ne contiennent ni chemin ni nom de compte.
  - `maintenance.ts` : `--maintenance` (tâche planifiée) : `index.ts` ne prend pas le verrou d'instance, garde les
    réglages de l'app mais met les données de Chromium dans `userData\maintenance-session`, lance
    `runScheduledMaintenance` (publieur seulement ; passages `due` ; Claude pour les échecs si `maintenanceClaude` ;
    notification, un clic lance l'app avec `--studio`) puis quitte. Canaux `maintenance:*` de la vue Studio ;
    `maintenanceTask` fait attendre la mise à jour de l'app. Interface : `studio/MaintenancePanel.tsx` (`UpdatesLine`
    sur la carte, essai à valider, `UpdatesDialog`), `studio/maintenanceStore.ts`, `MaintenanceSetting` (Paramètres).
  - `claudeCode.ts` : connexion à Claude Code (canaux `claude:*`, Paramètres → Claude Code et terminal) : `claude mcp
    add --scope user modpack-manager --env ELECTRON_RUN_AS_NODE=1 -- <exécutable> <app.asar>/out/main/cli.js mcp`
    (`claude.exe` natif de `~/.local/bin`, sinon `where claude`, `.cmd` par cmd.exe). « Connecté » = `claude mcp get`
    cite le cli.js de cette installation. `askClaude` : `claude -p` (demande par stdin), `--strict-mcp-config` avec
    le seul serveur MCP de cette installation, `--tools ""`, `--allowedTools` donnés, `--permission-mode dontAsk`.
  - `studioIpc.ts` : canaux `studio:*` (appellent `StudioService`), images via `studio-media://cover/`, surveillance du
    dossier des modpacks (un changement fait par `mpm` ou Claude rafraîchit la vue). `studioTask` compte aussi
    l'opération d'un autre processus (verrou partagé) : la mise à jour de l'app l'attend.
  - `download.ts`, `ipc.ts`, `authIpc.ts` (canaux `auth:*`), `roleIpc.ts` (canaux `role:*`). `openFolder.ts` :
    `shell:openPath` et `studio:openPath` n'ouvrent qu'un dossier existant (un fichier serait lancé). `index.ts`
    refuse toute permission à la page sauf `clipboard-sanitized-write` (`restrictPermissions`).
  - Empreintes obligatoires : `installer.ts` refuse un modpack sans `archiveSha256` (celle de `modpack.json`, sinon
    le `digest` GitHub du zip : `sha256FromDigest`, shared/releases), `appUpdate.ts` une mise à jour sans `digest`,
    `addonFiles.ts` un fichier CurseForge sans SHA-1 (`skipped`), `serverInstall.ts` un installeur Forge / NeoForge
    qui ne correspond pas à son `<url>.sha256`.
- `src/core/` — le moteur, Node pur : **jamais d'import d'Electron** (test `architecture`). Réutilisé par la fenêtre,
  `mpm` et le serveur MCP.
  - `playerChoices.ts` et `instanceAddons.ts` (Node pur, testables avec tsx) : reprise des choix du joueur ; lecture
    et écriture de l'état des mods dans `installedAddons` (projet CurseForge par fichier, `setAddonEnabled`).
  - `curseforge.ts` : détection (protocole `curseforge://` dans `HKCR`, puis chemins connus Overwolf/autonome),
    lancement, dossier `Instances` (réglage > logs CurseForge > défaut), détection de Minecraft lancé, relance
    (`restartCurseForge`, canal `curseforge:restart` : ses processus fermés poliment puis de force, jamais Overwolf,
    Minecraft ni ce qui tourne depuis le dossier du jeu ; refusée si Minecraft tourne). Dans Overwolf récent,
    CurseForge n'a pas d'exécutable à lui : c'est la page `OverwolfBrowser.exe … --uid=<uid>` (`matchCurseForgeProcess`
    lit la ligne de commande), qui charge `Curse.Plugin.dll` (surveillance et lecture des profils) ; sa fenêtre
    appartient à `Overwolf.exe`. Elle est arrêtée de force, puis on vérifie qu'Overwolf ne l'a pas relancée.
  - `settings.ts` (Node pur, sans cache) : `settings.json` du `userData` — `role` (`null` = premier lancement),
    `repo`, `workspaceDir` (dossier des modpacks), `lastView` (vue rouverte au lancement), `lastRunVersion`…
    Lu aussi par les scripts (`%APPDATA%\Modpack Manager\settings.json`).
  - `auth.ts` : connexion GitHub partagée app / commandes. Jeton chiffré par DPAPI via PowerShell
    (`github-auth.json` à côté des réglages, relisible par les scripts). Ordre : connexion faite dans l'app >
    `GITHUB_TOKEN` > `.env` (scripts) > `gh auth token`. Vérifie le droit de publier (`permissions.push`) et gère la
    connexion par code (device flow, `GITHUB_OAUTH_CLIENT_ID`).
  - `githubEnv.ts` : base de l'API d'un dépôt ; `MPD_GITHUB_API` la remplace pour tous les dépôts en test.
  - `modsSignature.ts` (Node pur) : empreinte des mods d'une instance (nom et taille de chaque `.jar` posé dans
    `mods`), calculée à l'identique pour un zip (`analyze.ts`) et pour un profil CurseForge (`profiles.ts`,
    `listProfiles`, canal `curseforge:profiles`). Relu à chaque fois : ~30 ms pour 29 profils et 2 800 mods.
  - `profiles.ts` : seule lecture des profils (`listProfiles`, `readProfile` : nom du dossier, `guid`, `groupId`,
    version, chargeur, mods actifs et leur empreinte, `projectID` → `curseforgeProjectId`, marqueur de l'app →
    `installedPack`), champs de `minecraftinstance.json` gardés en cache tant que date et taille ne changent pas (le
    fichier d'ATM10 pèse 3 Mo). `listGroups` : dossiers de CurseForge (`groups.json`, Minecraft seulement). Lecture
    seule : l'app n'écrit jamais dans les profils ni dans les fichiers de CurseForge.
  - `zip.ts` (yauzl, protection zip-slip, accepte un zip avec dossier racine), `fsutil.ts`, `powershell.ts`
    (`powershell` : script sans fenêtre, données par stdin ; `moveToRecycleBin` ; `protectSecret` / `unprotectSecret` :
    DPAPI, partagés par `auth.ts` et `curseforgeAuth.ts`).
  - `curseforgeAuth.ts` : clé de l'API CurseForge (`apiKey`, en-tête `x-api-key`, vérifiée par `GET /v1/games/432`)
    et jeton d'auteur (`uploadToken`, en-tête `X-Api-Token`, vérifié par `GET minecraft.curseforge.com/api/game/versions` ;
    `/game/version-types` répond 504 à un jeton invalide). 403 = refusé. `curseforge-auth.json` à côté des réglages,
    chiffré ; ordre : enregistré > `CURSEFORGE_API_KEY` / `CURSEFORGE_UPLOAD_TOKEN` > `.env`. Enregistrés seulement
    par la fenêtre (Paramètres → Compte CurseForge, canaux `cfauth:*`), après vérification ; aucune commande ne les
    reçoit ni ne les affiche (`curseforge status` dit seulement s'ils sont acceptés). `MPD_CURSEFORGE_API` remplace
    les deux API en test (`setCurseForgeApiOverride`, ignoré une fois packagé).
  - `curseforgeApi.ts` (`CurseForgeClient`, clé du publieur) : `POST /v1/mods` (projets, `latestFilesIndexes` :
    dernier fichier par version de Minecraft, chargeur et type de version), `POST /v1/mods/files`, changelog (HTML).
    Énumérations : chargeur Forge 1, Fabric 4, Quilt 5, NeoForge 6 ; release 1, beta 2, alpha 3 ; dépendance
    obligatoire 3 ; catégories mod 6, pack de textures 12, shader 6552 ; hash sha1 1, md5 2.
  - `curseforgeExport.ts` : export au format CurseForge depuis le zip d'une version (`manifest.json` : `minecraft`
    (`modLoaders` : `manifestLoaderId`, sans la version de Minecraft que CurseForge ajoute à Fabric), `manifestType`,
    `manifestVersion` 1, `name`, `author: ''`, `files` (`projectID`, `fileID`, `required` = mod actif), `overrides`,
    `image` ; `modlist.html` ; `overrides/` choisis), refusé si un mod de `mods` n'a pas d'entrée CurseForge.
    `curseforgeUpload.ts` (`CurseForgeUploader`, jeton d'auteur) : `gameVersionIds` (la version dont le type a un slug
    `minecraft-…`, plus le chargeur : type `modloader`), `upload` (multipart `metadata` + `file`), `FILE_STATUS_LABELS`.
  - `trialProfile.ts` (`createTrialCopy` : copie à côté de l'original, sans journaux ni marqueur, nouvelle identité,
    chemins réécrits, jamais lancée) et `addonFiles.ts` (`replaceAddonFile` : téléchargement avec `x-api-key`, SHA-1
    vérifié avant d'apparaître, ancien fichier retiré, entrée réécrite par `installedFileFrom` ; un mod désactivé le
    reste ; un fichier sans `downloadUrl` est refusé : son auteur interdit le téléchargement hors de CurseForge).
  - `trialUpdates.ts` : `applyToTrial` (copie `<profil> (essai)` + mises à jour choisies ; refusé si un essai existe ;
    sans `downloadUrl` → `skipped`) et `promoteTrial` (reporte dans l'original les entrées dont le fichier diffère :
    fichier copié depuis l'essai, état actif / désactivé de l'original gardé, entrée ajoutée avec le guid de
    l'original ; tout ou rien : copies dans `<essai>/.report-en-cours`, puis renommages réessayés avec anciens
    fichiers mis de côté et `journal.json` écrit avant chaque déplacement, `minecraftinstance.json` en dernier ; un
    échec défait tout, un report interrompu est défait au report suivant). Service : `checkUpdates`, `applyUpdatesToTrial`, `promoteTrial` (dans `withCurseForgeClosed` de
    `curseforge.ts` : fermé, écrit, rouvert ; refusé si Minecraft tourne depuis le profil ou l'essai ; essai à la
    corbeille), `discardTrial`. `TRIAL_PROFILE_SUFFIX` (shared/config) ; `library.ts` marque `trialPath` / `trialOf`,
    et une copie d'essai n'est jamais prise pour la source d'un modpack.
  - `gameTests/` : tests d'un profil. `modMetadata.ts` (`readModJar` : `fabric.mod.json` / `quilt.mod.json`,
    `META-INF/mods.toml`, `META-INF/neoforge.mods.toml` ; jar-in-jar Fabric (`jars`, `provides`) et Forge
    (`META-INF/jarjar/*.jar` et chemins de `META-INF/jarjar/metadata.json`, souvent `META-INF/jars/`) ; `FMLModType` du
    manifeste = bibliothèque ; jar multi-chargeurs lu selon le chargeur précis du profil (`LoaderPreference` : Forge lit
    `mods.toml`, NeoForge `neoforge.mods.toml`) ; `relations` : `required` / `breaks` (Fabric `breaks`, Forge
    `incompatible`) / `conflicts` (`conflicts`, `discouraged`) avec leurs versions ; `${file.jarVersion}` lu dans
    `Implementation-Version` ; `parseToml` minimal). `versions.ts` (prédicats Fabric ; portage de `ComparableVersion`
    de Maven 3.8 et plages Maven pour Forge et NeoForge ; null dans le doute). `staticChecks.ts` (`checkProfileFiles` :
    jars ignorés par le chargeur (autre chargeur, NeoForge seul dans Forge, Forge seul dans NeoForge ≥ 1.20.5) =
    avertissement et écartés des autres vérifications ; doublons, dépendances absentes, `versionFindings` (jeu, chargeur,
    autres mods ; Forge accepte une version voisine du jeu : 1.20 sur 1.20.1 ; un mod présent dans deux jars ou fourni
    par un autre, comme Indium par Sodium, n'est pas vérifié) ; mods du client = `environment: client`,
    `clientSideOnly`, ou fichier CurseForge « Client » sans « Server »). Vérifié sur les 29 profils du propriétaire
    (2 786 mods, le 2026-10-19) : aucun faux positif. `java.ts` (Java de la version : `Install/versions/<v>/<v>.json`
    `javaVersion`, puis `Install/java/<component>`, puis JDK installés). `serverInstall.ts` (cache par chargeur dans
    `%LOCALAPPDATA%\Modpack Manager\test-servers` : lanceur Fabric de meta.fabricmc.net, installeurs Forge / NeoForge
    `--installServer`, puis `@libraries/.../win_args.txt`). `serverTest.ts` (copie mods sans ceux du client + dossiers
    de configuration, `eula.txt`, `server.properties` sur un port libre, hors ligne, sans liste blanche (Minecraft 26
    l'active), attente de « Done (…s)! », `whileRunning` puis `stop` ; sinon rapport de plantage). `logIssues.ts`
    (`LogIssueCollector` : lignes `ERROR` / `FATAL`, `WARN` qui parlent d'un échec, exception qui suit, clé sans les
    nombres ; `newIssues` compare deux tests). `clientLaunch.ts` (`clientArguments` : commande Java du jeu d'après
    `Install/versions/<id>.json` et ses `inheritsFrom`, règles du lanceur (`has_custom_resolution`,
    `is_quick_play_multiplayer`), bibliothèques dédoublonnées (celle du chargeur d'abord), jar de la version lancée,
    joueur hors ligne (`offlineUuid`), `--quickPlayMultiplayer` sinon `--server`/`--port` ; `profileVersionId` : `id` de
    `baseModLoader.versionJson`). `playerTest.ts` (`runPlayerTest` : serveur, puis clients `Testeur1`… dans
    `%LOCALAPPDATA%\Modpack Manager\test-clients\<nom>` (mods en liens durs, configurations, `options.txt` allégé, sans
    shaders), connexion lue dans le journal du serveur (« joined the game », « lost connection » avec ou sans adresse),
    échec du chargement lu dans celui du client (Forge et Fabric affichent une fenêtre et attendent), `gamemode`,
    `time set midnight`, `spreadplayers`, puis fin ; `unavailable` si le jeu n'est pas installé ou la mémoire manque ;
    fenêtres passées derrière celles de l'utilisateur pendant le chargement (`sendWindowsToBack`) ; `stopProcessTrees`
    arrête aussi les Java orphelins lancés pendant le test, comme celui de Crash Assistant). Essayé le 2026-10-19 avec
    2 joueurs : Fabric 1.21.8 (86 s), Forge 1.20.1 79 mods (143 s), Fabric 26.3 (65 s). `reports.ts` : dernier rapport
    par profil et par sorte (`files`, `server`, `players`), chacun avec `modsSignature` : `reportsBySignature` retrouve
    les tests d'une version (mêmes mods), même faits sur un essai disparu ; `testVerdict` (shared) en fait le bilan
    `VersionView.tests`, rappelé par `annotatePlan` à la publication. Service : `checkProfile`, `testServer`,
    `testPlayers`, `testAll` (verrou), `lastTests`, `currentTests` ; commandes `tests check`, `tests server`,
    `tests players`, `tests all` ; interface `studio/ProfileTests.tsx` (`TestsPill` sur la ligne d'une version et dans
    la publication CurseForge).
  - `updates.ts` (`checkUpdates`, lecture seule) : pour chaque projet d'`installedAddons`, le fichier le plus récent
    (plus grand id) pour la même version de Minecraft et le même chargeur (`bestFileIndex` ; Quilt accepte Fabric ;
    pack de textures / shader dont le fichier installé ne cite pas la version : dernier fichier toutes versions), puis
    les dépendances obligatoires absentes (4 tours). Projets figés (`pinned`), canal `release` / `beta`. Les `.jar`
    inconnus d'`installedAddons` sont `untracked`, jamais touchés. Commandes `updates check` et `updates changelog`.
  - `lock.ts` (`OperationLock`) et `journal.ts` (`Journal`), créés par `operationTools(holder)` (`operations.ts`) à
    côté des réglages : `operation.lock` (création exclusive `wx` ; opération, `holder`, pid, jeton ; ignoré si le
    processus est mort ou au bout de 24 h) et `journal.jsonl` (une ligne par écriture : source, opération, résultat ;
    `journal.old.jsonl` au-delà de 512 Ko). `StudioService.exclusive` prend le verrou et journalise ; les petites
    écritures (fiche, réglages, notes, image) passent par `logged` (journal sans verrou).
- `src/core/studio/` — le Studio. `StudioService` (`service.ts`) est l'unique point d'entrée de la fenêtre et des
  commandes ; ses options injectent ce qui dépend de l'hôte (`trashItem`, `lock`, `journal`, `blockedBy`, `coverUrl`).
  - `workspace.ts` : lecture du dossier (un sous-dossier par modpack, `pack.json`, `cover.*`), rangement
    (`planRanger`/`applyRanger`). `pack.json` `type` (`ContentKind` de `shared/content.ts`, absent = modpack) : un
    type pas encore pris en charge (`supported: false`) est montré avec une erreur, sans analyse ni publication ;
    `requireModpack` refuse les opérations propres aux modpacks (profil source, zips, CurseForge, réglages, mises à
    jour), `buildLibrary` et la maintenance ne voient que les modpacks. `pack.json` porte aussi les réglages des versions (`exclude`, `disabledMods`,
    `keepPlayerConfigs`, écrits seulement s'ils servent ; `normalizePackSettings`).
  - `analyze.ts` : validation d'un zip (instance CurseForge, refus des exports `manifest.json`), SHA-256, empreinte
    des mods, liste des mods avec leur projet CurseForge (`CachedAnalysis.mods`, gardée dans le processus principal),
    cache `.studio-cache.json` (son numéro de `version` change quand l'analyse gagne un champ : 3 aujourd'hui).
  - `sync.ts` : `computePlan` (dossier ↔ releases `pack-*` : create / update / delete) et `applyPlan`. Le
    `modpack.json` de chaque version reçoit `disabledMods` (fichiers de cette version, résolus par `disabledFilesOf`
    d'après le projet CurseForge ou le nom du fichier) et `keepPlayerConfigs`, absents quand ils ne servent pas : les
    releases existantes ne sont pas renvoyées pour rien (`comparable` : absent = vide = faux).
  - `contents.ts` : contenu d'un zip pour la fenêtre « Contenu » (`ContentsDialog`) : fichiers depuis le dossier de
    l'instance, mods nommés d'après `installedAddons` de `minecraftinstance.json`, aperçu d'un fichier (texte coupé à
    256 Ko, image en `data:`, rien pour un binaire). Le service n'ouvre que des zips du dossier des modpacks.
  - `githubApi.ts` : client d'écriture (dépôt configuré), envois en streaming.
  - `archive.ts` : zip d'une instance (`DEFAULT_EXCLUSIONS` + exclusions du modpack ; `maxSize` : 2 Go seulement si
    le modpack est publié sur GitHub, comme `githubSizeError` à l'analyse), fichiers exclus trouvés dans
    un zip (`findExcludedInZip`) et réécriture sans eux (`stripExcludedFromZip`, une entrée à la fois),
    `service.ts` : orchestration, verrou et journal ; les zips qui partiront à la prochaine publication sont
    cherchés pour des fichiers exclus (`findExcluded`, mémorisé) : avertissement sur la ligne et dans le plan
    (`annotatePlan`). `settings.ts` : dossier des modpacks.
  - `library.ts` (`buildLibrary`, pur) : la vue du publieur (`PublisherLibrary`) : dossiers de CurseForge puis « Sans
    dossier », chaque profil face au modpack qui en vient (`pack.json` `profile` : guid, sinon nom ; à défaut deviné :
    mêmes mods qu'une version, sinon même nom ; jamais un profil `installedPack`) et son état (`unlinked`,
    `no-version`, `up-to-date`, `older`, `changed` : empreinte des mods comparée aux versions). Service :
    `library()`, `linkProfile`, `createPackFromProfile` (modpack + v1, un seul verrou) ; `zipInstance` enregistre le
    profil zippé comme source (`zipNextVersion`).
  - `curseforgePublish.ts` (CurseForge) : `resolveProject` (numéro, slug ou page ; classe 4471 = modpack),
    `inspectProject` (plus haut `_V<N>` des noms affichés, fichiers joints de la dernière version, lus dans son zip
    sur le serveur de fichiers : `downloadUrl` est vide pour les modpacks), `publishVersion` (export depuis le zip de
    la version, puis envoi), `versionStatuses`. Service : `linkCurseForge` (relève `lastVersion` au plus haut `_V`),
    `updatePublishTargets` (fichiers joints, `github`, retrait du lien ; jamais publié nulle part), `publishToCurseForge`
    (verrou ; refusé pour une version déjà envoyée ou plus ancienne qu'une version envoyée), `curseForgeStatuses`.
    `pack.json` : `curseforge` (`projectId`, `url`, `overrides`, `files` : fichier CurseForge par numéro) et
    `github: false` (seulement CurseForge : `computePlan` met le modpack de côté, ses releases ne sont jamais retirées).
    Interface : `studio/CurseForgePanel.tsx` (ligne « Publié sur… », réglages, pastille par version, bouton sur la
    dernière version).
- `src/core/maintenance/` — mises à jour automatiques (Node pur). `pipeline.ts` : `maintainPack` (profil source
  enregistré seulement, pas un lien deviné ; `checkUpdates` avec `pinned` → `applyUpdatesToTrial` → `checkProfile` →
  référence (`currentTests` du profil source, sinon `testPlayers` dessus) → `testPlayers` sur l'essai (`testServer`
  si `unavailable`) → erreurs nouvelles des journaux (`newIssues`, erreurs seulement) et partie impossible dans
  `warnings`, qui retiennent `autoPublish` → `ready`, ou si `autoPublish` `createVersion` : `promoteTrial`, `zipInstance`, notes
  (`notes.ts`), `publishPack` (GitHub, ce modpack seul, sans suppression) puis `publishToCurseForge`) ; un échec est un
  résultat (`failed`), jamais une exception. `runMaintenance` (`folders`, `due`, sinon tous sauf `never`),
  `finishPending` / `discardPending` (essai en attente), `maintenanceStatus`, `summarize`. Un passage tient
  `maintenance.lock` (`maintenanceLock`, distinct d'`operation.lock` que prend chaque étape). `state.ts` :
  `maintenance.json` à côté des réglages (`checkedAt` et dernier passage par id de modpack ; un `skipped` ne remplace
  pas un essai `ready` / `failed` en attente). `schedule.ts` : `dueAt` / `isDue` (marge de 6 h). `scheduledTask.ts` :
  tâche Windows `Modpack Manager - mises a jour des modpacks` (racine, compte de l'utilisateur, `Interactive`,
  `Limited`, quotidienne, `WakeToRun`, `StartWhenAvailable` ; PowerShell par stdin en UTF-8, sans droits
  d'administrateur : vérifié le 2026-10-11) ; `foreign` si elle lance une autre installation. `claude.ts` : demande
  à Claude pour un échec et outils MCP en lecture permis (`ANALYSIS_TOOLS`). `pack.json` `updates` (`PackUpdates` :
  `frequency`, `channel`, `pinned`, `autoPublish`), écrit seulement s'il diffère de `DEFAULT_PACK_UPDATES`
  (`manual`). Commandes `maintenance *` (`commands/maintenance.ts`), contexte `maintenanceLock` et `launcher`
  (mpm de l'app installée : `<exe> --maintenance`).
- `src/core/commands/` — registre des commandes (`registry.ts` : `command({ name, summary, description, params: zod,
  kind: read | write | destructive, run, print })`, `COMMANDS` dans `index.ts`). Nom « packs list » = outil MCP
  `packs_list`. `context.ts` (`createCommandRuntime`) construit le service hors de la fenêtre : publie d'office en
  publieur, corbeille par PowerShell, `holder` « la ligne de commande » ou « Claude (MCP) ». Un modpack se désigne par
  dossier, id ou nom (`findPack`). `publish apply` exige l'empreinte de `publish plan`. Toute commande doit figurer
  dans `docs/commandes.md` (test).
- `src/cli/` — `mpm` (`index.ts`) : options déduites du schéma zod (`args.ts`, via `z.toJSONSchema` : `--kebab`,
  `--no-x`, option répétée pour une liste, obligatoires aussi dans l'ordre), confirmation des commandes
  `destructive` (sauf `--yes`), progression sur stderr, `--json` sur stdout. `mpm ranger` / `mpm publier` : aperçu,
  confirmation, opération. Compilé en `out/main/cli.js` (deuxième entrée de `electron.vite.config.ts`) ; l'app
  installée a `mpm.cmd` (`build/mpm.cmd`, `extraFiles`) qui lance l'exécutable avec `ELECTRON_RUN_AS_NODE=1`.
  `MPD_GITHUB_API` ignoré quand cli.js est dans `app.asar`.
- `src/mcp/` — `server.ts` : chaque commande devient un outil (`registerTool`, schéma zod, annotations
  `readOnlyHint` / `destructiveHint`, progression par `notifications/progress`) ; `instructions.ts` : la méthode
  donnée à Claude (status d'abord, plan montré avant publication, suppressions confirmées). Rien d'autre que le
  protocole sur stdout.
- `test/` — `node:test` + tsx : `studio.test.ts` (bout en bout sur dossier temporaire), `commands.test.ts` (options,
  scénario par le registre, serveur MCP piloté par le client du SDK), `operations.test.ts` (verrou, journal,
  architecture), `exclusions.test.ts`. `support/fakeGitHub.ts` (faux GitHub en mémoire), `support/fixtures.ts`.
- `src/preload/index.ts` — un seul preload : `window.api` (`RendererApi`) et `window.studio` (`StudioApi`,
  `src/shared/studio.ts`).
- `src/renderer/` — React 19 + Tailwind v4 + zustand, une seule page (`index.html`). `store.ts` : état de l'app,
  dont `view` (`library` / `studio`, qui suit le rôle : `applyRoleResult`). `src/studio/` : vue Studio (`StudioView`)
  et son store (`useStudio`, notifications et paramètres délégués à l'app). Section « Utilisation » partagée
  `components/Usage.tsx` (premier lancement et paramètres).
  Apparence (`src/shared/appearance.ts`, réglage `appearance` : style, taille de l'interface, styles personnalisés) :
  un style = fond, texte, accent et aspect (angles, police des titres, animations, flou) ; `colorVariables` en tire
  dans OKLab toutes les variables `--color-ink-*` / `--color-grass-*` (le style « Herbe » garde les valeurs exactes de
  `styles.css`). `lib/appearance.ts` les pose sur la racine (`data-tone` clair / sombre, `data-motion`) ou sur un
  aperçu. Voiles et filets en `tint` (`bg-tint/[0.06]`, pas `white/`) : la couleur du texte, qui assombrit un style
  clair. Pas de couleur codée en dur dans le renderer : une variable du thème ou `color-mix`. Taille = zoom de la
  page (`applyInterfaceScale`, taille minimale de la fenêtre multipliée d'autant), `Ctrl` + `+` / `-` / `0`.
  `components/Appearance.tsx` : section des paramètres et éditeur de style.
  `components/UpdateBar.tsx` : proposition de mise à jour de l'app, sous la barre de titre et hors de `<main>`, donc
  visible dans toutes les vues (« Plus tard » la replie en rappel dans `TitleBar`). `autoRefresh` relit GitHub en
  silence toutes les 30 min (minuterie + retour sur la fenêtre) ; `DetailsPanel` est positionné dans la zone de
  contenu (`absolute`), pas sur la fenêtre, pour s'ouvrir sous cette barre.
  Versions présentes dans CurseForge : `store.present` (bibliothèque, recalculé quand le catalogue, les installations
  ou les profils changent) et `PackCard` (studio, sur les zips du dossier) appellent `findPresentVersions`.
  `PackBadges` affiche « Version sur CurseForge : vN », `CurseForgeNote` la phrase du studio.
  `components/ReportDialog.tsx` : formulaire « Signaler un problème » (bouton de `TitleBar` et de Paramètres → À
  propos), remonté à chaque ouverture.
  `studio/Profiles.tsx` : arborescence des profils (`ProfilesSidebar`, dossiers repliés gardés en `localStorage`),
  `ProfileDetail` (état et action : créer le modpack, créer la version suivante, lier, confirmer un lien deviné) et
  `UnlinkedPackDetail` ; `useStudio.selection` (`all` / `profile` / `pack`), `useStudio.library` relu avec l'aperçu.
  `StudioView` : deux colonnes, chacune avec son défilement. `studio/ProfileUpdates.tsx` : mises à jour des mods du
  profil (recherche, choix ; une mise à jour non téléchargeable n'est pas cochable) et essai en cours (relancer
  CurseForge, garder, abandonner) ; canaux `studio:checkUpdates`, `studio:applyUpdates` (+ `studio:update-progress`),
  `studio:promoteTrial`, `studio:discardTrial`. `FromProfileDialog` (PackDialogs) ; `ImportDialog`
  accepte un profil déjà choisi.
  `studio/PackSettingsDialog.tsx` : « Réglages des versions » d'un modpack (onglets Fichiers exclus : arborescence du
  zip le plus récent à cocher ; Mods désactivés ; Configurations des joueurs), et `StripDialog` (« Retirer du zip »).
  Le bouton **Réglages** et les pastilles de `SettingsSummary` de `PackCard` l'ouvrent. `studio/fileTree.ts` :
  arborescence d'un zip, partagée avec `ContentsDialog` (mentions « Exclu » et « Désactivé chez les joueurs »).
  `components/Toggle.tsx` : interrupteur partagé.
  `src/docs/` : l'aide intégrée (bouton Aide de `TitleBar`, `F1`). `content.ts` embarque `docs/*.md` et
  `CHANGELOG.md` à la compilation (`import.meta.glob` / `?raw`, hors de la racine du renderer) ; le sommaire
  `docs/README.md` fixe les pages, leurs groupes et leur ordre. `DocsCenter` couvre la zone de contenu (`z-[45]`,
  sous les fenêtres de dialogue, au-dessus de `DetailsPanel`) : navigation, recherche (`search.ts`, sans accents),
  « Sur cette page », retour (`Alt + ←`). `DocMarkdown` : ancres comme GitHub (`headingSlug`), liens entre pages,
  encadrés `> [!NOTE]`, espaces insécables françaises. `ChangelogPage` : historique (« Non publié » seulement en dev),
  mise à jour disponible en tête (notes des releases), « Ta version », « Nouveau ». Store `useDocs` / `showDocs`.
  `F1` et `Échap` de l'aide ignorent une fenêtre ouverte par-dessus : toute fenêtre de dialogue porte
  `aria-modal="true"` (`Modal`, `SettingsDialog`).
- `src/shared/` — config (`APP_REPO`…), types, dépôts (`repo.ts`), parsing des releases.
  `content.ts` : types de contenu (modpack, mod, pack de ressources, shader, plugin) et, pour chacun, préfixe de tag
  (`pack-`, `mod-`, `rp-`, `shader-`, `plugin-`), manifeste (`modpack.json` ou `content.json`) et numérotation (`vN`
  ou numéro déclaré par le fichier). Jamais `pack-` ni `modpack.json` hors modpack : les apps installées (≤ 1.9.3)
  prennent pour un modpack toute release qui porte l'un ou l'autre. `computePlan` ne traite que `pack-`.
- `build/icon.png` — le logo (PNG RVBA 1024 × 1024), seule source : `Logo` (renderer) l'importe, electron-builder en
  tire l'icône de l'exécutable et de l'installeur, `shortcut.ts` celle du raccourci en développement,
  `scripts/generate-installer-images.ts` les images des fenêtres de l'installeur (lecture PNG : `scripts/png.ts`, sans
  dépendance, RVB ou RVBA 8 bits). Changer de logo = remplacer ce fichier.
  `presence.ts` : `findPresentVersions` — un profil installé par l'app est reconnu à son marqueur, les autres à
  l'empreinte de leurs mods (à égalité entre versions d'un même modpack, la plus récente).
  `report.ts` : types de signalement, validation et corps de l'issue (`reportBody`).
  `exclusions.ts` : fichiers exclus des versions (chemins depuis la racine de l'instance, un dossier exclut son
  contenu, jokers `*`, `?` et `**/`, casse ignorée) ; `DEFAULT_EXCLUSIONS`, données propres à la partie du publieur.
  `studio.ts` : types du Studio, et `matchesDisabledMod` (même règle pour le Studio et la fenêtre).
  `docs.ts` : sommaire, titres et ancres calculées comme GitHub, liens (`resolveRepoPath`, chemins depuis la racine).
  `changelog.ts` : lecture et vérification de `CHANGELOG.md` (Keep a Changelog en français), notes d'une version,
  lecture des notes d'une release GitHub (`parseReleaseNotes` : tout ce qui précède le premier `---`).
- `README.md` (anglais, affiché par défaut sur GitHub) et ses traductions `README.<langue>.md` (`README.fr.md`),
  chacune avec les boutons des langues en tête : un changement se reporte dans toutes. Liens et ancres vérifiés par
  `docs:verifier` (le HTML y est permis).
- `docs/` — la documentation (Markdown lu sur GitHub et dans l'app). **Ton impersonnel**, comme les README : ni
  tutoiement ni impératif (« Cliquer sur… », « le joueur », « le publieur ») ; seuls les libellés et messages de
  l'interface, qui tutoient, sont cités tels quels. Une page = un `# Titre` puis un paragraphe d'introduction ; liens relatifs `page.md#ancre` ; pas de HTML (non affiché : chevrons entre accents graves) ; saut de
  ligne par `\` en fin de ligne. Toute page doit figurer dans `docs/README.md`.
- `CHANGELOG.md` — historique des versions de l'app : `## [Non publié]` en tête, puis `## [x.y.z] - AAAA-MM-JJ`,
  rubriques `###`, liens de comparaison en fin de fichier. Un commentaire `<!-- 1a2b3c4 -->` cite un commit.
- `scripts/changelog.ts` et `scripts/docs.ts` — suivi de l'historique et vérification de la documentation.
- `relay/` — service Netlify indépendant de l'application (aucune dépendance, fonctions dans `netlify/functions`,
  code partagé dans `src/`, syntaxe TypeScript effaçable : il s'exécute aussi tel quel avec `node`). `/github`
  reçoit le webhook du dépôt : mail au propriétaire à chaque issue, puis, quand une session de correction pousse une
  branche `…/issue-<N>`, mail de validation (résumé = message du dernier commit). `/action` est la page des boutons
  des mails (liens signés par `LINK_SECRET`, GET = confirmation, POST = action) : lancer une session
  (`ROUTINE_FIRE_URL`, le texte de l'issue part avec la demande), poser la proposition sur la branche principale au
  commit résumé dans le mail, ou renvoyer en correction. `/etat` : page d'état pour le propriétaire (lien signé).
  La fusion (`src/merge.mts`) est écrite par le relais lui-même, en un commit qui reprend l'identité du commit
  précédent de la branche principale : **ni pull request ni fusion par GitHub**, dont les commits (y compris le
  commit d'essai de chaque pull request ouverte) portent l'adresse du compte, donc l'adresse personnelle du
  propriétaire tant qu'elle n'est pas masquée dans ses réglages GitHub.
  Chaque mail porte le message d'origine de l'issue et une évaluation de son risque, faite par une session Claude
  Code sur l'abonnement du propriétaire (pas l'API, payante à part) : routine à part (`routine-evaluation.md`,
  `EVAL_ROUTINE_FIRE_URL` / `EVAL_ROUTINE_TOKEN`), qui pousse un commit vide sur `evaluation/issue-<N>` dont le message
  porte l'évaluation en JSON (`src/risk.mts`) ; ce push envoie le mail de l'issue (`issueOfBranch` ignore ces
  branches). `EVAL_DAILY_MAX` (3) issues évaluées d'office par 24 h, les autres par le bouton du mail (action
  `evaluer`) ; `relance.mts` (planifiée) envoie le mail sans évaluation au bout de 20 min (étiquette
  `evaluation-en-cours`). Une proposition qui touche un fichier sensible
  (`src/sensitive.mts` : CI, build, scripts, dépendances, relais, consignes de Claude) ne se valide pas depuis le mail
  (`mergeBlocker` dans `action.mts`, revérifié sur GitHub au clic).
  Voir `relay/README.md` pour les variables et le déploiement.
- `.github/workflows/release-app.yml` — deux jobs : `build` (`contents: read`, `actions: read` pour SignPath) puis
  `publish` (seul `contents: write`, n'exécute pas le code du dépôt) ; actions figées par commit, version en
  commentaire. Build de l'installeur et release sur tag `app-vX.Y.Z`, dont le texte vient de
  `CHANGELOG.md` (`changelog.ts --notes`, la CI s'arrête si la version n'y figure pas). Signature par SignPath
  Foundation (gratuite, open source, licence MIT) si le secret `SIGNPATH_API_TOKEN` existe (candidature refusée le
  2026-10-20 faute de visibilité publique du projet, à renouveler plus tard ; installeur non signé d'ici là) : envoi de l'installeur
  (artefact), approbation manuelle sur signpath.io, vérification `Get-AuthenticodeSignature`, puis publication.
  Variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG` ; configuration
  d'artefact dans `.github/signpath/`. Seul l'installeur est signé (éditeur affiché : SignPath Foundation). La section
  « Politique de signature du code » du README est exigée par SignPath : la garder à jour.
- `build/installer.nsh` — installeur « assisté » (`oneClick: false` : celui « en un clic » affiche la bannière
  SpiderBanner, impossible à styler) qui se comporte comme un installeur en un clic : pour l'utilisateur seul
  (`customInstallMode`), sans page de fin, l'app ouverte à la fin par `customInstall` (avec `--updated` après une mise à
  jour demandée par l'app). Chaque fenêtre est redessinée aux couleurs de l'app : décor de Modern UI caché, textes
  `STATIC` posés à la main, boutons = textes cliquables nsDialogs (survol relevé par minuterie), barre de progression
  plate, barre de titre sombre (DWM), tout mis à l'échelle du DPI. Logo : `build/installer/logo-<n>.bmp`, généré par
  `scripts/generate-installer-images.ts`. Fenêtres : progression « Installation », « Mise à jour » (bleu, `Version a →
  b`, titre de fenêtre « Mise à jour de … »), « Réinstallation », « Retour à une version précédente » (orange) ; pages
  « déjà installé » et « application ouverte » ; désinstalleur : confirmation (Entrée ne désinstalle pas) puis
  progression qui se ferme seule (sa propre `UninstPage instfiles`).
  `customInit` vérifie au lancement si l'app est déjà installée et intacte (`DisplayVersion` du registre + exécutable
  présent) : même version → page Ouvrir / Réinstaller / Annuler ; version installée plus récente → page Ouvrir la vX /
  Installer la vY / Annuler ; plus ancienne → mise à jour sans question. Aucune page avec `/S` ni `--updated`, que
  `appUpdate.ts` passe à l'installeur lors d'une mise à jour demandée par l'app. `mpdPackageDir` garde une nouvelle
  installation dans `Programs\<nom du paquet>` (en mode assisté, electron-builder prendrait le nom du produit).
  App ouverte : `customCheckAppRunning` remplace la boîte « … est en cours d'utilisation » d'electron-builder et ses
  appels PowerShell. `mpdAppProcesses` repère les processus lancés depuis `$INSTDIR` (Toolhelp +
  `QueryFullProcessImageNameW`) ; fermeture normale (`taskkill` sans `/F`), forcée au bout de 3 s, après accord sur la
  page « application ouverte » (installeur) ou la confirmation (désinstalleur). Avec `--updated`, l'app a 3 s pour se
  fermer d'elle-même.
  L'installeur ne crée pas de raccourci sur le bureau (l'app le propose au premier lancement, réglage
  `shortcutPrompted`) ; la désinstallation retire celui du bureau, sauf lors d'une mise à jour (`isUpdated` : l'ancien
  désinstalleur reçoit toujours `--updated` pendant une réinstallation). `customInstall` redemande à l'Explorateur ses
  icônes (`SHChangeNotify`) : l'ancien désinstalleur l'a fait alors que l'exécutable était absent, et electron-builder
  ne le refait qu'en créant lui-même le raccourci du bureau. `shortcut.ts` le refait aussi après avoir créé un raccourci.

## Conventions de publication

- Dépôt des modpacks configurable (`settings.repo`, défaut `APP_REPO`) ; les mises à jour de l'app (`app-v*`) viennent
  toujours d'`APP_REPO`. Le studio refuse de publier si le rôle n'est pas `publisher` (hors scripts, qui publient d'office).
  Après une publication, la bibliothèque est rechargée pour montrer tout de suite les nouvelles versions.
- Le dossier de travail du studio fait foi : une release `pack-*` sans zip local est supprimée (avec son tag).
  Les suppressions du studio (`deleteVersion`, `deletePack`, `deleteReleases` dans `service.ts`) suivent la même
  règle : GitHub vérifié d'abord, puis zip ou dossier à la corbeille (`trashItem`, fenêtre seulement), puis seules les
  étapes `delete` du plan correspondant sont appliquées (`applyPlan`).
  Seule exception : un modpack ou une version en erreur n'est jamais touché sur GitHub.
- Zip rangé : `<Dossier>-v<N>.zip` (N entier). `pack.json` garde l'`id` (figé), le nom, la description, les notes
  par version et `lastVersion` : un numéro n'est jamais réutilisé ; `profile` (`guid`, `name`) : le profil CurseForge
  source, écrit seulement s'il est connu. Il garde aussi les réglages des versions : les
  exclusions s'appliquent aux zips créés ensuite depuis CurseForge (ou nettoyés avec « Retirer du zip »), jamais à
  un zip déjà publié ; les mods désactivés et `keepPlayerConfigs` passent par le `modpack.json` de toutes les versions.
- Release de modpack : tag `pack-<id>-v<N>`, titre `<nom> v<N>`, fichiers `<id>-<N>.zip` (contenu du dossier
  d'instance, `minecraftinstance.json` à la racine), `modpack.json` (schéma `ModpackManifest`, `author` = propriétaire
  du dépôt, avec `coverSha256`, `modsSignature`, et si besoin `disabledMods` et `keepPlayerConfigs`),
  `cover.(png|jpg|jpeg|webp)` optionnel. Toujours `make_latest: false` (la « latest » reste l'installeur de l'app).
  Un champ ajouté à `MANIFEST_FIELDS` fait renvoyer le `modpack.json` des releases existantes (sans le zip) à la
  publication suivante : c'est ainsi qu'elles ont reçu `modsSignature`. Un champ facultatif ne doit être écrit que
  s'il sert, sinon toutes les releases repartent.
- Le zip publié est celui du publieur : un mod désactivé chez les joueurs y reste actif (le joueur le reçoit
  désactivé par son installeur). L'empreinte des mods du zip reste donc celle du profil du publieur, qui est reconnu.
- Release de l'app : tag `app-v<version>` = version de `package.json`, avec l'installeur `.exe`. Préparer la version
  avec `npm run changelog -- --version <version>` ; le texte de la release (notes, `---`, mode d'emploi) est relu par
  les apps installées pour présenter la mise à jour.
- Chaque instance installée contient `.modpack-manager.json` (id, version, `managedEntries`, et depuis la 1.0.5
  `configFiles` et `disabledByDefault`, que `listInstalled` ne transmet pas à la fenêtre) : c'est la source
  de vérité pour savoir ce qui est installé, et la seule qui autorise une mise à jour sur place. Un profil sans
  marqueur reconnu à ses mods (profil d'origine du publieur, zip importé à la main) est seulement signalé : l'app
  n'y écrit jamais, « Installer » crée un profil à part.

## Faits CurseForge vérifiés

- CurseForge écrit le chemin du dossier `Instances` dans ses logs
  (`%LOCALAPPDATA%\Overwolf\Log\Apps\CurseForge\CurseClient\*.json`, « Setting file watcher on instance directory »).
- CurseForge ne relit tous ses profils qu'à son démarrage (constaté sur la version Overwolf) : ouvert, il ne voit pas
  une instance déplacée d'un bloc dans `Instances`, et une mise à jour par échange de dossier la fait disparaître
  (« 404 » dans son interface) ; le relancer règle les deux. Malgré son file watcher, on ignore à quels événements il
  réagit : l'installeur pose `minecraftinstance.json` en dernier puis le réécrit (sans effet prouvé), et la fenêtre
  propose de le relancer.
- Sous Overwolf, l'application CurseForge tourne dans `%LOCALAPPDATA%\Overwolf\ProcessCache\<version>\<uid>\CurseForge.exe`
  (d'après les fiches de processus publiées en ligne, pas encore observé sur un PC).
- Lancer CurseForge alors qu'il tourne déjà remet simplement sa fenêtre au premier plan.
- UID Overwolf de CurseForge : `cchhcaiapeikjbdbpfplgmpobbcdkdaphclbmkbj`.
- Dossiers de profils (version Overwolf, constaté) : `%LOCALAPPDATA%\Overwolf\Curse\GameInstances\groups.json`, tableau
  `{ id, gameId: 432, name, createdAt, updatedAt }`, un seul niveau ; un profil y est rangé par le `groupId` de son
  `minecraftinstance.json` (absent : aucun dossier). `MinecraftGameInstance.json`, à côté (26 Mo), est l'index de
  CurseForge : ne jamais y écrire. Chaque profil a un `guid` stable ; `projectID` ≠ 0 = installation d'un modpack de
  CurseForge. Application autonome : emplacement de `groups.json` supposé (`%APPDATA%\CurseForge\GameInstances`).
- Entrée d'`installedAddons` (constaté) : `addonID`, `name`, `categoryClassID` (6 mod, 12 pack de textures, 6552
  shader ; `categorySection.path` : dossier, par ex. `shaderpacks`), `modFolderPath`, `fileNameOnDisk`, `filePaths`,
  `isEnabled`, `installedFile` (presque le `File` de l'API : `id`, `fileName`, `fileDate`, `fileLength`, `releaseType`,
  `downloadUrl`, `dependencies`, `packageFingerprint` ; mais `gameVersion` au lieu de `gameVersions` et `hashes`
  `{ type, value }` au lieu de `{ algo, value }`), et `latestFile` (dernier fichier connu de CurseForge, même format).
  Écrire une entrée soi-même (phase 4, appliquer une mise à jour) doit reprendre ce format : à vérifier sur une copie.
- Identité d'un profil (constaté) : son `guid` est dans `minecraftinstance.json`, dans le `gameInstanceID` de chaque
  entrée d'`installedAddons`, et dans le fichier caché `.curseclient` (le guid seul, 36 caractères) ; chaque entrée a
  aussi son `instanceID`. Les zips publiés jusqu'à la 1.3.0 contiennent le `.curseclient` du publieur. `instanceIdentity.ts`
  (`applyInstanceGuid`, `writeCurseClientFile` : un fichier caché ne s'ouvre pas en `w` sous Windows, réécrit en `r+`)
  sert à l'installeur et à la copie d'essai ; `.curseclient` est dans `DEFAULT_EXCLUSIONS`. CurseForge ouvert ne voit
  pas un profil créé ou copié (ni son index `MinecraftGameInstance.json`, ni le fichier du profil ne changent).
- Entrées écrites par l'application (essai du 2026-10-11 sur une copie de `Test-mod-LMA`, Fabric API remplacé par une
  version antérieure) : après relance, CurseForge affiche le profil, la version écrite, et propose la mise à jour ; il
  réécrit `minecraftinstance.json` en gardant nos valeurs (`installedFile`, `isFuzzyMatch: false`) et range la copie
  à part de l'original dans son index.
- Publications du propriétaire sur CurseForge (constaté le 2026-10-11, compte `WolfGang_PRoxa`, id 112688113,
  9 modpacks) : fichier `<nom du profil>.zip` (export de CurseForge), nom affiché `<nom>_V<N>.zip` (V0, V1…), notes,
  un pack serveur fait à la main joint à presque chaque version (`<nom> (Server Pack)_V<N>.zip`, `parentProjectFileId`).
  L'export joint peu de fichiers (packs de textures, `.txt` de réglages des shaders, `profileImage/`), jamais `config`.
  API de lecture : `downloadUrl` vide pour ces fichiers ; le serveur de fichiers les sert à
  `https://edge.forgecdn.net/files/<id / 1000>/<id % 1000>/<nom>`.
- Test du serveur (constaté le 2026-10-11) : Fabric 26.3, 3 mods, 14 s téléchargement compris ; Forge 1.20.1, 55 mods,
  79 s dont 19 s d'installation de Forge. Forge démarre même avec deux mods de même identifiant (il en garde un) : un
  doublon est un avertissement, pas une erreur. CurseForge garde les Java de Mojang dans `Install/java/` (gamma 17,
  delta 21, epsilon 25…).
- Mod désactivé (constaté sur les profils du PC du propriétaire) : fichier `x.jar.disabled` dans `mods` ; dans
  `installedAddons`, l'entrée du mod a `isEnabled: false`, et son `fileNameOnDisk` et ses `filePaths` prennent
  `.disabled` ; `installedFile.fileName` et `installedFile.fileNameOnDisk` gardent le nom d'origine. Le projet
  CurseForge d'un mod est `addonID`. Un profil peut contenir un `.jar.disabled` dont l'entrée dit encore
  `isEnabled: true` (vu sur un profil) : `readModStates` se fie au nom du fichier.

## Pièges connus

- **Changement d'identité en 1.9.0** (avant : « Modpack Downloader ») : `appId` et `APP_USER_MODEL_ID`
  `com.wolfgangproxa.modpackmanager` (avant `…modpackdownloader`), paquet et dossier d'installation
  `Programs\minecraft-modpack-manager`, exécutable `Modpack Manager.exe`, `userData` `%APPDATA%\Modpack Manager`
  (fixé dans `index.ts`), marqueur `.modpack-manager.json`, dossiers temporaires `modpack-manager`, dépôt
  `minecraft-modpack-manager` (GitHub redirige l'ancienne adresse, que les apps d'avant la 1.9.0 lisent encore).
  L'ancienne identité est décrite dans `src/shared/previousIdentity.ts` et reprise une fois : l'installeur trouve
  l'ancienne app (`mpdFindPrevious` : entrée « Applications installées » du même éditeur au nom du même produit, autre
  clé), la ferme et la désinstalle sur place avec `--updated` (`mpdUninstallPrevious`) avant de poser ses fichiers ;
  au lancement, `migrateDataDir` (core) déplace le dossier des données (aussi pour les commandes), `readInstanceMarker`
  renomme le marqueur d'un profil en le lisant, `currentRepoName` remplace l'ancien nom du dépôt dans les réglages, et
  `migratePreviousInstallation` (main, une fois : `previous-identity.done`) redirige raccourcis, épingles, tâche
  planifiée et connexion de Claude Code. Déplacements et renommages seulement depuis l'app installée
  (`enablePreviousIdentityMigration(app.isPackaged)`, ou `app.asar` pour les commandes) : en développement, l'app
  installée, peut-être encore ancienne, se sert des mêmes fichiers, et l'ancien nom est seulement lu. Tout cela est à
  retirer en 2.0. Ne jamais tester ces migrations avec les vrais noms : compiler sous une identité de test avec
  `PREVIOUS_IDENTITY` et `APP_NAME` modifiés le temps du build (sinon le vrai dossier des données et les vrais
  raccourcis seraient déplacés).

- Une notification d'Electron non packagé (passage `--maintenance` lancé depuis le dépôt) crée dans le menu Démarrer
  `Electron.lnk` vers `node_modules\electron\dist\electron.exe`, avec l'identifiant Windows de l'app (constaté le
  2026-10-11) : Windows prenait alors l'icône d'Electron pour l'app installée dans la barre des tâches. D'où
  `WINDOWS_APP_ID` (`shortcut.ts`) : `APP_USER_MODEL_ID` une fois packagée, suivi de `.dev` en développement. Après
  un tel essai, mettre `Electron.lnk` à la corbeille.
- Politique de sécurité (CSP) : celle de `src/renderer/index.html` est celle de l'app compilée (`script-src 'self'`,
  `connect-src 'self'`, images `https:`, `data:`, `studio-media:`) ; le plugin `devContentSecurityPolicy`
  (`electron.vite.config.ts`) l'assouplit pour le seul serveur de développement. Dans `out/`, une image d'un faux
  serveur `http://` ne s'affiche donc pas.
- L'extension VS Code définit `ELECTRON_RUN_AS_NODE=1` : Electron démarre alors comme Node et plante
  (`app` undefined). Retirer cette variable pour lancer l'app depuis un outil.
- npm 11 n'exécute que les scripts d'install listés dans `allowScripts` (package.json). Electron télécharge son binaire
  au premier lancement.
- TypeScript est épinglé en 6.x (la 7 est le compilateur natif, pas encore validé ici). archiver 8 est en ESM
  (exports nommés `ZipArchive`). lucide-react v1 n'a plus d'icônes de marques. Tailwind v4 : `px-0!`, `bg-linear-to-r`.
- Tester sans CurseForge : `test/support/fakeCurseForge.ts` (clé `cle-de-test`, jeton `jeton-de-test`) et
  `setCurseForgeApiOverride` / `MPD_CURSEFORGE_API`.
- Tester sans GitHub : `test/support/fakeGitHub.ts` (releases en mémoire : lecture anonyme, écriture avec jeton,
  `upload_url` et téléchargement d'asset par redirection vers lui-même) et
  `MPD_GITHUB_API=http://127.0.0.1:<port>/repos/o/r` (`setGitHubApiOverride` dans un test ; `GITHUB_TOKEN=x` pour
  le studio et les commandes). La surcharge est ignorée dans l'app packagée et par le cli.js d'`app.asar`.
- Binaire Electron absent (script d'install bloqué par npm 11) : `node -e "require('electron')"` le télécharge.
- Piloter l'app en test : Playwright `_electron` (installé hors du dépôt). `--user-data-dir=<dossier>` isole ses
  données (réglages, jeton, cache) et son verrou d'instance ; `APPDATA=<dossier>` isole ce que lisent les scripts.
  Mettre un dossier `Instances` de test pour ne pas toucher au vrai CurseForge.
- Dans Git Bash, `python3` est le raccourci du Microsoft Store : utiliser `python`.
- Lucide v1 : pas d'icône GitHub (marques retirées) ; `Avatar` charge `https://github.com/<compte>.png`.
- Tester un raccourci sans toucher au vrai bureau : `app.evaluate(({ app }, d) => app.setPath('desktop', d), dossier)`
  via Playwright.
- `Cover` : le visuel de remplacement ne doit pas cumuler `relative` et le positionnement passé en `className`
  (`absolute inset-0`), sinon il ne remplit pas son cadre. Une image loin du 16:9 (rapport hors de 1,6–2) est réduite
  (`object-contain`) sur un fond flou tiré d'elle-même, calée à droite dans le héros (`align="right"`).
- Tester l'installeur sans toucher à l'installation réelle : le compiler sous une autre identité
  (`npx electron-builder --win --publish never -c.appId=com.wolfgangproxa.mpdtest -c.productName="MPD Test"
  -c.extraMetadata.name=mpd-test -c.extraMetadata.productName="MPD Test" -c.nsis.shortcutName="MPD Test"
  -c.directories.output=<dossier>`, plus `-c.extraMetadata.version=1.0.1` pour une autre version) : autre dossier
  d'installation (`Programs\mpd-test`), autres clés de registre. Le `userData` vient d'`APP_NAME`, pas du nom du
  produit : pour ne pas toucher au vrai `%APPDATA%\Modpack Manager`, changer `APP_NAME` le temps du build (et
  `-c.executableName` pour ne pas viser les vrais raccourcis), puis supprimer son dossier. Désinstaller ensuite avec
  `"Uninstall <exécutable>.exe" /currentuser /S`. Depuis PowerShell, mettre chaque
  argument `-c.…` entier entre guillemets (`"-c.productName=MPD Test"`), sinon il est coupé au premier point.
  Les boutons des pages (textes nsDialogs) se cliquent en envoyant `WM_COMMAND` (`STN_CLICKED`, identifiant du texte)
  à leur dialogue ; les captures se font par `PrintWindow`. Le désinstalleur se recopie dans `%TEMP%` et s'y relance :
  suivre ses fenêtres par leur titre.
- NSIS (installeur assisté) : un `Quit` lancé depuis un clic nsDialogs (`NSD_OnClick`) reste sans effet ; le clic
  poste « Suivant » (`MPD_NEXT`) et la fonction de sortie de la page agit. La page « pour qui installer »
  d'electron-builder (`PAGE_INSTALL_MODE`, jamais montrée) consomme les `MUI_PAGE_CUSTOMFUNCTION_*` définis avant elle
  (d'où la propre `UninstPage instfiles` du désinstalleur) et recalcule `$INSTDIR` à son entrée (d'où `mpdPackageDir`
  refait par la page suivante). `SetCtlColors` n'accepte que des couleurs écrites en dur ; l'espace avant un `:` s'écrit
  `${U+00A0}` (insécable), sinon le `:` peut passer seul à la ligne. PowerShell prend l'apostrophe typographique `’`
  pour un délimiteur de chaîne.
- Depuis Git Bash, un argument `/S` est converti en chemin : lancer l'installeur silencieux depuis PowerShell.
  Un exécutable de l'app lancé depuis un outil hérite d'`ELECTRON_RUN_AS_NODE` (pas de fenêtre) : retirer la variable.
- L'installeur est compilé avec `-INPUTCHARSET UTF8` : les messages accentués d'`installer.nsh` s'écrivent en UTF-8.
  Les avertissements NSIS font échouer le build (variable ou étiquette inutilisée…).
- GitHub CLI garde son jeton dans le trousseau de Windows : `GH_CONFIG_DIR` vide ne suffit pas à simuler « aucun
  compte ». Pour tester sans compte, retirer `GitHub CLI` du `PATH` du processus (et `GITHUB_TOKEN`, `GH_TOKEN`).
- Netlify, offre gratuite : une variable d'environnement créée avec une portée choisie est refusée sans erreur (la
  liste reste vide). Marquée « secrète » depuis l'interface, elle fonctionne. Redéployer pour qu'elle soit prise en
  compte.
- Tester le relais hors ligne : charger ses fonctions avec `node` (`globalThis.Netlify = { env: { get } }`), et
  pointer `GITHUB_API_URL`, `RESEND_API_URL` et `ROUTINE_FIRE_URL` vers un faux serveur local qui modélise commits,
  arbres et branches. Avant un essai réel, `RemoteTrigger run` sur la routine vérifie que sa configuration est
  acceptée (sans demande, la session ne fait rien).
- Routine de correction : son `environment_id` doit être un identifiant d'environnement réel (`env_…`), pas
  `default`, sinon elle refuse de démarrer (`session_config_rejected`).
- Quota GitHub sans connexion : 60 lectures par heure et par adresse IP, et les réponses 304 (ETag) comptent aussi.
  Ne pas rapprocher les vérifications automatiques (`AUTO_REFRESH_MS`).
- Les assets de release exposent `digest` (`sha256:…`) même en lecture anonyme, et `state` (`uploaded` une fois
  l'envoi terminé).
- `child_process.spawn` signale certaines erreurs par l'événement `error` (fichier absent, accès refusé) et lève les
  autres tout de suite (exécutable invalide : `spawn UNKNOWN`) : gérer les deux.
- Tester la relance de CurseForge hors Windows : `process.platform` forcé à `win32` avant d'importer `curseforge.ts`
  (avec tsx), et de faux `powershell.exe`, `taskkill` et `reg` en tête du `PATH` ; `LOCALAPPDATA` pointe vers un
  dossier où `Programs\CurseForge Windows\CurseForge.exe` est un script.
- react-markdown (micromark) encode les caractères non ASCII des liens : `#d%C3%A9j%C3%A0`. `splitHref` décode chemin
  et ancre. En test Playwright, `innerText` applique `text-transform` (pastilles et titres en majuscules).
- Tester l'aide ou les nouveautés : faux serveur avec des releases `app-v*` plus récentes que `package.json`, dont le
  texte suit le format de la CI, et `lastRunVersion` plus ancien dans `settings.json` pour simuler une mise à jour.
- Tester la mise à jour de l'app de bout en bout : deux installeurs sous l'identité de test (une version ancienne,
  une récente), la récente servie par le faux serveur comme asset `.exe` d'une release `app-v<version>`. L'app
  packagée ignorant `MPD_GITHUB_API`, compiler l'ancienne avec `setGitHubApiOverride(process.env.MPD_GITHUB_API)`
  le temps du build (à retirer aussitôt, ne jamais committer). Ne jamais cliquer « Mettre à jour » dans une app de
  test branchée sur le vrai GitHub : elle lancerait le vrai installeur, qui remplace l'installation réelle.
- Tests : `npm test` (`test/*.test.ts`, lancés par `npm run build`, donc par la CI). Le moteur (`src/core`) se teste
  sur des dossiers temporaires (`test/support/fixtures.ts` : fausses instances CurseForge) ; un test qui lit les
  réglages appelle `useSettingsFile` sur un fichier temporaire. `installer.ts` (Electron) se teste dans l'app, avec
  Playwright. Le serveur MCP se teste par le client du SDK (`StdioClientTransport`, `node --import tsx`).
- Tester `mpm.cmd` et le serveur MCP de l'app compilée sans l'installer : `npx electron-builder --win --dir
  -c.directories.output=<dossier>` puis `<dossier>\win-unpacked\mpm.cmd status`. Ne pas tester « Connecter » depuis
  l'app de développement : il inscrirait dans la configuration Claude Code de l'utilisateur un chemin de dev
  (`claude mcp add --scope project` dans un dossier temporaire pour essayer, puis supprimer le dossier).
- Tester les réglages des versions de bout en bout : app compilée (`out/`), `--user-data-dir`, réglages publieur avec
  `instancesDir` de test (le profil source du publieur y est aussi), faux GitHub en écriture, `GITHUB_TOKEN=x`,
  `APPDATA` isolé ; Studio (créer, régler, publier) puis Bibliothèque (installer, simuler les choix du joueur dans le
  profil, mettre à jour). Attendre un élément de la fenêtre de dialogue, pas un texte de la page : le nom d'un profil
  figure aussi sur la carte du modpack.
- archiver : `append(flux)` branche aussitôt la source sur un PassThrough. Pour recopier un zip entrée par entrée,
  ajouter une entrée à la fois (attendre l'événement `entry`), sinon tous les flux du zip source s'ouvrent ensemble.
