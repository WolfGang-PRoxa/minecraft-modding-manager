# Développement

Cette page s’adresse à qui veut modifier l’application : prérequis, commandes, organisation du code, documentation,
suivi des changements et publication d’une nouvelle version.

## Prérequis

- Windows 10 ou 11 ;
- [Node.js](https://nodejs.org/) 24 (avec npm 11) et [Git](https://git-scm.com/) ;
- de préférence CurseForge, pour essayer les installations.

```bash
git clone https://github.com/WolfGang-PRoxa/minecraft-modpack-manager.git
cd minecraft-modpack-manager
npm install
npm run dev
```

npm 11 n’exécute que les scripts d’installation autorisés dans `allowScripts` (`package.json`) : le binaire
d’Electron est donc téléchargé au premier lancement. S’il manque, `node -e "require('electron')"` le télécharge.

> [!WARNING]
> Le terminal intégré de VS Code définit `ELECTRON_RUN_AS_NODE=1` : Electron démarre alors comme Node et l’application
> plante au lancement. Retire cette variable avant `npm run dev`.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | L’application en développement, avec rechargement à chaud de l’interface. |
| `npm run studio` | La même chose, ouverte sur le Studio (`--studio`). |
| `npm run typecheck` | Vérification des types : processus principal, scripts, interface et relais. |
| `npm run docs:verifier` | Vérification de la documentation et de l’historique des versions (voir plus bas). |
| `npm test` | Les tests (`test/*.test.ts`, avec `node:test` et tsx) : moteur, commandes, serveur MCP, sur des dossiers temporaires et un faux GitHub. |
| `npm run build` | Types, documentation, tests, puis compilation dans `out/`. |
| `npm run build:win` | L’installeur Windows, dans `dist/` : compilation, images des fenêtres de l’installeur, puis electron-builder. |
| `npm run changelog` | État de l’historique des versions (voir [Suivi des changements](#suivi-des-changements)). |
| `npm run mpm -- <commande>` | Les commandes du moteur (voir [Claude Code et commandes](commandes.md)) ; `npm run mpm -- mcp` démarre le serveur MCP. `npm run modpacks:ranger` et `npm run modpacks:publier` en sont des raccourcis. |
| `npx tsx scripts/generate-installer-images.ts` | Régénère les images des fenêtres de l’installeur (`build/installer/`), à partir du logo `build/icon.png`. `npm run build:win` le fait. |

## Organisation du code

Une application [Electron](https://www.electronjs.org/) : un processus principal, une seule fenêtre, deux vues
(Bibliothèque et Studio). L’interface est en React 19, Tailwind CSS 4 et zustand, compilée par electron-vite.

| Dossier | Contenu |
|---|---|
| `src/main` | Processus principal (Electron) : fenêtre, lecture des releases (`github.ts`), installation (`installer.ts`), mise à jour de l’application (`appUpdate.ts`), signalements (`report.ts`), connexion à Claude Code (`claudeCode.ts`), canaux IPC. |
| `src/core` | Le moteur, en Node pur (sans Electron, vérifié par un test) : réglages, connexion GitHub, CurseForge, choix du joueur, et le Studio (`studio/` : dossier, analyse des zips, rangement, publication). Verrou et journal des opérations, partagés entre processus. |
| `src/core/commands` | Le registre des commandes : une commande = un nom, une description, des paramètres (zod) et une fonction. La ligne de commande et le serveur MCP en sont tirés. |
| `src/cli` | `mpm`, la ligne de commande (`mpm.cmd` dans l’application installée), et `mpm mcp`. |
| `src/mcp` | Le serveur MCP pour Claude Code, et les instructions qu’il donne à Claude. |
| `src/preload` | Le pont entre la fenêtre et le processus principal : `window.api` et `window.studio`. |
| `src/renderer` | L’interface : `src/` (Bibliothèque, composants, état), `src/studio/` (vue Studio), `src/docs/` (aide intégrée). |
| `src/shared` | Code commun : types, configuration (`APP_REPO`…), format des releases, lecture de la documentation et de l’historique des versions. |
| `test` | Les tests, et leurs outils (`support/` : faux GitHub, fausses instances CurseForge). |
| `scripts` | Outils du dépôt : `changelog.ts`, `docs.ts`, et le générateur des images de l’installeur (`generate-installer-images.ts`, qui lit les PNG avec `png.ts`). |
| `docs` | Cette documentation. |
| `relay` | Le service de suivi des signalements, hébergé sur Netlify (voir [relay/README.md](../relay/README.md)). |
| `build` | Logo (`icon.png`, 1024 × 1024 avec transparence : la seule source du logo, pour l’interface, l’exécutable, les raccourcis et l’installeur), et script NSIS de l’installeur (`installer.nsh`), qui dessine ses fenêtres aux couleurs de l’application. Les images de ces fenêtres (`build/installer/`) sont générées, pas versionnées. |
| `.github/workflows` | La publication de l’application sur un tag `app-v*`. |

Le dépôt de l’application (`APP_REPO`) et l’identifiant de l’application OAuth GitHub utilisé par « Se connecter avec
GitHub » (`GITHUB_OAUTH_CLIENT_ID`) sont définis dans `src/shared/config.ts`.

## Documentation

La documentation est faite de pages Markdown, dans `docs/`. Elle se lit telle quelle sur GitHub, et l’application
l’intègre à la compilation : bouton **Aide** de la barre de titre, ou `F1`.

- **Le sommaire** (`docs/README.md`) définit la navigation, sur GitHub comme dans l’application : une rubrique
  (`## …`) par groupe, puis une ligne `- [Titre](page.md) : description` par page, dans l’ordre d’affichage. Une page
  absente du sommaire n’est pas affichée.
- **Chaque page** commence par un titre unique (`# …`), suivi d’un paragraphe d’introduction.
- **Les liens** entre pages sont relatifs (`[texte](curseforge.md#le-dossier-des-instances)`) : ils fonctionnent sur
  GitHub et dans l’application. Les ancres suivent les règles de GitHub : minuscules, ponctuation retirée, espaces
  remplacées par des tirets, accents conservés.
- **Les encadrés** utilisent la syntaxe de GitHub : `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`,
  `> [!CAUTION]`.
- **Pas de HTML** : il n’est pas affiché dans l’application. Les chemins et noms qui contiennent des chevrons
  (`C:\Users\<toi>`) vont entre accents graves.
- Les tableaux, listes, blocs de code et la mise en forme courante de Markdown sont pris en charge.

`npm run docs:verifier` contrôle le sommaire (chaque page existe et y figure), les titres, les liens (fichier et
ancre) et le format de `CHANGELOG.md`. `npm run build` le lance avant chaque compilation : une documentation cassée
bloque la publication.

Une modification de comportement de l’application s’accompagne de la mise à jour de la page qui le décrit.

## Suivi des changements

L’historique des versions est tenu dans [CHANGELOG.md](../CHANGELOG.md), au format
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) : une section par version, de la plus récente à la plus
ancienne, `## [1.2.0] - 2026-10-03`, découpée en rubriques `### Ajouts`, `### Améliorations`, `### Corrections`,
`### Sécurité` et `### Suppressions`. Chaque entrée est une ligne de liste, écrite pour les utilisateurs.

La section `## [Non publié]`, en tête, reçoit les changements qui ne sont pas encore sortis. **Chaque commit qui
change ce que voient les utilisateurs (`feat`, `fix`, `perf`) y ajoute son entrée, dans le même commit.**

Le même texte sert partout :

1. l’application affiche l’historique dans **Aide → Nouveautés**, avec la mention **Ta version** ;
2. à la publication d’une version, la CI tire de `CHANGELOG.md` le texte de la release GitHub ;
3. l’application installée relit ce texte pour présenter les nouveautés d’une mise à jour avant de l’installer, puis
   les met en avant juste après.

### La commande changelog

```bash
npm run changelog                       # état : « Non publié » et commits depuis la dernière version
npm run changelog -- --brouillon        # ajoute à « Non publié » les commits qui n’y sont pas
npm run changelog -- --version 1.2.0    # prépare la version 1.2.0
npm run changelog -- --notes 1.2.0      # affiche le texte de la release GitHub de la 1.2.0
```

- **Sans option**, la commande vérifie le fichier, affiche le contenu de « Non publié », puis liste les commits
  depuis le dernier tag `app-v*`. Un commit `feat`, `fix` ou `perf` est **mentionné** s’il a modifié `CHANGELOG.md`,
  ou si son empreinte figure dans un commentaire du fichier (`<!-- 8f35361 -->`). Les autres types (`chore`, `docs`,
  `refactor`…) sont ignorés.
- **`--brouillon`** ajoute une entrée pour chaque commit non mentionné, dans la rubrique qui correspond à son type
  (`feat` → Ajouts, `fix` → Corrections, `perf` → Améliorations), à partir de son message et suivie de son empreinte en
  commentaire. Reformule ensuite ces entrées pour les utilisateurs.
- **`--version`** transforme « Non publié » en version datée du jour, recrée une section « Non publié » vide, met à
  jour les liens de comparaison en bas du fichier et la version de `package.json` et `package-lock.json`. Elle ne
  crée ni commit ni tag.
- **`--notes`** écrit le texte de la release : les rubriques de la version, puis le mode d’emploi de l’installeur.

Pour qu’un commit qui ne concerne pas les utilisateurs ne soit plus signalé, cite son empreinte dans un commentaire,
par exemple `<!-- sans effet visible : 1a2b3c4 -->` dans la section « Non publié ».

## Publier une nouvelle version

1. `npm run changelog` : vérifie que tous les changements sont mentionnés, et relis la section « Non publié ».
2. `npm run changelog -- --version 1.2.0` : la section devient la version 1.2.0, et `package.json` passe en 1.2.0.
3. Commite : `git commit -am "chore: version 1.2.0"`.
4. Pousse le commit et le tag :

   ```bash
   git tag app-v1.2.0
   git push origin main app-v1.2.0
   ```

Le workflow [`release-app.yml`](../.github/workflows/release-app.yml) vérifie que le tag correspond à `package.json`,
tire les notes de `CHANGELOG.md` (il s’arrête si la version n’y figure pas), construit l’installeur, le fait signer
par SignPath (approbation manuelle sur signpath.io) et publie la release. Les applications installées la proposent
alors en haut de leur fenêtre, avec ses nouveautés.

> [!CAUTION]
> Un tag `app-v*` publie une version pour tous les utilisateurs : ne le pousse qu’une fois la version prête.

## Tester sans risque

- **Sans GitHub** : un faux serveur de releases local et la variable `MPD_GITHUB_API=http://localhost:<port>/repos/o/r`
  (avec `GITHUB_TOKEN=x` pour le Studio et les scripts) remplacent l’API de GitHub. Cette variable est ignorée par
  l’application installée.
- **Données isolées** : `--user-data-dir=<dossier>` donne à l’application d’autres réglages, une autre connexion et
  un autre cache ; `APPDATA=<dossier>` fait de même pour les scripts. Choisis aussi un dossier `Instances` de test
  pour ne pas toucher à ton CurseForge.
- **Installeur** : compile-le sous une autre identité (`-c.appId`, `-c.productName`…) pour ne pas remplacer
  l’installation réelle, puis désinstalle-le avec `/S`. Relancé, il montre la fenêtre **Déjà installé** ; une
  version plus ancienne (`-c.extraMetadata.version=…`) donne les fenêtres de mise à jour et de retour en arrière, et
  l’application de test laissée ouverte, la fenêtre **Application ouverte**.
- **Mise à jour de l’application** : ne clique jamais sur **Mettre à jour** dans une version de test branchée sur le
  vrai GitHub, elle lancerait le vrai installeur.

## Conventions

- Interface, messages et documentation en français, en tutoyant l’utilisateur.
- Messages de commit en français, au format conventionnel : `feat: …`, `fix: …`, `docs: …`, `chore: …`.
- La [politique de signature du code](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager#politique-de-signature-du-code)
  est exigée par SignPath : garde-la à jour dans le README.
- Licence : [MIT](../LICENSE).
