# Claude Code et commandes

Tout ce que fait le Studio existe aussi sous forme de commandes : Claude Code peut s’en servir pour gérer tes
modpacks à ta demande, et tu peux les lancer toi-même dans un terminal. Elles travaillent sur le même dossier, le
même dépôt et la même connexion GitHub que l’application : tu passes librement de l’un à l’autre.

## Connecter Claude Code

Si [Claude Code](https://claude.com/claude-code) est installé sur ton PC, ouvre **Paramètres → Claude Code et
terminal** (mode publieur) et clique sur **Connecter**. L’application s’inscrit dans la configuration de Claude Code
(un serveur MCP nommé `modpack-manager`) ; la connexion reste valable après les mises à jour de l’application.
**Reconnecter** la refait, par exemple si l’application a changé de dossier.

Dans une nouvelle session Claude Code, demande par exemple :

- « Où en sont mes modpacks ? »
- « Crée la v12 de LMA-26.3 depuis mon profil CurseForge, écris les notes et montre-moi ce qui sera publié. »
- « Désactive Sodium chez les joueurs pour Hardcore Endgame. »
- « Pourquoi la dernière publication a échoué ? »

Claude utilise exactement les commandes de cette page. Avant une publication, il te montre le plan (ce qui sera créé,
mis à jour ou supprimé sur GitHub) ; les suppressions sont définitives sur GitHub, il te demande ton accord. Claude
Code te demande aussi ta permission la première fois qu’il utilise chaque outil.

Sans Claude Code installé, l’application affiche la commande qui fait la même connexion, à taper une fois Claude Code
installé.

## Dans un terminal

L’application installée contient `mpm.cmd`, à côté de son exécutable :

```bash
%LOCALAPPDATA%\Programs\minecraft-modpack-downloader\mpm.cmd status
```

Sans argument, `mpm` liste ses commandes ; `mpm <commande> --help` détaille une commande. Depuis le code source de
l’application, c’est `npm run mpm -- <commande>` (voir [Développement](developpement.md)).

Deux raccourcis enchaînent l’aperçu, une confirmation et l’opération :

```bash
mpm ranger     # numérote les zips déposés à la main
mpm publier    # met GitHub en accord avec le dossier
```

Depuis le code source, `npm run modpacks:ranger` et `npm run modpacks:publier` font la même chose.

## Les commandes

| Commande | Effet |
|---|---|
| `status` | État général : dossier des modpacks, connexion GitHub, ce qui attend d’être rangé ou publié. |
| `packs list` | Les modpacks, avec leur dernière version et son état sur GitHub. |
| `packs show` | Un modpack en détail : fiche, réglages, versions et notes. |
| `packs create` | Crée un modpack, éventuellement depuis un profil CurseForge (avec sa v1). |
| `packs edit` | Change le nom ou la description d’un modpack. |
| `packs settings` | [Réglages des versions](reglages.md) : fichiers exclus, mods désactivés chez les joueurs, configurations gardées. |
| `packs notes` | Écrit les notes d’une version. |
| `packs cover` | Change ou retire l’image d’un modpack. |
| `packs link` | Lie un modpack au profil CurseForge d’où viennent ses versions, ou retire ce lien. |
| `packs delete` | Supprime un modpack (dossier à la corbeille, releases retirées de GitHub). |
| `profiles list` | Les profils CurseForge du PC, rangés par dossier comme dans CurseForge, chacun face à son modpack : à jour, ou changé depuis sa dernière version. |
| `versions create` | Crée la prochaine version d’un modpack depuis un profil CurseForge. |
| `versions contents` | Les mods et les fichiers d’un zip. |
| `versions file` | Le texte d’un fichier d’un zip (configuration, script…). |
| `versions strip` | Retire d’un zip les fichiers exclus dans les réglages. |
| `versions delete` | Supprime une version (zip à la corbeille, release retirée de GitHub). |
| `updates check` | Cherche sur CurseForge les mises à jour des mods, packs de textures et shaders d’un profil, pour la même version de Minecraft et le même chargeur, avec les dépendances qui manqueraient. Ne change rien. |
| `updates changelog` | Les notes de version d’un fichier CurseForge, pour juger une mise à jour. |
| `updates apply` | Crée la copie d’essai `<profil> (essai)`, avec les mises à jour : le profil d’origine n’est pas touché. |
| `updates promote` | Reporte l’essai validé dans le profil d’origine, puis met l’essai à la corbeille. |
| `updates discard` | Abandonne l’essai (corbeille). |
| `tests check` | Vérifie les fichiers d’un profil sans lancer le jeu : doublons, dépendances manquantes ou dans une version refusée, incompatibilités, mauvais chargeur. |
| `tests server` | Démarre un serveur dédié avec les mods du profil, puis l’arrête : le test qui trouve la plupart des incompatibilités. |
| `tests players` | Partie de test : le serveur démarre, puis de vrais clients Minecraft le rejoignent et jouent un moment. |
| `tests all` | Tous les tests d’un profil à la suite : fichiers, puis partie avec des joueurs (serveur compris). |
| `maintenance status` | Les [mises à jour automatiques](automatique.md) : réglages de chaque modpack, dernier et prochain passage, tâche planifiée. |
| `maintenance configure` | Règle les mises à jour automatiques d’un modpack : fréquence, bêtas, publication automatique, mods figés. |
| `maintenance run` | Lance un passage : mises à jour, copie d’essai et tests, pour les modpacks donnés, ceux dont le tour est venu (`--due`), ou tous. |
| `maintenance validate` | Valide l’essai en attente d’un modpack : il devient la version suivante, publiée (sauf `--no-publish`). |
| `maintenance discard` | Abandonne l’essai en attente d’un modpack. |
| `maintenance schedule` | Crée (`--time 04:00`, `--wake`) ou retire (`--off`) la tâche planifiée de Windows. |
| `ranger plan`, `ranger apply` | Aperçu, puis numérotation des zips déposés à la main. |
| `publish plan`, `publish apply` | Aperçu de la publication, puis publication. |
| `curseforge link` | Lie un modpack à son projet CurseForge (numéro, adresse de la page ou slug). |
| `curseforge targets` | Où le modpack est publié (GitHub ou non) et les fichiers joints à son export CurseForge. |
| `curseforge export` | Crée l’export CurseForge d’une version dans un fichier, pour le vérifier. |
| `curseforge publish` | Met une version en ligne sur CurseForge (elle passe en modération). |
| `curseforge versions` | Les versions du projet CurseForge, envoyées par l’application ou depuis le site, et leur état (en modération, approuvée, refusée…). |
| `releases delete` | Retire de GitHub des releases dont le zip n’est plus dans le dossier. |
| `curseforge status` | Si la clé de l’API CurseForge et le jeton d’auteur sont là et acceptés (sans jamais les afficher). |
| `journal` | Les dernières opérations, de l’application comme des commandes. |

Un modpack se désigne par le nom de son dossier, son identifiant ou son nom affiché, sans tenir compte de la casse :
`mpm packs show lma-26.3`. Un profil CurseForge, par son nom (celui de son dossier) ou le chemin de son dossier. Les paramètres obligatoires peuvent se donner sans leur nom, dans l’ordre.

**`updates check`** demande la clé de l’API CurseForge (voir [Compte CurseForge](parametres.md#compte-curseforge)).
Elle vérifie le profil source d’un modpack (`--pack`) ou un profil donné (`--profile`), en versions stables
seulement, sauf avec `--beta`. Les fichiers posés à la main dans `mods` (inconnus de CurseForge) sont listés mais
jamais mis à jour.

Les mises à jour ne s’appliquent jamais directement à ton profil : **`updates apply`** crée à côté de lui une copie
d’essai, `<profil> (essai)`, avec les nouveaux fichiers (téléchargés depuis CurseForge et vérifiés). Relance CurseForge
pour la voir et y jouer. Une mise à jour dont l’auteur interdit le téléchargement hors de CurseForge est laissée de
côté : fais-la dans CurseForge. Ensuite :

- **`updates promote`** reporte dans ton profil les fichiers changés ou ajoutés par l’essai ; tes mondes, tes réglages
  et tes mods désactivés restent les tiens. CurseForge est fermé le temps de l’écriture, puis rouvert (refusé si
  Minecraft tourne depuis le profil ou son essai). L’essai part à la corbeille. Crée ensuite la nouvelle version du
  modpack (`versions create`) ;
- **`updates discard`** met l’essai à la corbeille sans rien changer à ton profil.

Avant de garder un essai ou de publier une version, teste le profil (ou son essai) :

- **`tests check`** lit les mods sans lancer le jeu, en quelques secondes : un mod présent deux fois, une dépendance
  obligatoire absente ou dans une version que le mod refuse, un mod fait pour une autre version de Minecraft ou du
  chargeur, deux mods déclarés incompatibles, un mod fait pour un autre chargeur (Fabric dans un profil Forge…). Il
  liste aussi les mods qui ne fonctionnent que dans le jeu.
- **`tests server`** démarre un vrai serveur Minecraft avec les mods du profil, sans fenêtre ni compte, jusqu’à ce
  qu’il soit prêt, puis l’arrête. Quelques minutes ; la première fois pour une version de Fabric, Forge ou NeoForge, il
  télécharge le serveur (gardé ensuite dans `%LOCALAPPDATA%\Modpack Manager\test-servers`). Les mods réservés au jeu
  (Sodium, Iris, Oculus…) sont laissés de côté. En cas de plantage, le rapport donne sa cause et les mods suspectés ;
  sinon, `logIssues` relève les erreurs de son journal. Ce serveur local accepte pour toi le
  [contrat d’utilisation de Minecraft](https://aka.ms/MinecraftEULA).
- **`tests players`** fait en plus jouer de vrais clients Minecraft sur ce serveur (`--players 1` à `4`, 2 par
  défaut ; `--play-seconds` pour le temps de jeu) : des jeux hors ligne, sans compte, avec tous les mods du profil.
  Ils sont dispersés dans le monde, de nuit, puis on vérifie qu’aucun n’a planté ni n’a été déconnecté. `unavailable`
  dit que le test n’a pas pu se faire ici (profil jamais lancé depuis CurseForge, mémoire insuffisante). Voir
  [Tester un profil](studio.md#tester-un-profil).
- **`tests all`** enchaîne `tests check` et `tests players`, comme **Tout tester** dans le Studio.

Pour publier sur CurseForge, le projet doit exister (on le crée une fois sur le site de CurseForge) et ton jeton
d’auteur être enregistré ([Compte CurseForge](parametres.md#compte-curseforge)) :

- **`curseforge link`** lie le modpack au projet. Pour un projet qui a déjà des versions, la numérotation continue
  après la plus haute (après `Mon Pack_V27.zip`, la prochaine version est la v28), et les fichiers joints à l’export
  sont ceux de la dernière version publiée (packs de textures, réglages des shaders…). `curseforge targets` les
  change, et `--no-github` publie le modpack seulement sur CurseForge : ses releases GitHub ne sont alors plus jamais
  touchées.
- **`curseforge publish`** exporte la version au format de CurseForge (`manifest.json`, `modlist.html`, fichiers
  joints : comme l’export de CurseForge), l’affiche sous le nom `<nom>_V<N>.zip` avec ses notes, et l’envoie. Un mod
  qui ne vient pas de CurseForge bloque l’envoi : la modération le refuserait. La version passe ensuite en modération ;
  `curseforge versions` liste toutes les versions du projet (aussi celles mises en ligne depuis le site) et suit leur
  état. Un numéro déjà sur CurseForge ne s’y publie plus. Le pack serveur se joint encore à la main sur le site.

Les commandes **`maintenance`** font les [mises à jour automatiques](automatique.md) : `maintenance run` enchaîne,
pour chaque modpack, `updates check`, `updates apply`, `tests check` et `tests players` sur l’essai, puis laisse la
mise à jour prête (`maintenance validate` ou `maintenance discard` ensuite), ou la publie si le modpack est réglé
ainsi (`maintenance configure --auto-publish`). `maintenance schedule` ne marche que depuis l’application installée :
la tâche planifiée lance son exécutable.

**`publish apply`** demande l’empreinte que donne `publish plan` : si le dossier ou GitHub change entre les deux, la
publication est refusée et il faut refaire l’aperçu. C’est ce qui garantit que ce qui est publié est bien ce que tu
as vu.

## Les options

| Option | Effet |
|---|---|
| `--json` | Résultat en JSON, pour un programme. Une erreur donne `{ "ok": false, "error": "…" }`. |
| `--yes`, `-y` | Ne demande pas de confirmation (suppressions, publication). |
| `--dir <dossier>` | Dossier des modpacks à utiliser. |
| `--repo <propriétaire/dépôt>` | Dépôt GitHub sur lequel publier. |

Depuis le code source, les options se placent après `--` : `npm run mpm -- publish plan --dir D:\Modpacks`.

## Dossier, dépôt et connexion

**Le dossier des modpacks** est, dans cet ordre : celui de l’option `--dir`, celui de la variable d’environnement
`MODPACKS_DIR`, celui choisi dans l’application, et enfin `C:\Users\<toi>\Modpacks` s’il existe.

**Le dépôt** est celui de l’option `--repo`, sinon celui choisi dans l’application
(**Paramètres → Utilisation**).

**La connexion GitHub** est la première trouvée parmi :

1. la connexion faite dans l’application ;
2. la variable d’environnement `GITHUB_TOKEN` ;
3. un fichier `.env` dans le dossier courant, contenant `GITHUB_TOKEN=…` (ignoré par git) ;
4. la session GitHub CLI (`gh auth login`).

## Plusieurs opérations en même temps

Une seule opération d’écriture (création de version, rangement, publication, suppression) tourne à la fois, que
ce soit dans l’application, dans un terminal ou chez Claude. Une autre demande pendant ce temps répond
« Patiente : la publication (la ligne de commande) est en cours » ; la mise à jour de l’application attend aussi.

L’application suit les changements faits par les commandes : le Studio se met à jour tout seul.

Chaque opération d’écriture est notée dans un journal (`journal.jsonl`, à côté des
[réglages](fichiers.md#sur-ton-pc)) : quand, par qui (l’application, la ligne de commande ou Claude), et avec quel
résultat. `mpm journal` l’affiche.

## Différences avec le Studio

- Les commandes publient **quel que soit le rôle** choisi dans l’application : ce sont des outils d’auteur.
- Les zips et les dossiers supprimés vont à la corbeille de Windows, comme depuis le Studio.
- L’ordre des zips à ranger se choisit dans le Studio ; `ranger` les numérote du plus ancien au plus récent.
