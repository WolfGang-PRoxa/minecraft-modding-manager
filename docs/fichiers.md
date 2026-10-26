# Fichiers et dossiers

Où Modding Manager range ce qu’il installe et ce qu’il retient, et comment sont faites les releases qu’il lit.

## Sur le PC

| Emplacement | Contenu |
|---|---|
| `%LOCALAPPDATA%\Programs\minecraft-modding-manager` | L’application elle-même, remplacée à chaque mise à jour, avec `mpm.cmd` (les [commandes](commandes.md) dans un terminal). |
| `%APPDATA%\Modding Manager\settings.json` | Les réglages (voir ci-dessous). |
| `%APPDATA%\Modding Manager\github-auth.json` | La connexion GitHub faite dans l’application : le nom du compte et le jeton, chiffré par Windows. |
| `%APPDATA%\Modding Manager\curseforge-auth.json` | Publieurs : la clé de l’API CurseForge et le jeton d’auteur, chiffrés par Windows (voir [Compte CurseForge](parametres.md#compte-curseforge)). |
| `%APPDATA%\Modding Manager\journal.jsonl` | Le journal des opérations d’écriture du Studio, de l’application comme des commandes (voir [Claude Code et commandes](commandes.md#plusieurs-opérations-en-même-temps)). |
| `%APPDATA%\Modding Manager\operation.lock` | Présent pendant une opération d’écriture : dit laquelle, et qui la fait. |
| `%APPDATA%\Modding Manager\maintenance.json` | Publieurs : le dernier passage des [mises à jour automatiques](automatique.md) de chaque modpack (résultat, mises à jour essayées, essai en attente). |
| `%APPDATA%\Modding Manager\maintenance.lock` | Présent pendant un passage des mises à jour automatiques. |
| `%APPDATA%\Modding Manager\cache` | La dernière liste lue sur GitHub (affichée hors ligne) et les descriptions de modpacks déjà téléchargées. |
| `%TEMP%\modding-manager` | Les téléchargements en cours (zips de modpack, installeurs de l’application). Vidé automatiquement. |
| `%LOCALAPPDATA%\Modding Manager\test-servers` | Publieurs : les serveurs Minecraft des [tests](studio.md#tester-un-profil), un par chargeur et par version, téléchargés une fois. |
| `%LOCALAPPDATA%\Modding Manager\test-clients` | Publieurs : les dossiers de jeu des joueurs de la partie de test, vidés à chaque test. |
| `%LOCALAPPDATA%\Modding Manager\test-reports` | Publieurs : le dernier résultat de chaque test, par profil. |
| Dossier `Instances` de CurseForge | Les modpacks installés : un dossier par profil. |
| `.modding-manager`, à côté du dossier `Instances` | Le dossier de travail d’une installation en cours, supprimé à la fin (conservé seulement si une mise à jour échoue, pour ne rien perdre). |
| Dossier des contenus (publieurs) | Les modpacks du publieur, rangés pour le Studio : voir [Le Studio](studio.md#choisir-le-dossier-des-contenus). |

`%APPDATA%\Modding Manager` contient aussi les fichiers internes de la fenêtre de l’application (cache du
navigateur intégré…). Tout ce dossier est conservé lors d’une mise à jour ou d’une désinstallation.

Jusqu’à la 1.9, ces noms étaient ceux de l’ancien nom de l’application, **Modpack Manager**
(`%APPDATA%\Modpack Manager`, `Programs\minecraft-modpack-manager`, `Modpack Manager.exe`, `.modpack-manager.json`),
et jusqu’à la 1.8 ceux de **Modpack Downloader** (`%APPDATA%\Modpack Downloader`,
`Programs\minecraft-modpack-downloader`, `Modpack Downloader.exe`, `.modpack-downloader.json`). La mise à jour vers la 2.0.0 les reprend une fois : voir
[Passage à la 2.0.0](mises-a-jour.md#passage-à-la-200).

## Le fichier settings.json

Les réglages de l’application, partagés avec les [commandes](commandes.md). Mieux vaut les modifier
depuis les paramètres ; pour les modifier à la main, fermer d’abord l’application.

| Champ | Contenu |
|---|---|
| `role` | `receiver` (récepteur), `publisher` (publieur), ou `null` avant le premier lancement. |
| `repo` | Le dépôt des modpacks suivi : `{ "owner": "…", "name": "…" }`. |
| `instancesDir` | Le dossier `Instances` choisi à la main, ou `null` pour la détection automatique. |
| `openCurseForgeAfterInstall` | Ouvrir CurseForge après une installation (`true` par défaut). |
| `shortcutPrompted` | La proposition de raccourci a reçu une réponse. |
| `workspaceDir` | Le dossier des contenus du Studio. |
| `lastView` | La dernière vue affichée (`library` ou `studio`), rouverte au lancement. |
| `lastRunVersion` | La version de l’application au dernier lancement : sert à annoncer une mise à jour. |
| `maintenanceClaude` | Confier à Claude Code les mises à jour automatiques qui échouent (`false` par défaut). |
| `autoUpdate` | Installer d’elle-même une nouvelle version de l’application à son démarrage (`true` par défaut). |
| `launchAtStartup` | Lancer l’application, réduite, au démarrage de Windows (`true` par défaut) : valeur `Modding Manager` de la clé `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. |

## Dans un profil installé

L’application ajoute deux fichiers à chaque profil qu’elle installe :

- **`.modding-manager.json`**, le marqueur : l’identifiant du modpack, sa version, son tag, la date
  d’installation et la liste des éléments fournis par le modpack (`managedEntries`), qui sert à savoir quoi
  remplacer lors d’une mise à jour. Il note aussi ce que la version a installé, pour reconnaître ensuite ce que le
  joueur a changé : l’empreinte de chaque fichier du dossier `config` (`configFiles`) et les mods installés désactivés
  (`disabledByDefault`). Les mods, packs de ressources et shaders ajoutés depuis la Bibliothèque y sont notés
  (`extras` : type, identifiant, version, fichier et empreinte), pour être gardés aux mises à jour. C’est la seule
  preuve qu’un profil a été installé par l’application : sans lui, le profil n’est plus mis à jour sur place,
  seulement reconnu à ses mods, et rien ne peut y être ajouté depuis la Bibliothèque ;
- **`.modpack-cover.png`** (ou `.jpg`, `.webp`) : l’image du modpack, utilisée comme image du profil dans
  CurseForge.

Le fichier `minecraftinstance.json` du profil est celui du publieur, avec les chemins adaptés au PC du joueur. Lors d’une
mise à jour, ses réglages propres au joueur sont conservés : identifiant du profil, date d’installation, date de
dernière partie, nombre de parties, mémoire allouée, arguments Java et image du profil.

## Format d’une release de modpack

Chaque version d’un modpack est une release du dépôt suivi :

- **tag** : `pack-<id>-v<version>`, par exemple `pack-hardcore-endgame-v3` ;
- **titre** : `<nom> v<version>` ;
- **texte** : les notes de version, en Markdown ;
- **fichiers** : le zip de l’instance (`<id>-<version>.zip`), `modpack.json`, et une image `cover.png`, `cover.jpg`
  ou `cover.webp` facultative.

Le fichier `modpack.json` décrit la version :

| Champ | Contenu |
|---|---|
| `schema` | Version du format : `1`. |
| `id` | Identifiant du modpack (lettres minuscules, chiffres, tirets). |
| `name`, `description` | Nom et description affichés. |
| `version` | Numéro de la version. |
| `minecraftVersion`, `modLoader`, `modCount` | Version de Minecraft, mod loader (`forge-47.2.0`, `neoforge-…`, `fabric-…`) et nombre de mods. |
| `archive`, `archiveSize`, `archiveSha256` | Nom, taille et empreinte SHA-256 du zip, vérifiée après chaque téléchargement. |
| `cover`, `coverSha256` | Nom et empreinte de l’image, ou `null`. |
| `modsSignature` | Empreinte des mods (voir ci-dessous). |
| `disabledMods` | Les fichiers du dossier `mods` installés désactivés (voir [Réglages des versions](reglages.md#désactiver-des-mods-chez-les-joueurs)). Absent s’il n’y en a pas. |
| `keepPlayerConfigs` | `true` si une mise à jour garde les configurations modifiées par le joueur. Absent sinon. |
| `author` | Propriétaire du dépôt. |
| `createdAt` | Date de première publication de la version. |

Une release sans `modpack.json` est tout de même acceptée si son tag suit la convention et qu’elle contient un zip :
son nom et sa version sont alors tirés du tag et du titre. Une release en brouillon n’est jamais affichée ; une
préversion est marquée **Bêta**.

## Format d’une release de mod, de pack de ressources ou de shader

Les mods, packs de ressources et shaders publiés par le Studio sont des releases du même dépôt :

- **tag** : `mod-<id>-v<version>` (version déclarée par le jar : `mod-lma-v1.2.0-26.3`), `rp-<id>-v<N>` ou
  `shader-<id>-v<N>` ;
- **titre** : `<nom> <version>` pour un mod, `<nom> v<N>` pour un pack ;
- **fichiers** : les jars ou le zip de la version, l’image facultative, et `content.json`.

Le fichier `content.json` décrit la version : `schema` (`1`), `type` (`mod`, `resourcepack` ou `shader`), `id`,
`name`, `description`, `version`, `minecraftVersions`, `loaders` (`fabric`, `forge`, `iris`…), `files` (pour chaque
fichier : nom, taille, empreintes SHA-256 et SHA-1, chargeurs et versions de Minecraft), `cover` et `coverSha256`,
`author` et `createdAt`. La Bibliothèque ignore une release sans `content.json` lisible ou dont le tag ne lui
correspond pas, et vérifie l’empreinte de chaque fichier téléchargé. Les versions plus anciennes de l’application,
qui ne connaissent que les modpacks, ne les affichent pas : elles n’ont ni le préfixe `pack-` ni `modpack.json`.

Les releases `app-v<version>` du dépôt de l’application contiennent l’installeur de chaque version de l’application,
et ses notes, tirées de l’[historique des versions](../CHANGELOG.md).

## L’empreinte des mods

Pour reconnaître une version dans un profil qu’elle n’a pas installé, l’application calcule l’empreinte de ses mods :
la liste du nom (en minuscules) et de la taille de chaque fichier `.jar` posé directement dans le dossier `mods`,
triée, puis résumée par SHA-256. Les mods désactivés (`.jar.disabled`) et les sous-dossiers ne comptent pas. Un
profil sans mod n’a pas d’empreinte.

Deux profils qui ont la même empreinte ont exactement les mêmes mods. Le calcul ne lit que la liste des fichiers :
il prend quelques dizaines de millisecondes, même pour des milliers de mods.

## Options de lancement

| Option | Effet |
|---|---|
| `--studio` | Ouvre l’application sur le Studio (publieurs). Relancée ainsi alors qu’elle tourne déjà, elle passe sur le Studio. |
| `--updated` | Passée par l’installeur après une mise à jour : l’application annonce sa nouvelle version. |
| `--maintenance` | Passée par la tâche planifiée : l’application fait, sans fenêtre, les [mises à jour automatiques](automatique.md) dont le tour est venu, puis se ferme. |
| `--user-data-dir=<dossier>` | Utilise un autre dossier de données que `%APPDATA%\Modding Manager` (tests). |

L’installeur accepte `/S` (installation silencieuse : ni question ni fenêtre) et `--updated` (mise à jour lancée
par l’application : la fenêtre **Mise à jour** s’affiche, puis l’application est relancée avec `--updated`).
