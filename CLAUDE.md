# CLAUDE.md

Le projet devient **Modpack Manager** (anciennement Modpack Downloader) : feuille de route dans `PLAN.md`.

Application Windows (Electron) qui affiche les modpacks Minecraft publiés en releases sur
`WolfGang-PRoxa/minecraft-modpack-downloader` et les installe directement comme profils CurseForge.
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
npm run build            # typecheck + docs:verifier + build electron-vite dans out/
npm run changelog        # « Non publié » et commits feat/fix/perf depuis le dernier tag app-v*, mentionnés ou non
npm run changelog -- --brouillon       # ajoute à « Non publié » une entrée par commit non mentionné
npm run changelog -- --version 1.2.0   # « Non publié » → 1.2.0 datée du jour, package(-lock).json en 1.2.0 (ni commit ni tag)
npm run changelog -- --notes 1.2.0     # texte de la release GitHub (--sortie <fichier>), utilisé par la CI
npm run build:win        # build + images de l'installeur + installeur NSIS dans dist/
npm run studio           # app en développement, ouverte sur la vue Studio (--studio)
npm run modpacks:ranger  # numérote les zips déposés (--dir, --yes)
npm run modpacks:publier # met les releases en accord avec le dossier (--dir, --yes, --dry-run)
npx tsx scripts/generate-installer-images.ts   # build/installer/logo-<n>.bmp depuis build/icon.png (non versionné, fait par build:win)
```

## Architecture

- `src/main/` — processus principal (un seul, une seule fenêtre)
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
  - `playerChoices.ts` et `instanceAddons.ts` (Node pur, testables avec tsx) : reprise des choix du joueur ; lecture
    et écriture de l'état des mods dans `installedAddons` (projet CurseForge par fichier, `setAddonEnabled`).
  - `curseforge.ts` : détection (protocole `curseforge://` dans `HKCR`, puis chemins connus Overwolf/autonome),
    lancement, dossier `Instances` (réglage > logs CurseForge > défaut), détection de Minecraft lancé, relance
    (`restartCurseForge`, canal `curseforge:restart` : ses processus fermés poliment puis de force, jamais Overwolf,
    Minecraft ni ce qui tourne depuis le dossier du jeu ; refusée si Minecraft tourne).
  - `settings.ts` (Node pur, sans cache) : `settings.json` du `userData` — `role` (`null` = premier lancement),
    `repo`, `workspaceDir` (dossier des modpacks), `lastView` (vue rouverte au lancement), `lastRunVersion`…
    Lu aussi par les scripts (`%APPDATA%\Modpack Downloader\settings.json`).
  - `auth.ts` (Node pur) : connexion GitHub partagée app / scripts. Jeton chiffré par DPAPI via PowerShell
    (`github-auth.json` à côté des réglages, relisible par les scripts). Ordre : connexion faite dans l'app >
    `GITHUB_TOKEN` > `.env` (scripts) > `gh auth token`. Vérifie le droit de publier (`permissions.push`) et gère la
    connexion par code (device flow, `GITHUB_OAUTH_CLIENT_ID`). Canaux `auth:*` (`authIpc.ts`) et `role:*` (`roleIpc.ts`).
  - `githubEnv.ts` : base de l'API d'un dépôt ; `MPD_GITHUB_API` la remplace pour tous les dépôts en test.
  - `shortcut.ts` : raccourci `.lnk` de l'app (bureau ou emplacement choisi). Non packagée : cible
    `electron.exe "<projet>"` et icône `.ico` générée depuis `build/icon.png`.
  - `appUpdate.ts` : mise à jour de l'app. `installAppUpdate` relit lui-même les releases (rien ne vient de la
    fenêtre), télécharge l'installeur dans `%TEMP%\modpack-downloader`, compare son SHA-256 au `digest` publié par
    GitHub, le lance détaché avec `--updated` puis quitte ; l'installeur relance l'app avec `--updated`.
    Refusée pendant une installation de modpack ou une opération du studio (`busyWith`) ; à l'inverse, tant qu'elle
    est en cours (`appUpdateTask`), `install:start` et le verrou du studio (`blockedBy`) refusent de démarrer.
    `noteRunningVersion` (réglage `lastRunVersion`) dit au lancement si l'app vient d'être mise à jour, et depuis
    quelle version (`LaunchInfo.previousVersion` : la page Nouveautés marque « Nouveau » ce qui a été reçu depuis).
    `AppUpdateInfo.releases` porte le texte de chaque release `app-v*` plus récente que l'app, jusqu'à celle proposée.
  - `modsSignature.ts` (Node pur) : empreinte des mods d'une instance (nom et taille de chaque `.jar` posé dans
    `mods`), calculée à l'identique pour un zip (`analyze.ts`) et pour un profil CurseForge (`profiles.ts`,
    `listProfiles`, canal `curseforge:profiles`). Relu à chaque fois : ~30 ms pour 29 profils et 2 800 mods.
  - `report.ts` : signalement d'un problème (canaux `report:*`). Issue créée sur `APP_REPO` avec le compte GitHub
    connecté (`resolveCredential`) ; sans compte, ou si GitHub refuse, la page « nouvelle issue » s'ouvre préremplie
    dans le navigateur. Le corps (`src/shared/report.ts`) est du Markdown simple, lisible tel quel dans un mail ; les
    informations techniques jointes ne contiennent ni chemin ni nom de compte.
  - `zip.ts` (yauzl, protection zip-slip, accepte un zip avec dossier racine), `download.ts`, `ipc.ts`.
- `src/main/studio/` — la vue Studio. Tout est Node pur (réutilisé par `scripts/modpacks.ts`) sauf `ipc.ts`
  (canaux `studio:*`, images via `studio-media://cover/`, surveillance du dossier des modpacks).
  - `workspace.ts` : lecture du dossier (un sous-dossier par modpack, `pack.json`, `cover.*`), rangement
    (`planRanger`/`applyRanger`). `pack.json` porte aussi les réglages des versions (`exclude`, `disabledMods`,
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
  - `archive.ts` : zip d'une instance (`DEFAULT_EXCLUSIONS` + exclusions du modpack), fichiers exclus trouvés dans
    un zip (`findExcludedInZip`) et réécriture sans eux (`stripExcludedFromZip`, une entrée à la fois),
    `service.ts` : orchestration + verrou d'exclusivité ; les zips qui partiront à la prochaine publication sont
    cherchés pour des fichiers exclus (`findExcluded`, mémorisé) : avertissement sur la ligne et dans le plan
    (`annotatePlan`). `settings.ts` : dossier des modpacks (repris une fois de l'ancien
    `%APPDATA%\Modpack Studio\studio-settings.json`).
- `src/preload/index.ts` — un seul preload : `window.api` (`RendererApi`) et `window.studio` (`StudioApi`,
  `src/shared/studio.ts`).
- `src/renderer/` — React 19 + Tailwind v4 + zustand, une seule page (`index.html`). `store.ts` : état de l'app,
  dont `view` (`library` / `studio`, qui suit le rôle : `applyRoleResult`). `src/studio/` : vue Studio (`StudioView`)
  et son store (`useStudio`, notifications et paramètres délégués à l'app). Section « Utilisation » partagée
  `components/Usage.tsx` (premier lancement et paramètres). Thème sombre unique.
  `components/UpdateBar.tsx` : proposition de mise à jour de l'app, sous la barre de titre et hors de `<main>`, donc
  visible dans toutes les vues (« Plus tard » la replie en rappel dans `TitleBar`). `autoRefresh` relit GitHub en
  silence toutes les 30 min (minuterie + retour sur la fenêtre) ; `DetailsPanel` est positionné dans la zone de
  contenu (`absolute`), pas sur la fenêtre, pour s'ouvrir sous cette barre.
  Versions présentes dans CurseForge : `store.present` (bibliothèque, recalculé quand le catalogue, les installations
  ou les profils changent) et `PackCard` (studio, sur les zips du dossier) appellent `findPresentVersions`.
  `PackBadges` affiche « Version sur CurseForge : vN », `CurseForgeNote` la phrase du studio.
  `components/ReportDialog.tsx` : formulaire « Signaler un problème » (bouton de `TitleBar` et de Paramètres → À
  propos), remonté à chaque ouverture.
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
- `docs/` — la documentation (Markdown lu sur GitHub et dans l'app). Une page = un `# Titre` puis un paragraphe
  d'introduction ; liens relatifs `page.md#ancre` ; pas de HTML (non affiché : chevrons entre accents graves) ; saut de
  ligne par `\` en fin de ligne. Toute page doit figurer dans `docs/README.md`.
- `CHANGELOG.md` — historique des versions de l'app : `## [Non publié]` en tête, puis `## [x.y.z] - AAAA-MM-JJ`,
  rubriques `###`, liens de comparaison en fin de fichier. Un commentaire `<!-- 1a2b3c4 -->` cite un commit.
- `scripts/modpacks.ts` — les commandes `ranger` et `publier` du studio en ligne de commande.
  `scripts/changelog.ts` et `scripts/docs.ts` — suivi de l'historique et vérification de la documentation.
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
  Voir `relay/README.md` pour les variables et le déploiement.
- `.github/workflows/release-app.yml` — build de l'installeur et release sur tag `app-vX.Y.Z`, dont le texte vient de
  `CHANGELOG.md` (`changelog.ts --notes`, la CI s'arrête si la version n'y figure pas). Signature par SignPath
  Foundation (gratuite, open source, licence MIT) si le secret `SIGNPATH_API_TOKEN` existe : envoi de l'installeur
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
  par version et `lastVersion` : un numéro n'est jamais réutilisé. Il garde aussi les réglages des versions : les
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
- Chaque instance installée contient `.modpack-downloader.json` (id, version, `managedEntries`, et depuis la 1.0.5
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
- Mod désactivé (constaté sur les profils du PC du propriétaire) : fichier `x.jar.disabled` dans `mods` ; dans
  `installedAddons`, l'entrée du mod a `isEnabled: false`, et son `fileNameOnDisk` et ses `filePaths` prennent
  `.disabled` ; `installedFile.fileName` et `installedFile.fileNameOnDisk` gardent le nom d'origine. Le projet
  CurseForge d'un mod est `addonID`. Un profil peut contenir un `.jar.disabled` dont l'entrée dit encore
  `isEnabled: true` (vu sur un profil) : `readModStates` se fie au nom du fichier.

## Pièges connus

- **Ancien nom gardé exprès** (Modpack Downloader → Modpack Manager en 1.1.0) : seuls les noms affichés ont changé
  (`APP_NAME`, `productName`, `shortcutName`, installeur `Modpack-Manager-Setup-*.exe`). Restent à l'ancien nom :
  `appId` et `APP_USER_MODEL_ID`, le paquet (`Programs\minecraft-modpack-downloader`), l'exécutable
  (`executableName` : les installeurs repèrent l'app installée et ouverte à ce nom, les épingles pointent vers lui),
  `userData` (`LEGACY_APP_NAME`, fixé dans `index.ts`, sinon Electron le tirerait de `productName`), le marqueur
  `.modpack-downloader.json`, les dossiers temporaires, le dépôt GitHub. Les changer casse la mise à jour des apps
  installées. Le raccourci du bureau créé sous l'ancien nom est renommé au lancement (`renameLegacyDesktopShortcut`).

- L'extension VS Code définit `ELECTRON_RUN_AS_NODE=1` : Electron démarre alors comme Node et plante
  (`app` undefined). Retirer cette variable pour lancer l'app depuis un outil.
- npm 11 n'exécute que les scripts d'install listés dans `allowScripts` (package.json). Electron télécharge son binaire
  au premier lancement.
- TypeScript est épinglé en 6.x (la 7 est le compilateur natif, pas encore validé ici). archiver 8 est en ESM
  (exports nommés `ZipArchive`). lucide-react v1 n'a plus d'icônes de marques. Tailwind v4 : `px-0!`, `bg-linear-to-r`.
- Tester sans GitHub : un faux serveur de releases (lecture anonyme, écriture avec jeton, `upload_url` et
  téléchargement d'asset par redirection vers lui-même) et `MPD_GITHUB_API=http://localhost:<port>/repos/o/r`
  (+ `GITHUB_TOKEN=x` pour le studio et les scripts). La surcharge est ignorée dans l'app packagée.
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
  d'installation (`Programs\mpd-test`), autres clés de registre, autre `userData` (`%APPDATA%\MPD Test`, à supprimer
  après). Désinstaller ensuite avec `"Uninstall MPD Test.exe" /currentuser /S`. Depuis PowerShell, mettre chaque
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
- Tests de la logique hors du dépôt avec tsx : un fichier `.mts` (await au premier niveau), qui importe les sources
  par `file:///C:/…/src/….ts`. `playerChoices.ts`, `instanceAddons.ts`, `archive.ts`, `sync.ts` et `service.ts` se
  testent ainsi sur des dossiers temporaires ; `installer.ts` (Electron) se teste dans l'app, avec Playwright.
- Tester les réglages des versions de bout en bout : app compilée (`out/`), `--user-data-dir`, réglages publieur avec
  `instancesDir` de test (le profil source du publieur y est aussi), faux GitHub en écriture, `GITHUB_TOKEN=x`,
  `APPDATA` isolé ; Studio (créer, régler, publier) puis Bibliothèque (installer, simuler les choix du joueur dans le
  profil, mettre à jour). Attendre un élément de la fenêtre de dialogue, pas un texte de la page : le nom d'un profil
  figure aussi sur la carte du modpack.
- archiver : `append(flux)` branche aussitôt la source sur un PassThrough. Pour recopier un zip entrée par entrée,
  ajouter une entrée à la fois (attendre l'événement `entry`), sinon tous les flux du zip source s'ouvrent ensemble.
