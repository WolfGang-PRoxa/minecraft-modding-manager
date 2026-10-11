# Fichiers et dossiers

Où Modpack Manager range ce qu’il installe et ce qu’il retient, et comment sont faites les releases qu’il lit.

## Sur ton PC

| Emplacement | Contenu |
|---|---|
| `%LOCALAPPDATA%\Programs\minecraft-modpack-downloader` | L’application elle-même, remplacée à chaque mise à jour. |
| `%APPDATA%\Modpack Downloader\settings.json` | Tes réglages (voir ci-dessous). |
| `%APPDATA%\Modpack Downloader\github-auth.json` | La connexion GitHub faite dans l’application : le nom du compte et le jeton, chiffré par Windows. |
| `%APPDATA%\Modpack Downloader\cache` | La dernière liste lue sur GitHub (affichée hors ligne) et les descriptions de modpacks déjà téléchargées. |
| `%TEMP%\modpack-downloader` | Les téléchargements en cours (zips de modpack, installeurs de l’application). Vidé automatiquement. |
| Dossier `Instances` de CurseForge | Les modpacks installés : un dossier par profil. |
| `.modpack-downloader`, à côté du dossier `Instances` | Le dossier de travail d’une installation en cours, supprimé à la fin (conservé seulement si une mise à jour échoue, pour ne rien perdre). |
| Dossier des modpacks (publieurs) | Tes modpacks, rangés pour le Studio : voir [Le Studio](studio.md#choisir-le-dossier-des-modpacks). |

`%APPDATA%\Modpack Downloader` contient aussi les fichiers internes de la fenêtre de l’application (cache du
navigateur intégré…). Tout ce dossier est conservé lors d’une mise à jour ou d’une désinstallation.

Plusieurs de ces noms viennent de l’ancien nom de l’application, **Modpack Downloader** : le dossier des données,
celui de l’application, l’exécutable (`Modpack Downloader.exe`), les dossiers temporaires et le marqueur des profils.
Ils sont gardés exprès : c’est grâce à eux qu’une mise à jour retrouve tes réglages, ta connexion GitHub, tes modpacks
installés et tes raccourcis.

## Le fichier settings.json

Les réglages de l’application, partagés avec les [commandes en ligne](ligne-de-commande.md). Modifie-les plutôt
depuis les paramètres ; pour les modifier à la main, ferme d’abord l’application.

| Champ | Contenu |
|---|---|
| `role` | `receiver` (récepteur), `publisher` (publieur), ou `null` avant le premier lancement. |
| `repo` | Le dépôt des modpacks suivi : `{ "owner": "…", "name": "…" }`. |
| `instancesDir` | Le dossier `Instances` choisi à la main, ou `null` pour la détection automatique. |
| `openCurseForgeAfterInstall` | Ouvrir CurseForge après une installation (`true` par défaut). |
| `shortcutPrompted` | La proposition de raccourci a reçu une réponse. |
| `workspaceDir` | Le dossier des modpacks du Studio. |
| `lastView` | La dernière vue affichée (`library` ou `studio`), rouverte au lancement. |
| `lastRunVersion` | La version de l’application au dernier lancement : sert à annoncer une mise à jour. |

## Dans un profil installé

L’application ajoute deux fichiers à chaque profil qu’elle installe :

- **`.modpack-downloader.json`**, le marqueur : l’identifiant du modpack, sa version, son tag, la date
  d’installation et la liste des éléments fournis par le modpack (`managedEntries`), qui sert à savoir quoi
  remplacer lors d’une mise à jour. Il note aussi ce que la version a installé, pour reconnaître ensuite ce que tu as
  changé : l’empreinte de chaque fichier du dossier `config` (`configFiles`) et les mods installés désactivés
  (`disabledByDefault`). C’est la seule preuve qu’un profil a été installé par l’application : sans lui, le profil
  n’est plus mis à jour sur place, seulement reconnu à ses mods ;
- **`.modpack-cover.png`** (ou `.jpg`, `.webp`) : l’image du modpack, utilisée comme image du profil dans
  CurseForge.

Le fichier `minecraftinstance.json` du profil est celui du publieur, avec les chemins adaptés à ton PC. Lors d’une
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
| `--user-data-dir=<dossier>` | Utilise un autre dossier de données que `%APPDATA%\Modpack Downloader` (tests). |

L’installeur accepte `/S` (installation silencieuse : ni question ni fenêtre) et `--updated` (mise à jour lancée
par l’application : la fenêtre **Mise à jour** s’affiche, puis l’application est relancée avec `--updated`).
