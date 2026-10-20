# La bibliothèque

La Bibliothèque liste les modpacks publiés sur le dépôt suivi. Elle les installe dans CurseForge, les met à jour, et
indique ceux qui sont déjà présents sur le PC.

## Ce que montre la bibliothèque

**Le grand bandeau** présente le modpack mis à jour le plus récemment : la date de sa dernière sortie, son nom, sa
version, sa description et ses caractéristiques (version de Minecraft, mod loader, nombre de mods, taille). Sur un
grand écran, un encart **Nouveautés de la vN** reprend le début de ses notes de version ; **Tout lire** ouvre le
panneau de détails.

**Autres modpacks** liste les suivants, du plus récemment mis à jour au plus ancien. Chaque carte montre l’image du
modpack, son numéro de version, sa date de publication, le début de sa description, ses caractéristiques, le bouton
d’installation et un bouton **Détails** (ⓘ).

Des bandeaux s’affichent en haut de la liste quand c’est utile :

- **CurseForge n’est pas installé** : il est nécessaire pour jouer (voir [CurseForge](curseforge.md)) ;
- **Liste non actualisée** : GitHub n’a pas pu être joint, la liste affichée est la dernière connue (voir
  [Actualiser la liste](#actualiser-la-liste)) ;
- **Ajouter un raccourci ?** : proposé tant qu’aucune réponse n’a été donnée (voir
  [Installation](installation.md#le-raccourci-sur-le-bureau)).

## Les pastilles

Les pastilles posées sur un modpack résument ce qui en est déjà installé :

| Pastille | Signification |
|---|---|
| **Version sur CurseForge : v2** | CurseForge contient la v2 de ce modpack. Elle est verte si c’est la dernière version, bleue sinon. Avec plusieurs profils, toutes les versions sont citées (« Versions sur CurseForge : v1 et v3 »). Le survol de la pastille montre les profils concernés. |
| **Mise à jour disponible** | Le profil installé par l’application a une version plus ancienne que la dernière publiée. |
| **v2 installée** | L’application a installé la v2, mais cette version n’est plus publiée sur GitHub. |

Dans l’historique des versions, d’autres pastilles marquent la **Dernière** version, une version **Bêta** (publiée
comme préversion sur GitHub) et chaque **Version sur CurseForge**.

## Installer un modpack

1. Cliquer sur **Installer**, sur la carte du modpack ou dans son panneau de détails.
2. Le bouton devient une barre de progression : **Préparation…**, **Téléchargement** (avec le pourcentage et le
   débit), **Vérification…**, **Extraction**, puis **Ajout à CurseForge…**
3. Une notification confirme l’installation, et CurseForge s’ouvre (sauf si ce réglage est désactivé) : le modpack
   est dans l’onglet Minecraft.

La croix au bout de la barre annule l’installation pendant la préparation, le téléchargement et l’extraction ; la
dernière étape ne s’interrompt pas, pour ne jamais laisser un profil à moitié en place. Une seule installation se
fait à la fois.

Ce qui se passe pendant l’installation :

- le zip est téléchargé dans un dossier temporaire, puis son **empreinte SHA-256** est comparée à celle publiée avec
  la version : un fichier abîmé ou modifié est refusé ;
- son contenu est extrait dans un dossier de travail situé sur le même disque que les instances, puis déplacé d’un
  bloc dans le dossier `Instances` de CurseForge : CurseForge ne voit jamais un modpack à moitié extrait ;
- le profil prend le nom du modpack (« Hardcore Endgame (2) » si un dossier porte déjà ce nom), et les chemins de
  son fichier `minecraftinstance.json` sont adaptés au PC ;
- l’image du modpack devient l’image du profil dans CurseForge ;
- les mods que le publieur propose en option sont installés **désactivés** : CurseForge les affiche dans le profil,
  et chacun s’active d’un clic ;
- un petit fichier `.modpack-manager.json` est ajouté au profil : c’est ce qui permet à l’application de le
  reconnaître et de le mettre à jour plus tard.

> [!TIP]
> Si CurseForge était déjà ouvert, il peut ne pas afficher le nouveau modpack tout de suite : la notification reste
> alors affichée et propose **Relancer CurseForge**. Voir
> [Quand CurseForge était déjà ouvert](curseforge.md#quand-curseforge-était-déjà-ouvert).

## Mettre à jour un modpack

Quand une nouvelle version d’un modpack installé est publiée, la pastille **Mise à jour disponible** apparaît et le
bouton devient **Mettre à jour**. La mise à jour se fait **sur place**, dans le même profil CurseForge : les mondes
et les réglages sont conservés.

| Ce qui est conservé tel quel | Ce qui est fusionné | Ce qui est remplacé |
|---|---|---|
| Options du jeu (`options.txt`, `optionsof.txt`, `optionsshaders.txt`), serveurs (`servers.dat`), historique des commandes, journaux (`logs`, `crash-reports`), cartes JourneyMap et Xaero’s, dossier `local`, et l’état des mods activés ou désactivés par le joueur dans CurseForge | **Les mondes** (`saves`), captures d’écran, schémas et sauvegardes (`backups`) : rien n’est perdu, la version du joueur l’emporte en cas de doublon. Packs de ressources et de shaders : les ajouts du joueur restent, ceux du modpack l’emportent en cas de doublon. Configurations, si le publieur l’a choisi : voir plus bas. | Tout le reste de ce que fournit le modpack : mods, configurations, scripts… |

Les réglages du profil sont conservés eux aussi : mémoire allouée, arguments Java, nombre de parties, date de
dernière partie et image du profil. Les fichiers et dossiers ajoutés à la main à la racine du profil restent en
place ; ceux que l’ancienne version du modpack fournissait et que la nouvelle n’a plus sont retirés.

**Les mods activés ou désactivés** : un mod activé ou désactivé par le joueur dans CurseForge garde ce choix dans la
nouvelle version, même quand son fichier change. Un mod dont l’état n’a pas été changé suit le choix du publieur.

**Les configurations** : si le publieur a choisi de garder les configurations modifiées par les joueurs, un fichier
du dossier `config` modifié par le joueur est gardé tel quel ; les autres suivent la nouvelle version. La
notification de mise à jour dit combien de fichiers ont été gardés. Sinon, le dossier `config` est remplacé comme
les autres (voir [Garder les configurations des joueurs](reglages.md#garder-les-configurations-des-joueurs)).

> [!WARNING]
> Un dossier fourni par le modpack, comme `mods`, est remplacé **en entier** par celui de la nouvelle version : un
> mod ajouté à la main dans `mods` ne survit pas à la mise à jour, pas plus qu’une configuration modifiée quand le
> publieur n’a pas choisi de les garder. Mieux vaut garder une copie de ce qui a été changé, ou demander au
> publieur de l’intégrer au modpack.

La mise à jour est sûre : l’ancienne version est mise de côté en un seul déplacement avant que la nouvelle prenne sa
place. Si quelque chose échoue, rien n’est supprimé et le message indique le dossier où se trouvent les fichiers.

> [!IMPORTANT]
> Fermer Minecraft avant de mettre à jour un modpack : l’application refuse de toucher à un profil pendant qu’une
> partie tourne avec lui.

## Installer une autre version

Dans le panneau de détails du modpack, la section **Historique des versions** liste toutes les versions publiées.
Un clic sur une version l’affiche, puis **Installer la vN** l’installe.

L’application gère **un profil par modpack** : si le modpack est déjà installé par l’application, son profil passe à
la version choisie, en conservant les données du joueur comme pour une mise à jour. C’est utile pour revenir à une
version précédente. Quand une version plus récente sort, la pastille **Mise à jour disponible** réapparaît.

## Le panneau de détails

Le panneau s’ouvre avec **Détails et versions** (grand bandeau), le bouton **Détails** d’une carte, ou un clic sur
l’image d’une carte. Il présente :

- l’image, les pastilles, le nom et la description du modpack ;
- le bouton d’installation de la version affichée, **Ouvrir le dossier** (le dossier du profil, s’il est installé)
  et **GitHub** (la page de la release) ;
- les caractéristiques de la version : numéro, version de Minecraft, mod loader, nombre de mods, taille, date de
  publication ;
- les profils CurseForge qui contiennent une version de ce modpack, et leur emplacement ;
- les **notes de la version** affichée ;
- l’**historique des versions**.

`Échap` ou un clic à côté du panneau le referme.

## Les profils créés à la main

L’application reconnaît aussi les profils qu’elle n’a pas installés : un zip importé à la main dans CurseForge, ou
le profil d’origine du publieur. Elle compare leurs mods (le nom et la taille de chaque fichier `.jar` du dossier
`mods`) à ceux de chaque version publiée : un profil qui a exactement les mêmes mods qu’une version **est** cette
version, et la pastille **Version sur CurseForge** l’indique.

Un tel profil n’est jamais modifié par l’application : **Installer** crée un profil à part, que l’application gérera
ensuite. Le profil existant reste intact.

> [!NOTE]
> La reconnaissance se fait sur les mods seulement : un profil dont seules les configurations ont changé est toujours
> reconnu comme la même version.

## Actualiser la liste

La liste se met à jour toute seule :

- au lancement de l’application ;
- toutes les 30 minutes tant que l’application reste ouverte, et au retour sur sa fenêtre si la dernière lecture
  date de plus de 30 minutes ;
- après une publication depuis le Studio.

Le bouton **Actualiser** (les deux flèches de la barre de titre) relit GitHub tout de suite. Les profils CurseForge,
eux, sont relus à chaque retour sur la fenêtre : un profil supprimé dans CurseForge disparaît aussitôt de
l’application.

**Hors ligne**, l’application affiche la dernière liste connue, avec le bandeau **Liste non actualisée** et un bouton
**Réessayer**. L’installation d’un modpack demande, elle, une connexion.

> [!NOTE]
> Sans compte, GitHub autorise 60 lectures par heure depuis une même adresse IP. L’application espace donc ses
> vérifications ; si la limite est atteinte (plusieurs PC derrière la même box qui actualisent souvent…), elle
> indique l’heure à laquelle réessayer.

## Suivre les modpacks d’un autre publieur

Par défaut, la Bibliothèque affiche les modpacks du dépôt `WolfGang-PRoxa/minecraft-modpack-manager`. Pour suivre
ceux d’un autre publieur :

1. Ouvrir **Paramètres → Utilisation**.
2. À la ligne **Modpacks de**, cliquer sur **Changer**.
3. Saisir le dépôt du publieur, sous la forme `propriétaire/dépôt` ou en collant son adresse `github.com`.
4. Cliquer sur **Enregistrer** : l’application vérifie que le dépôt existe et qu’il est public, puis recharge la
   liste.

> [!WARNING]
> Un modpack contient des mods, c’est-à-dire du code qui s’exécute sur le PC pendant une partie. L’application vérifie
> que les fichiers reçus sont bien ceux que le publieur a mis en ligne, pas ce qu’ils font : suivre un dépôt, c’est
> faire confiance à son auteur. Un avertissement le rappelle dès qu’un autre dépôt que celui par défaut est saisi.

**Revenir à WolfGang-PRoxa/minecraft-modpack-manager** rétablit le dépôt par défaut. Les modpacks déjà installés
restent dans CurseForge quel que soit le dépôt suivi.
