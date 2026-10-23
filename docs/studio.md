# Le Studio

Le Studio est la vue du publieur. Il montre les profils CurseForge, rangés comme dans CurseForge, chacun face au
modpack qui en vient : celui qui a changé depuis sa dernière version se repère d’un coup d’œil. C’est là que se
créent les versions des modpacks ; le Studio les numérote et met les releases GitHub en accord avec le dossier, en
quelques clics. Il est réservé au rôle de publieur (voir [Devenir publieur](publieur.md)) et s’ouvre avec l’onglet
**Studio** de la barre de titre.

## Le principe : le dossier fait foi

Le dossier des modpacks, sur le PC du publieur, est la référence. GitHub en est le miroir : à chaque publication, le
Studio compare les deux et propose exactement les changements qui mettent GitHub en accord avec le dossier.

| Sur le PC | Sur GitHub, à la publication |
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

À la première ouverture, l’écran **Bienvenue dans le Studio** propose :

- **Utiliser `C:\Users\<nom>\Modpacks`** : le dossier par défaut, créé s’il n’existe pas ;
- **Choisir un autre dossier…** : n’importe quel dossier, sur n’importe quel disque.

Le dossier se change ensuite dans [Paramètres → Dossier des modpacks](parametres.md#dossier-des-modpacks). S’il
devient introuvable (disque débranché, dossier déplacé), le Studio affiche **Dossier des modpacks introuvable** et
demande où il se trouve.

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

À gauche, l’arborescence des [profils CurseForge](#les-profils-curseforge), avec en tête **Tous mes modpacks**. À
droite, ce qui y est sélectionné : tous les modpacks, ou un profil et son modpack.

En haut de la partie droite, **Mes modpacks** et le chemin du dossier (un clic l’ouvre dans l’Explorateur), puis les
boutons :

- **Guide** ouvre cette page de l’aide ;
- **Nouveau modpack** crée le dossier d’un nouveau modpack ;
- **Ranger les zips** numérote les zips déposés (le nombre de zips à ranger est indiqué) ;
- **Publier sur GitHub** affiche les changements à publier, puis les applique (leur nombre est indiqué).

Dessous, des encarts résument la situation :

| Encart | Signification |
|---|---|
| **Tout est en ligne.** | GitHub correspond exactement au dossier. **Vérifier** relit GitHub. |
| **N changements à publier** | Nouvelles versions, mises à jour et suppressions en attente. **Voir et publier** ouvre l’aperçu. |
| **N zips à ranger** | Des zips déposés attendent leur numéro de version. |
| **GitHub n’est pas connecté.** | Aucune connexion GitHub : **Connecter GitHub** ouvre les paramètres. |
| **GitHub injoignable.** | Pas de connexion internet, ou GitHub a refusé la demande. **Réessayer** relit GitHub. |
| **Le dépôt … est privé** | Les joueurs ne voient rien : le dépôt doit être rendu public sur GitHub. |
| **Ce compte GitHub ne peut pas publier sur …** | Le compte connecté n’a pas l’accès en écriture au dépôt. |
| **Zips hors de tout modpack** | Des zips sont à la racine du dossier : ils sont à déplacer dans le dossier de leur modpack. |
| **« … » sera retiré de GitHub.** | Le dossier de ce modpack n’existe plus : ses releases seront supprimées. **Retirer maintenant** le fait tout de suite. |

Le Studio surveille le dossier : un zip copié, renommé ou supprimé dans l’Explorateur apparaît dans la seconde. La
première fois qu’il voit un zip, il l’analyse (contenu, empreinte) : une pastille **Analyse de …** s’affiche en bas
à gauche le temps du calcul, gardé ensuite en cache. Le bouton **Actualiser** de la barre de titre relit le dossier et
GitHub.

## La carte d’un modpack

Chaque modpack a sa carte :

- son **image** (un clic ouvre **Infos et image**), son **nom**, son **identifiant** (en petits caractères) et sa
  description ;
- une ligne qui indique **la version présente dans CurseForge** (voir plus bas) ;
- où il est publié (GitHub, [CurseForge](publication.md#publier-sur-curseforge), ou les deux), et le rythme de ses
  [mises à jour automatiques](automatique.md), avec la mise à jour prête à valider s’il y en a une ;
- les pastilles des [réglages des versions](reglages.md) en service (fichiers exclus, mods désactivés,
  configurations gardées) : un clic ouvre le réglage ;
- les boutons **Infos et image**, **Réglages**, **Créer la vN depuis CurseForge**, **Ouvrir le dossier**, et la
  corbeille (**Supprimer le modpack**) ;
- en rouge, les **erreurs** qui empêchent sa publication ;
- puis une ligne par zip : les zips **à ranger** en premier, les **versions** de la plus récente à la plus ancienne,
  et les versions encore sur GitHub dont le zip a disparu.

Une ligne de version indique le nom du zip, sa taille, la version de Minecraft, le mod loader, le nombre de mods et
la date du fichier, ainsi que les avertissements de l’analyse (mondes inclus, fichiers inutiles, fichiers exclus
dans les réglages…). Dessous, ses pastilles (statut sur GitHub, sur CurseForge, tests) ; à droite, les boutons
**Contenu**, **Notes** (ou **Ajouter des notes**) et la corbeille.

Des fichiers peuvent être **glissés-déposés** sur une carte : les zips sont copiés dans le dossier du modpack, une
image remplace son image de couverture, et les autres fichiers sont ignorés.

## Les statuts

| Statut | Signification |
|---|---|
| **En ligne** | Publiée sur GitHub, identique au dossier. |
| **À publier** | Pas encore sur GitHub : elle sera créée à la prochaine publication. |
| **Modifiée** | Sur GitHub, mais quelque chose a changé (zip, image, nom, description, notes ou réglages des versions). Le survol du statut montre quoi. |
| **Non publiable** | Le zip est refusé, ou le modpack est en erreur. |
| **GitHub non vérifié** | GitHub n’a pas encore pu être lu. |
| **Sera retirée** | Sa release est sur GitHub mais son zip n’est plus dans le dossier : elle sera supprimée. |
| **À ranger** | Zip déposé, pas encore numéroté. La ligne indique le numéro qu’il recevra. |
| **Refusé** | Zip inutilisable (voir [Ce que doit contenir un zip](versions.md#ce-que-doit-contenir-un-zip)). |
| **Version sur CurseForge** | Cette version est celle de l’un des profils CurseForge du PC. |

## Les profils CurseForge

La colonne de gauche reprend les dossiers dans lesquels les profils sont rangés dans CurseForge, puis les profils
rangés dans aucun dossier (**Sans dossier**). Un clic sur un dossier le replie ; **Chercher un profil…** filtre par
nom de profil ou de modpack ; la flèche circulaire relit les profils (après un changement dans CurseForge).

Chaque profil indique sa version de Minecraft, son mod loader et, s’il en a un, le modpack qui en vient. Une pastille
résume son état :

| Pastille | Signification |
|---|---|
| Verte | **À jour** : le profil a exactement les mods de la dernière version du modpack. |
| Bleue | **Changé** : ses mods ne sont ceux d’aucune version. Il a été modifié depuis la dernière : de quoi créer la suivante. |
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
> L’application ne modifie jamais les profils ni les dossiers CurseForge : elle les lit seulement.

### Mettre à jour les mods

Le détail d’un profil a une partie **Mises à jour des mods**. Elle demande la clé de l’API CurseForge (voir
[Compte CurseForge](parametres.md#compte-curseforge)).

1. **Chercher les mises à jour** interroge CurseForge : pour chaque mod, pack de textures et shader installé depuis
   CurseForge, la version la plus récente pour la même version de Minecraft et le même chargeur. Une mise à jour qui
   demande un mod absent du profil l’ajoute (**ajouté**, avec le mod qui le demande). **Bêtas comprises** accepte
   aussi les versions bêta. Les mods posés à la main dans `mods` sont signalés mais jamais mis à jour.
2. Décocher ce qui ne doit pas être mis à jour. Une mise à jour **à faire dans CurseForge** ne peut pas être cochée :
   son auteur n’autorise le téléchargement que depuis CurseForge.
3. **Créer l’essai** crée à côté du profil une copie, `<profil> (essai)`, avec les mises à jour cochées. Le profil
   d’origine n’est pas touché.
4. **Relancer CurseForge** : l’essai y apparaît (dans le même dossier que le profil). Une partie dessus permet de
   vérifier que tout fonctionne.
5. **Garder l’essai** reporte dans le profil les mods, packs de textures et shaders mis à jour ; les mondes, les
   réglages et les mods désactivés du profil restent les siens. Fermer Minecraft avant : CurseForge (y compris dans
   Overwolf) est fermé le temps de l’écriture, puis rouvert. C’est tout ou rien : si un fichier reste utilisé par un
   autre programme, le profil est remis comme avant et l’opération peut être relancée. L’essai part à la corbeille.
   Il ne reste qu’à créer la nouvelle version du modpack.
   **Abandonner** met l’essai à la corbeille sans rien changer au profil.

Une seule copie d’essai à la fois par profil : il faut la garder ou l’abandonner avant d’en créer une autre. Dans la
colonne de gauche, un flacon marque le profil qui a un essai en cours, et l’essai lui-même.

### Tester un profil

Le détail d’un profil a une partie **Tests**, à lancer avant de garder un essai ou de publier une version. Pour un
essai, elle teste l’essai lui-même. **Tout tester** enchaîne les trois tests ci-dessous ; chacun se lance aussi seul.

- **Fichiers** lit les mods sans lancer le jeu, en quelques secondes, et vérifie ce que le chargeur vérifiera au
  démarrage : un mod présent deux fois, une dépendance obligatoire absente, une dépendance dans une version que le mod
  refuse (« demande Fabric API 0.130 ou plus »), un mod fait pour une autre version de Minecraft ou du chargeur, deux
  mods déclarés incompatibles, un mod fait pour un autre chargeur (un mod Fabric dans un profil Forge, que le jeu
  ignore). Il liste aussi les mods qui ne fonctionnent que dans le jeu. Dans le doute (version illisible), il ne
  signale rien.
- **Serveur seul** démarre un vrai serveur Minecraft avec les mods et les configurations du profil, sans fenêtre ni
  compte, jusqu’à ce qu’il soit prêt, puis l’arrête. Il trouve la plupart des incompatibilités entre mods. Compter une
  à deux minutes ; la première fois pour une version de Fabric, Forge ou NeoForge, le serveur est téléchargé (puis
  gardé dans `%LOCALAPPDATA%\Modpack Manager\test-servers`). Les mods réservés au jeu (Sodium, Iris, Oculus…) sont
  laissés de côté. S’il plante, **Fin du journal du serveur** montre le rapport de plantage, avec les mods suspectés.
  Même quand il démarre, les erreurs de son journal (recette ou script en erreur, mod qui échoue à se charger…) sont
  relevées : un modpack en écrit souvent beaucoup sans gravité, elles servent surtout à comparer deux tests.
- **Partie avec des joueurs** démarre le serveur, puis de 1 à 4 vrais clients Minecraft (nombre à choisir à côté),
  qui le rejoignent avec tous les mods du profil, ceux du jeu compris. Une fois connectés, les joueurs sont dispersés
  loin les uns des autres, de nuit, pour charger du terrain neuf et faire apparaître des monstres ; au bout d’une
  minute et demie, le test vérifie qu’aucun jeu n’a planté et que personne n’a été déconnecté (mods différents entre
  le jeu et le serveur, par exemple). Compter deux à cinq minutes.

> [!NOTE]
> Les joueurs du test (**Testeur1**, **Testeur2**…) n’ont pas de compte : ce sont des jeux lancés hors ligne, qui ne
> se connectent qu’au serveur de test, sur le même PC. Un seul compte Minecraft suffit donc : celui avec lequel
> CurseForge a installé le jeu. Le profil doit avoir été lancé une fois depuis CurseForge (pour que le jeu soit
> installé). Leurs fenêtres s’ouvrent pendant le test, derrière les autres, puis se ferment seules. Chaque joueur
> utilise jusqu’à 8 Go de mémoire : s’il en manque, la partie se fait avec moins de joueurs. Les shaders ne sont pas
> chargés, pour rester léger.

Le Java utilisé est celui que CurseForge a installé pour cette version de Minecraft, ou à défaut un Java installé sur
le PC. Le serveur de test accepte le [contrat d’utilisation de Minecraft](https://aka.ms/MinecraftEULA) pour son
utilisateur. Le résultat de chaque test reste affiché. **Arrêter le test** l’interrompt.

Les résultats valent pour les mods testés : une version qui a les mêmes mods qu’un profil testé est marquée sur sa
ligne **Testée**, **Testée en partie** (serveur seul), **Tests en échec**, ou, pour la dernière version, **Pas
testée**. La publication le rappelle pour toute version qui n’a pas passé la partie avec des joueurs.

### Sur la carte du modpack

Le Studio reconnaît aussi, parmi les profils, ceux qui contiennent une version des modpacks : il compare leurs mods
(nom et taille de chaque `.jar` du dossier `mods`) à ceux de chaque zip. La carte l’indique :

> Ton CurseForge contient la **v3** (profil « Hardcore Endgame »), en ligne sur GitHub.

Ce qui est déjà publié se voit ainsi d’un coup d’œil. Si un profil porte le nom du modpack mais qu’aucune version du
dossier n’a ses mods, le Studio le signale : le profil a sans doute été modifié depuis la dernière version, et
**Créer la vN depuis CurseForge** la publiera.

> [!NOTE]
> Seuls les mods comptent : après un changement de configuration seul, le profil est toujours reconnu comme la même
> version. Pour publier ce changement, il faut quand même créer une nouvelle version.

## Créer un modpack

**Nouveau modpack** demande le nom affiché du modpack (« Hardcore Endgame ») et crée son dossier
(`Hardcore_Endgame` : espaces remplacées par des soulignés, caractères interdits retirés) avec son fichier
`pack.json`. Un sous-dossier créé à la main dans l’Explorateur est aussi reconnu comme un nouveau modpack.

Il reste à y mettre une première version : voir [Préparer une version](versions.md).

## Le fichier pack.json

Chaque dossier de modpack contient un fichier `pack.json`, géré par le Studio :

| Champ | Contenu |
|---|---|
| `id` | L’**identifiant** du modpack : lettres minuscules, chiffres et tirets (64 caractères au plus). Il est dérivé du nom à la création, et figure dans les tags GitHub (`pack-<id>-v3`) comme dans les profils des joueurs. **Il ne change jamais** : le modifier après une publication ferait apparaître un nouveau modpack chez les joueurs. |
| `type` | Ce que contient le dossier. Absent pour un modpack. Les autres types (`mod`, `resourcepack`, `shader`, `plugin`) sont réservés aux prochaines versions : un dossier qui en déclare un est affiché, mais ignoré à la publication. |
| `name` | Le nom affiché aux joueurs. |
| `description` | La description courte. |
| `lastVersion` | Le plus grand numéro de version jamais attribué : un numéro n’est jamais réutilisé. |
| `notes` | Les notes de chaque version, en Markdown, par numéro. |
| `exclude` | Les [fichiers exclus](reglages.md#exclure-des-fichiers) : des chemins depuis la racine de l’instance. Absent s’il n’y en a pas. |
| `disabledMods` | Les [mods désactivés chez les joueurs](reglages.md#désactiver-des-mods-chez-les-joueurs) : pour chacun, son projet CurseForge (`addonId`, ou `null`), son fichier (`file`) et son nom (`name`). Absent s’il n’y en a pas. |
| `keepPlayerConfigs` | `true` pour [garder les configurations modifiées par les joueurs](reglages.md#garder-les-configurations-des-joueurs). Absent sinon. |
| `profile` | Le profil CurseForge d’où viennent ses versions : `guid` et nom. Absent s’il n’est pas connu. |
| `github` | `false` si le modpack n’est publié que sur CurseForge. Absent sinon. |
| `curseforge` | Son [projet CurseForge](publication.md#publier-sur-curseforge) : numéro, page, fichiers joints à l’export, et le fichier CurseForge de chaque version publiée. Absent s’il n’en a pas. |
| `updates` | Ses [mises à jour automatiques](automatique.md#régler-un-modpack) : `frequency` (`weekly`, `biweekly`, `monthly`, `manual`, `never`), `channel` (`release` ou `beta`), `pinned` (mods figés) et `autoPublish`. Absent tant qu’elles restent à la demande, sans rien d’autre. |

Le fichier peut être modifié à la main, avec précaution : un fichier illisible, un identifiant invalide ou déjà
utilisé par un autre dossier bloquent la publication du modpack, avec un message qui dit quoi corriger.
