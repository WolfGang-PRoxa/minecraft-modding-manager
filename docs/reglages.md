# Réglages des versions

Pour chaque modpack, les réglages des versions décident de ce que reçoivent les joueurs : les fichiers de ton
instance qui ne sont jamais publiés, les mods installés désactivés, et le sort de leurs configurations à chaque mise
à jour.

## Ouvrir les réglages

Sur la carte du modpack, clique sur **Réglages**. La fenêtre **Réglages des versions** a trois onglets :

- **Fichiers exclus** : ce qui n’est jamais publié ;
- **Mods désactivés** : les mods que les joueurs reçoivent désactivés ;
- **Configurations des joueurs** : garder ou non les configurations qu’ils ont modifiées.

Les fichiers et les mods affichés sont ceux du zip le plus récent du modpack (le dernier zip à ranger, sinon la
dernière version). **Enregistrer** range les réglages dans `pack.json` (voir
[Le fichier pack.json](studio.md#le-fichier-packjson)).

Une fois enregistrés, les réglages en service s’affichent sur la carte du modpack sous forme de pastilles
(« 2 exclusions », « 1 mod désactivé chez les joueurs », « Configurations des joueurs gardées ») : un clic ouvre
l’onglet correspondant.

## Exclure des fichiers

Certains fichiers de ton profil CurseForge n’ont rien à faire chez les joueurs : tes options du jeu
(`options.txt`, avec tes touches et ta distance d’affichage), tes packs de shaders, un mod que tu es seul à utiliser,
un fichier de configuration personnel…

L’onglet **Fichiers exclus** montre le contenu du zip, dossier par dossier : décoche ce que tu ne veux pas publier.
Un dossier décoché est exclu avec tout son contenu ; une case à moitié cochée signale un dossier dont une partie
seulement est exclue. Un clic sur le nom d’un dossier l’ouvre, le fil d’Ariane permet de remonter.

À droite, la liste **Exclus** reprend chaque chemin exclu, avec le nombre de fichiers concernés dans le zip affiché.
La croix le publie de nouveau. Le champ **Chemin à exclure** accepte aussi un chemin saisi à la main, depuis la racine
de l’instance :

| Chemin | Ce qui est exclu |
|---|---|
| `shaderpacks` | Le dossier `shaderpacks` et tout son contenu. |
| `options.txt` | Le fichier `options.txt` à la racine de l’instance. |
| `config/minimap.toml` | Un seul fichier de configuration. |
| `config/*-client.toml` | Les fichiers du dossier `config` dont le nom finit par `-client.toml` (`*` remplace n’importe quels caractères d’un nom, `?` un seul). |
| `**/*.log` | Tous les fichiers `.log`, dans n’importe quel dossier (`**/` remplace n’importe quels dossiers). |

La casse ne compte pas : `Shaderpacks` et `shaderpacks` désignent le même dossier.

Les exclusions s’appliquent **aux prochaines versions** : quand tu crées une version avec **Créer la vN depuis
CurseForge**, les fichiers exclus sont laissés de côté, en plus des données propres à ta partie (mondes, captures,
journaux, cartes…, voir [Créer la version depuis CurseForge](versions.md#créer-la-version-depuis-curseforge)). Une
version déjà publiée ne change pas.

### Un zip qui contient des fichiers exclus

Un zip que tu as préparé toi-même, ou une version créée avant que tu ajoutes une exclusion, peut contenir des
fichiers exclus. Tant qu’il doit partir à la prochaine publication (zip à ranger, ou version pas encore publiée), sa
ligne le signale :

> Contient 2 fichiers exclus dans les réglages (shaderpacks, options.txt) : ils seront publiés avec cette version.
> Retirer du zip

**Retirer du zip** ouvre une confirmation qui liste les chemins concernés ; **Retirer N fichiers** réécrit le zip
sans eux, avec une barre de progression. Le reste du zip ne change pas, et le zip d’origine n’est remplacé qu’une fois
le nouveau complet : **Annuler** ne laisse rien d’abîmé. L’aperçu de la publication rappelle aussi, version par
version, les fichiers exclus qui partiraient avec elle.

Dans la fenêtre **Contenu** d’un zip, les fichiers et dossiers exclus portent la mention **Exclu**.

## Désactiver des mods chez les joueurs

Un mod désactivé est **installé mais ne se lance pas** : c’est un mod optionnel, que chaque joueur active s’il le
veut. Par exemple une minicarte, un mod d’affichage ou un mod d’optimisation qui ne convient pas à tous les PC.

Dans l’onglet **Mods désactivés**, chaque mod du zip a un interrupteur : coupé, le mod est désactivé chez les joueurs
et porte la mention **Désactivé chez les joueurs**. Le champ de recherche filtre la liste par nom, auteur ou fichier.

- Un mod est reconnu par son **projet CurseForge** : il reste désactivé dans les versions suivantes, même quand son
  fichier change à sa mise à jour. Un mod ajouté à la main, inconnu de CurseForge, est reconnu à son nom de fichier.
- Un mod déjà désactivé dans ton propre profil (**Désactivé dans ton profil**) l’est aussi chez les joueurs : pour le
  proposer actif, active-le dans CurseForge, puis crée une nouvelle version.
- Les mods désactivés que le zip affiché ne contient plus sont listés sous la liste, avec une croix pour les retirer
  des réglages.

Chez le joueur, le mod est installé comme CurseForge le fait pour un mod désactivé : son fichier s’appelle
`<mod>.jar.disabled`, et CurseForge l’affiche désactivé dans le profil. Le joueur l’active d’un clic. **Son choix est
gardé** d’une mise à jour à l’autre, dans les deux sens : un mod qu’il a activé reste actif, un mod qu’il a désactivé
reste désactivé. Un mod dont il n’a pas changé l’état suit la nouvelle version.

## Garder les configurations des joueurs

Sans cette option, une mise à jour remplace le dossier `config` du joueur en entier par celui de la nouvelle
version : tes réglages arrivent partout, mais un réglage que le joueur avait changé (sa minicarte, son interface…)
est perdu.

Avec l’option **Garder les configurations modifiées par les joueurs**, une mise à jour regarde chaque fichier du
dossier `config` du joueur :

| Fichier | Après la mise à jour |
|---|---|
| Modifié par le joueur | Il est **gardé** tel quel, même si la nouvelle version en fournit un autre. |
| Fourni par le modpack, jamais touché par le joueur | Il suit la nouvelle version (ou disparaît si la nouvelle version ne le fournit plus). |
| Nouveau dans la nouvelle version | Il est ajouté. |
| Créé chez le joueur (par lui, ou par un mod au premier lancement) | Il est gardé, sauf si la nouvelle version fournit un fichier du même nom : c’est alors le tien. |

L’application sait qu’un fichier a été modifié en le comparant à celui que la version installée avait fourni : elle
note l’empreinte de chaque fichier de configuration à l’installation. Pour un profil installé avant que
l’application le fasse, la première mise à jour se fie à la date des fichiers : un fichier modifié après
l’installation est gardé.

> [!NOTE]
> Un réglage que tu changes dans un fichier qu’un joueur a modifié ne lui arrive donc pas. Pour qu’un changement
> important arrive chez tout le monde, mets-le dans un nouveau fichier, ou demande aux joueurs concernés de supprimer
> leur fichier avant la mise à jour.

Avec ou sans cette option, les options du jeu (`options.txt`…), les mondes, les cartes et l’état des mods sont
toujours gardés (voir [Mettre à jour un modpack](bibliotheque.md#mettre-à-jour-un-modpack)).

## Quand les réglages arrivent chez les joueurs

| Réglage | Ce qui change sur GitHub |
|---|---|
| Fichiers exclus | Rien tout de suite : ils s’appliquent aux prochaines versions créées depuis CurseForge, ou aux zips que tu nettoies avec **Retirer du zip**. |
| Mods désactivés, configurations | À la prochaine publication, le `modpack.json` de **toutes les versions** du modpack est renvoyé (le zip n’est pas renvoyé). L’aperçu le détaille, version par version. |

Les mods désactivés et les configurations gardées demandent aux joueurs une version récente de Modpack Manager ;
l’application leur propose elle-même de se mettre à jour. Une version plus ancienne installe tous les mods actifs et
remplace le dossier `config`, comme avant.
