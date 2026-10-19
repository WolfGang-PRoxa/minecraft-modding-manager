# Préparer une version

Chaque version d’un modpack est un zip rangé dans son dossier : `Hardcore_Endgame-v3.zip` est la v3. Cette page
explique comment obtenir ce zip, le numéroter, et l’accompagner de ses notes et de son image avant de le
[publier](publication.md).

## Ce que doit contenir un zip

Un zip de modpack contient **le dossier de l’instance CurseForge** : le fichier `minecraftinstance.json` doit se
trouver à la racine du zip, ou dans un dossier à la racine. C’est ce qui permet de l’installer chez les joueurs comme
un profil CurseForge, avec ses mods, ses configurations et ses scripts.

Le Studio analyse chaque zip dès qu’il le voit. Un zip est **refusé**, et donc ni rangé ni publié, dans ces cas :

| Message | Cause |
|---|---|
| « Zip de plus de 2 Go : GitHub refuse les fichiers de cette taille. » | GitHub limite chaque fichier d’une release à 2 Go. Seulement pour un modpack publié sur GitHub. |
| « Zip illisible ou incomplet (copie encore en cours ?). » | Le zip est encore en cours de copie, ou abîmé. Attends la fin de la copie. |
| « Zip corrompu : son contenu est illisible. » | Le zip est abîmé : recrée-le. |
| « C’est un export CurseForge (manifest.json)… » | Un export CurseForge (`manifest.json` et `overrides`) ne contient pas les mods eux-mêmes. Zippe le dossier de l’instance, ou utilise **Créer la vN depuis CurseForge**. |
| « minecraftinstance.json introuvable : ce zip ne contient pas une instance CurseForge. » | Le zip ne contient pas de dossier d’instance. |
| « minecraftinstance.json est illisible dans ce zip. » | Le fichier de l’instance est abîmé. |

Un zip accepté peut porter des **avertissements**, affichés sous sa ligne :

- **mondes inclus** (dossier `saves`) : ils seront installés chez les joueurs. C’est voulu pour une carte d’aventure,
  rarement sinon ;
- **dossiers inutiles** (`logs`, `crash-reports`, `screenshots`, `backups`) : ils alourdissent le zip sans rien
  apporter aux joueurs ;
- **aucun mod** dans le dossier `mods` ;
- **fichiers exclus** dans les réglages du modpack, pour un zip à ranger ou une version pas encore publiée :
  **Retirer du zip** les enlève (voir [Un zip qui contient des fichiers exclus](reglages.md#un-zip-qui-contient-des-fichiers-exclus)).

## Créer la version depuis CurseForge

C’est le moyen le plus simple et le plus sûr. Sur la carte du modpack, clique sur **Créer la vN depuis CurseForge**
(ou, dans le [détail d’un profil](studio.md#tes-profils-curseforge), sur **Créer la vN depuis ce profil**, qui le choisit
pour toi) :

1. La fenêtre liste les profils de ton dossier `Instances`, le plus récemment joué en premier, avec leur version de
   Minecraft, leur mod loader et leur nombre de mods.
2. Choisis le profil à publier.
3. Coche **Inclure les mondes (saves)** seulement si les joueurs doivent recevoir tes mondes.
4. Clique sur **Créer `<Dossier>-vN.zip`**. Une barre suit la compression ; **Annuler** l’interrompt sans rien
   laisser derrière.

Le zip est créé directement dans le dossier du modpack, déjà numéroté : pas besoin de le ranger. Le profil devient
la source du modpack : le Studio te dira quand il aura changé depuis cette version. Les données propres
à ta partie sont laissées de côté :

- tes mondes (`saves`), sauf si tu as coché la case ;
- `screenshots`, `logs`, `crash-reports`, `backups`, `local`, `downloads`, `.mixin.out` ;
- les données des cartes JourneyMap (`journeymap/data`) et Xaero’s (`xaero`, `xaerowaypoints`, `xaeroworldmap`) ;
- le cache de Distant Horizons des serveurs visités (`Distant_Horizons_server_data`, souvent plusieurs Go) ;
- les données d’Essential (`essential` : ton compte, tes amis), les enregistrements et réglages du micro de Simple
  Voice Chat (`voicechat_recordings`, `config/voicechat/voicechat-client.properties`) et les données de JEI par monde
  (`config/jei/world`) ;
- `usercache.json`, `usernamecache.json`, `command_history.txt` ;
- les fichiers propres à Modpack Manager (`.modpack-downloader.json`, image du profil) ;
- les fichiers que tu as exclus dans les [réglages du modpack](reglages.md#exclure-des-fichiers) (tes options du jeu,
  tes shaders…) : la fenêtre les rappelle sous la liste des profils, avec un lien vers **Réglages des versions**.

Pour un modpack publié sur GitHub, un zip de plus de 2 Go est refusé : retire alors des fichiers lourds du profil
(shaders, packs de ressources…). Un modpack publié seulement sur CurseForge n’a pas cette limite.

## Déposer un zip

Tu peux aussi préparer le zip toi-même, puis le déposer dans le dossier du modpack :

- avec l’Explorateur (**Ouvrir le dossier** sur la carte du modpack) ;
- ou en le glissant sur la carte du modpack dans le Studio : il y est copié.

Le zip apparaît en tête de la carte avec le statut **À ranger**, et le numéro qu’il recevra (« deviendra la v3 »). Le
bouton **Contenu** permet déjà d’en vérifier le contenu.

> [!WARNING]
> Attends la fin de la copie d’un gros zip avant de le ranger : un zip incomplet est refusé (« Zip illisible ou
> incomplet »). Le Studio le réanalyse de lui-même une fois la copie terminée.

## Ranger les zips

**Ranger les zips** donne un numéro de version à chaque zip déposé. La fenêtre montre d’abord ce qui va changer :

- chaque nouveau zip reçoit le numéro suivant, du plus ancien au plus récent (selon la date du fichier) :
  `ma-derniere-maj.zip → Hardcore_Endgame-v3.zip` ;
- les flèches **↑** et **↓** changent l’ordre des nouveaux zips ;
- un zip déjà numéroté mais qui ne porte pas le nom du dossier est renommé « au nom du dossier » ;
- un avertissement signale un zip plus ancien que la dernière version : il recevra quand même le numéro suivant ;
- les zips refusés sont listés avec la raison du refus.

**Renommer N fichiers** applique le rangement. Les nouvelles versions apparaissent avec le statut **À publier**.

Les règles de numérotation :

- Les numéros sont des entiers qui se suivent : v1, v2, v3…
- **Un numéro n’est jamais réutilisé**, même si sa version est supprimée : après la suppression de la v3, le zip
  suivant devient la v4. Sinon, un joueur qui a l’ancienne v3 croirait être à jour. Le Studio retient le plus grand
  numéro attribué (dans `pack.json`) et tient compte de ceux déjà publiés sur GitHub.
- Un zip déjà nommé `Hardcore_Endgame-v7.zip` est pris tel quel comme v7.
- Deux zips ne peuvent pas porter le même numéro : le modpack est alors en erreur (« Plusieurs zips pour la v3… :
  n’en garde qu’un ») jusqu’à ce que tu en retires un.

## Les notes de version

Les notes disent aux joueurs ce qui change dans une version. Sur la ligne de la version, clique sur **Ajouter des
notes** (ou **Notes** si elles existent déjà) :

- l’onglet **Écrire** reçoit le texte, en Markdown : `## Titre`, `- liste`, `**gras**`, `[lien](https://…)` ;
- l’onglet **Aperçu** montre le rendu, tel que les joueurs le verront ;
- **Enregistrer** les range dans `pack.json`. Elles partent sur GitHub à la prochaine publication.

Un exemple :

```markdown
## Nouveautés

- Ajout de Create et de ses extensions
- Nouvelle quête de fin de jeu

## Corrections

- Le donjon du Nether ne fait plus planter le serveur
```

Les joueurs lisent ces notes dans l’encart **Nouveautés de la vN** de la Bibliothèque et dans le panneau de détails
du modpack. Sur GitHub, le texte de la release reprend les notes, suivies de la version de Minecraft, du mod loader
et du nombre de mods. Les images insérées dans les notes ne sont pas affichées dans l’application.

## Le nom, la description et l’image

**Infos et image** (ou un clic sur l’image de la carte) ouvre la fiche du modpack :

- **Image de couverture** : **Choisir une image…** (PNG, JPG ou WebP), ou **Retirer**. Le format conseillé est le
  16:9, par exemple 1920 × 1080. Une image d’un autre format (carrée, en portrait…) est affichée en entier, réduite
  sur un fond flou tiré d’elle-même. Elle est enregistrée sous le nom `cover.png` (ou `.jpg`, `.webp`) dans le
  dossier du modpack, et devient aussi l’image du profil CurseForge des joueurs.
- **Nom affiché** : le nom que voient les joueurs.
- **Description courte** : une ou deux phrases, affichées sous le nom.

L’**identifiant** du modpack est rappelé en bas : il ne change jamais (voir
[Le fichier pack.json](studio.md#le-fichier-packjson)). Un changement de nom, de description ou d’image est envoyé à
GitHub à la prochaine publication, pour toutes les versions du modpack.

## Voir le contenu d’un zip

Le bouton **Contenu**, sur une version comme sur un zip à ranger, ouvre le zip sans passer par l’Explorateur. Le
sous-titre indique la place qu’il occupera une fois installé.

- **Mods** : chaque mod sous le nom que lui donne CurseForge, avec son auteur, son fichier, sa taille et un lien vers
  sa page CurseForge. Un mod **ajouté à la main** (inconnu de CurseForge), un mod **désactivé** dans CurseForge et un
  mod **désactivé chez les joueurs** par les [réglages du modpack](reglages.md) sont signalés.
- **Fichiers** : l’arborescence de l’instance, dossier par dossier, avec un fil d’Ariane pour remonter. Un clic sur
  un fichier affiche son contenu : un fichier de configuration ou un script (son début seulement s’il est long), ou
  une image (textures, icônes). Les fichiers binaires (mods, mondes, sons) ne sont pas affichés. Un fichier ou un
  dossier exclu dans les réglages porte la mention **Exclu**.

Le champ de recherche filtre les mods, ou cherche un fichier dans tout le zip.

Vérifie le contenu avant de publier : c’est le meilleur moyen de repérer un monde inclus par erreur, un mod oublié ou
un fichier personnel.
