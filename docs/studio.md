# Le Studio

Le Studio est la vue du publieur. Il montre tes profils CurseForge, rangés comme dans CurseForge, chacun face au
modpack qui en vient : tu vois d’un coup d’œil lequel a changé depuis sa dernière version. Tu y crées les versions de
tes modpacks ; il les numérote et met les releases GitHub en accord avec ton dossier, en quelques clics. Il est réservé au rôle de publieur (voir
[Devenir publieur](publieur.md)) et s’ouvre avec l’onglet **Studio** de la barre de titre.

## Le principe : le dossier fait foi

Le dossier des modpacks, sur ton PC, est la référence. GitHub en est le miroir : à chaque publication, le Studio
compare les deux et propose exactement les changements qui mettent GitHub en accord avec le dossier.

| Sur ton PC | Sur GitHub, à la publication |
|---|---|
| Nouveau zip rangé (`Mon_Pack-v3.zip`) | Nouvelle release `pack-<id>-v3` (zip, `modpack.json`, image) |
| Zip, image, nom, description ou notes modifiés | Release mise à jour |
| Zip supprimé | Release **supprimée**, avec son tag |
| Dossier du modpack supprimé | Toutes ses releases **supprimées** |

Deux exceptions protègent ce qui est publié :

- un modpack **en erreur** (fichier `pack.json` illisible, deux zips pour le même numéro…) n’est jamais touché sur
  GitHub tant que l’erreur n’est pas corrigée ;
- les releases de l’application elle-même (`app-v…`) ne sont jamais touchées.

## Choisir le dossier des modpacks

À la première ouverture, l’écran **Bienvenue dans le Studio** te propose :

- **Utiliser `C:\Users\<toi>\Modpacks`** : le dossier par défaut, créé s’il n’existe pas ;
- **Choisir un autre dossier…** : n’importe quel dossier, sur n’importe quel disque.

Le dossier se change ensuite dans [Paramètres → Dossier des modpacks](parametres.md#dossier-des-modpacks). S’il
devient introuvable (disque débranché, dossier déplacé), le Studio affiche **Dossier des modpacks introuvable** et
te demande où il se trouve.

Ce dossier contient **un sous-dossier par modpack** :

```
Modpacks/
  Hardcore_Endgame/
    Hardcore_Endgame-v1.zip     ← versions rangées (numérotées)
    Hardcore_Endgame-v2.zip
    ma-derniere-maj.zip         ← zip déposé, pas encore rangé
    cover.png                   ← image du modpack (facultative, 16:9)
    pack.json                   ← géré par le Studio : nom, description, notes, réglages
  Autre_Modpack/
  .studio-cache.json            ← analyses des zips, gardées en cache
```

Un zip posé directement à la racine n’appartient à aucun modpack : le Studio le signale (**Zips hors de tout
modpack**) et l’ignore. Les dossiers dont le nom commence par un point sont ignorés.

## L’écran du Studio

À gauche, l’arborescence de tes [profils CurseForge](#tes-profils-curseforge), avec en tête **Tous mes modpacks**.
À droite, ce que tu y as choisi : tous tes modpacks, ou un profil et son modpack.

En haut de la partie droite, **Mes modpacks** et le chemin du dossier (un clic l’ouvre dans l’Explorateur), puis les boutons :

- **Guide** ouvre cette page de l’aide ;
- **Nouveau modpack** crée le dossier d’un nouveau modpack ;
- **Ranger les zips** numérote les zips déposés (le nombre de zips à ranger est indiqué) ;
- **Publier sur GitHub** affiche les changements à publier, puis les applique (leur nombre est indiqué).

Dessous, des encarts résument la situation :

| Encart | Signification |
|---|---|
| **Tout est en ligne.** | GitHub correspond exactement à ton dossier. **Vérifier** relit GitHub. |
| **N changements à publier** | Nouvelles versions, mises à jour et suppressions en attente. **Voir et publier** ouvre l’aperçu. |
| **N zips à ranger** | Des zips déposés attendent leur numéro de version. |
| **GitHub n’est pas connecté.** | Aucune connexion GitHub : **Connecter GitHub** ouvre les paramètres. |
| **GitHub injoignable.** | Pas de connexion internet, ou GitHub a refusé la demande. **Réessayer** relit GitHub. |
| **Le dépôt … est privé** | Tes joueurs ne voient rien : rends le dépôt public sur GitHub. |
| **Ce compte GitHub ne peut pas publier sur …** | Le compte connecté n’a pas l’accès en écriture au dépôt. |
| **Zips hors de tout modpack** | Des zips sont à la racine du dossier : déplace-les dans le dossier de leur modpack. |
| **« … » sera retiré de GitHub.** | Le dossier de ce modpack n’existe plus : ses releases seront supprimées. **Retirer maintenant** le fait tout de suite. |

Le Studio surveille le dossier : un zip copié, renommé ou supprimé dans l’Explorateur apparaît dans la seconde. La
première fois qu’il voit un zip, il l’analyse (contenu, empreinte) : une pastille **Analyse de …** s’affiche en bas
à gauche le temps du calcul, gardé ensuite en cache. Le bouton **Actualiser** de la barre de titre relit le dossier et
GitHub.

## La carte d’un modpack

Chaque modpack a sa carte :

- son **image** (un clic ouvre **Infos et image**), son **nom**, son **identifiant** (en petits caractères) et sa
  description ;
- une ligne qui indique **la version que contient ton CurseForge** (voir plus bas) ;
- les pastilles des [réglages des versions](reglages.md) en service (fichiers exclus, mods désactivés,
  configurations gardées) : un clic ouvre le réglage ;
- les boutons **Infos et image**, **Réglages**, **Créer la vN depuis CurseForge**, **Ouvrir le dossier**, et la
  corbeille (**Supprimer le modpack**) ;
- en rouge, les **erreurs** qui empêchent sa publication ;
- puis une ligne par zip : les zips **à ranger** en premier, les **versions** de la plus récente à la plus ancienne,
  et les versions encore sur GitHub dont le zip a disparu.

Une ligne de version indique le nom du zip, sa taille, la version de Minecraft, le mod loader, le nombre de mods et
la date du fichier, ainsi que les avertissements de l’analyse (mondes inclus, fichiers inutiles, fichiers exclus
dans les réglages…). À droite : son statut, et les boutons **Contenu**, **Notes** (ou **Ajouter des notes**) et la
corbeille.

Tu peux **glisser-déposer** des fichiers sur une carte : les zips sont copiés dans le dossier du modpack, une image
remplace son image de couverture, et les autres fichiers sont ignorés.

## Les statuts

| Statut | Signification |
|---|---|
| **En ligne** | Publiée sur GitHub, identique au dossier. |
| **À publier** | Pas encore sur GitHub : elle sera créée à la prochaine publication. |
| **Modifiée** | Sur GitHub, mais quelque chose a changé (zip, image, nom, description, notes ou réglages des versions). Survole le statut pour voir quoi. |
| **Non publiable** | Le zip est refusé, ou le modpack est en erreur. |
| **GitHub non vérifié** | GitHub n’a pas encore pu être lu. |
| **Sera retirée** | Sa release est sur GitHub mais son zip n’est plus dans le dossier : elle sera supprimée. |
| **À ranger** | Zip déposé, pas encore numéroté. La ligne indique le numéro qu’il recevra. |
| **Refusé** | Zip inutilisable (voir [Ce que doit contenir un zip](versions.md#ce-que-doit-contenir-un-zip)). |
| **Version sur CurseForge** | Cette version est celle de l’un de tes profils CurseForge. |

## Tes profils CurseForge

La colonne de gauche reprend les dossiers dans lesquels tu ranges tes profils dans CurseForge, puis les profils
rangés dans aucun dossier (**Sans dossier**). Un clic sur un dossier le replie ; **Chercher un profil…** filtre par
nom de profil ou de modpack ; la flèche circulaire relit les profils (après un changement dans CurseForge).

Chaque profil indique sa version de Minecraft, son mod loader et, s’il en a un, le modpack qui en vient. Une pastille
résume son état :

| Pastille | Signification |
|---|---|
| Verte | **À jour** : le profil a exactement les mods de la dernière version du modpack. |
| Bleue | **Changé** : ses mods ne sont ceux d’aucune version. Tu l’as modifié depuis la dernière : de quoi créer la suivante. |
| Orange | Il a les mods d’une version **plus ancienne** que la dernière. |
| Grise | Son modpack n’a encore **aucune version**. |

`CF` marque un profil installé depuis un modpack publié sur CurseForge ; une flèche, un profil installé par
l’application depuis GitHub (la copie d’un joueur, jamais la source d’un modpack).

Un clic sur un profil affiche son détail, l’action qui convient à son état, puis la carte de son modpack :

- **Créer un modpack depuis ce profil** : demande son nom (celui du profil, par défaut), crée le modpack et zippe
  tout de suite sa v1 ; le profil en devient la source ;
- **Créer la vN depuis ce profil** : la version suivante, avec ce profil déjà choisi (voir
  [Créer la version depuis CurseForge](versions.md#créer-la-version-depuis-curseforge)) ;
- **Lier** : choisir le modpack qui vient de ce profil, s’il existe déjà ;
- **Confirmer** : le Studio a deviné ce lien (mêmes mods qu’une version, ou même nom) ; le confirmer le garde, même si
  le profil change ou est renommé ;
- **Délier** retire le lien ; **Sur CurseForge** ouvre la page du modpack d’un profil installé depuis CurseForge ;
  **Ouvrir le dossier** ouvre le dossier du profil.

Créer une version depuis un profil le lie au modpack : c’est toujours le profil de la dernière version qui fait foi.
Les modpacks dont le profil n’est pas (ou plus) dans CurseForge sont listés en bas, sous **Modpacks sans profil**.

> [!NOTE]
> L’application ne modifie jamais tes profils ni tes dossiers CurseForge : elle les lit seulement.

### Mettre à jour les mods

Le détail d’un profil a une partie **Mises à jour des mods**. Elle demande la clé de l’API CurseForge (voir
[Compte CurseForge](parametres.md#compte-curseforge)).

1. **Chercher les mises à jour** interroge CurseForge : pour chaque mod, pack de textures et shader installé depuis
   CurseForge, la version la plus récente pour la même version de Minecraft et le même chargeur. Une mise à jour qui
   demande un mod absent du profil l’ajoute (**ajouté**, avec le mod qui le demande). **Bêtas comprises** accepte
   aussi les versions bêta. Les mods posés à la main dans `mods` sont signalés mais jamais mis à jour.
2. Décoche ce que tu ne veux pas. Une mise à jour **à faire dans CurseForge** ne peut pas être cochée : son auteur
   n’autorise le téléchargement que depuis CurseForge.
3. **Créer l’essai** crée à côté de ton profil une copie, `<profil> (essai)`, avec les mises à jour cochées. Ton profil
   n’est pas touché.
4. **Relancer CurseForge** : l’essai y apparaît (dans le même dossier que ton profil). Joue dessus pour vérifier que
   tout fonctionne.
5. **Garder l’essai** reporte dans ton profil les mods, packs de textures et shaders mis à jour ; tes mondes, tes
   réglages et tes mods désactivés restent les tiens. Ferme Minecraft avant : CurseForge est fermé le temps de
   l’écriture, puis rouvert. L’essai part à la corbeille. Il ne reste qu’à créer la nouvelle version du modpack.
   **Abandonner** met l’essai à la corbeille sans rien changer à ton profil.

Une seule copie d’essai à la fois par profil : garde-la ou abandonne-la avant d’en créer une autre. Dans la colonne
de gauche, un flacon marque le profil qui a un essai en cours, et l’essai lui-même.

### Tester un profil

Le détail d’un profil a une partie **Tests**, à lancer avant de garder un essai ou de publier une version. Pour un
essai, elle teste l’essai lui-même.

- **Vérifier les fichiers** lit les mods sans lancer le jeu, en quelques secondes : un mod présent deux fois, une
  dépendance obligatoire absente, un mod fait pour un autre chargeur (un mod Fabric dans un profil Forge…). Il liste
  aussi les mods qui ne fonctionnent que dans le jeu.
- **Tester sur un serveur** démarre un vrai serveur Minecraft avec les mods et les configurations du profil, sans
  fenêtre ni compte, jusqu’à ce qu’il soit prêt, puis l’arrête. Il trouve la plupart des incompatibilités entre mods.
  Compte quelques minutes ; la première fois pour une version de Fabric, Forge ou NeoForge, le serveur est téléchargé
  (puis gardé dans `%LOCALAPPDATA%\Modpack Manager\test-servers`). Les mods réservés au jeu (Sodium, Iris, Oculus…)
  sont laissés de côté. S’il plante, **Fin du journal du serveur** montre le rapport de plantage, avec les mods
  suspectés. **Arrêter le test** l’interrompt.

Le Java utilisé est celui que CurseForge a installé pour cette version de Minecraft, ou à défaut un Java installé sur
ton PC. Le serveur de test accepte pour toi le [contrat d’utilisation de Minecraft](https://aka.ms/MinecraftEULA). Le
résultat de chaque test reste affiché. Ce test ne lance pas le jeu lui-même : joue quelques minutes sur l’essai pour
vérifier l’affichage et les mods du jeu.

### Sur la carte du modpack

Le Studio reconnaît aussi, parmi tes profils, ceux qui contiennent une version de tes modpacks : il compare leurs
mods (nom et taille de chaque `.jar` du dossier `mods`) à ceux de chaque zip. La carte l’indique :

> Ton CurseForge contient la **v3** (profil « Hardcore Endgame »), en ligne sur GitHub.

Tu vois ainsi d’un coup d’œil si ce que tu as sous la main est déjà publié. Si un profil porte le nom du modpack
mais qu’aucune version du dossier n’a ses mods, le Studio le signale : tu as sans doute modifié le profil depuis la
dernière version, et **Créer la vN depuis CurseForge** la publiera.

> [!NOTE]
> Seuls les mods comptent : après un changement de configuration seul, le profil est toujours reconnu comme la même
> version. Crée quand même une nouvelle version pour publier ce changement.

## Créer un modpack

**Nouveau modpack** demande le nom affiché du modpack (« Hardcore Endgame ») et crée son dossier
(`Hardcore_Endgame` : espaces remplacées par des soulignés, caractères interdits retirés) avec son fichier
`pack.json`. Tu peux aussi créer le sous-dossier toi-même dans l’Explorateur : le Studio le reconnaît comme un
nouveau modpack.

Il reste à y mettre une première version : voir [Préparer une version](versions.md).

## Le fichier pack.json

Chaque dossier de modpack contient un fichier `pack.json`, géré par le Studio :

| Champ | Contenu |
|---|---|
| `id` | L’**identifiant** du modpack : lettres minuscules, chiffres et tirets (64 caractères au plus). Il est dérivé du nom à la création, et figure dans les tags GitHub (`pack-<id>-v3`) comme dans les profils des joueurs. **Il ne change jamais** : le modifier après une publication ferait apparaître un nouveau modpack chez les joueurs. |
| `name` | Le nom affiché aux joueurs. |
| `description` | La description courte. |
| `lastVersion` | Le plus grand numéro de version jamais attribué : un numéro n’est jamais réutilisé. |
| `notes` | Les notes de chaque version, en Markdown, par numéro. |
| `exclude` | Les [fichiers exclus](reglages.md#exclure-des-fichiers) : des chemins depuis la racine de l’instance. Absent s’il n’y en a pas. |
| `disabledMods` | Les [mods désactivés chez les joueurs](reglages.md#désactiver-des-mods-chez-les-joueurs) : pour chacun, son projet CurseForge (`addonId`, ou `null`), son fichier (`file`) et son nom (`name`). Absent s’il n’y en a pas. |
| `keepPlayerConfigs` | `true` pour [garder les configurations modifiées par les joueurs](reglages.md#garder-les-configurations-des-joueurs). Absent sinon. |

Tu peux le modifier à la main avec précaution : un fichier illisible, un identifiant invalide ou déjà utilisé par un
autre dossier bloquent la publication du modpack, avec un message qui dit quoi corriger.
