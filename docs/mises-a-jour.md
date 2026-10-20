# Mises à jour de l’application

Modpack Manager se tient à jour tout seul : quand une nouvelle version sort, il te la propose, la télécharge, la
vérifie et l’installe en un clic, sans rien te faire perdre.

## Être prévenu

L’application vérifie s’il existe une nouvelle version :

- à chaque lancement ;
- toutes les 30 minutes tant qu’elle reste ouverte ;
- à la demande, avec **Paramètres → À propos → Rechercher une mise à jour**, qui confirme aussi quand l’application
  est déjà à jour.

Une nouvelle version s’annonce par une barre **en haut de la fenêtre**, sous la barre de titre, quelle que soit la
vue : « Nouvelle version disponible : 1.1.0 · tu utilises la 1.0.3 », avec la taille du téléchargement.

- **Mettre à jour** lance la mise à jour.
- **Nouveautés** montre ce que la nouvelle version apporte, avant de l’installer.
- **Plus tard** replie la barre en un petit rappel **Mise à jour** dans la barre de titre, jusqu’au prochain
  lancement. Un clic sur le rappel rouvre la proposition.

## Installer la mise à jour

1. **Mettre à jour** télécharge le nouvel installeur ; la barre affiche la progression, et **Annuler** l’interrompt.
2. L’empreinte SHA-256 du fichier téléchargé est comparée à celle que GitHub publie pour cet installeur : un fichier
   abîmé ou modifié n’est jamais lancé.
3. L’application se ferme. La fenêtre **Mise à jour** de l’installeur montre la progression, avec ta version et la
   nouvelle (`1.0.3 → 1.0.4`) : il remplace les fichiers sans rien demander, puis relance l’application.
4. Une notification confirme la nouvelle version et propose **Voir les nouveautés**.

Tes réglages, ta connexion GitHub, ton raccourci sur le bureau et tes modpacks ne bougent pas.

> [!IMPORTANT]
> Pour ne rien interrompre, la mise à jour ne démarre pas pendant l’installation d’un modpack ni pendant une
> opération du Studio (publication, suppression, rangement, création d’un zip) : « Mise à jour reportée ». Termine
> d’abord l’opération en cours. À l’inverse, tant que la mise à jour est en cours, ces opérations attendent.

## Voir les nouveautés

L’historique des versions de l’application est dans l’aide, page [Nouveautés](../CHANGELOG.md), et s’ouvre aussi
depuis **Paramètres → À propos → Nouveautés**. Pour chaque version : sa date et ses changements, rangés en
**Ajouts**, **Améliorations**, **Corrections**, **Sécurité** et **Suppressions**.

- La version que tu utilises porte la mention **Ta version**.
- Juste après une mise à jour, les versions que tu viens de recevoir sont marquées **Nouveau**.
- Quand une mise à jour est disponible, ses changements sont présentés en tête, avec le bouton **Mettre à jour**.

## Quelles versions sont proposées

- Seules les versions **stables** publiées sur le dépôt de l’application
  ([WolfGang-PRoxa/minecraft-modpack-manager](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager/releases))
  sont proposées, quel que soit le dépôt de modpacks que tu suis.
- Une version n’est proposée qu’une fois son installeur en ligne, et seulement si elle est **plus récente** que la
  tienne : l’application ne revient jamais en arrière d’elle-même.

## Passage à la 1.9.0

Jusqu’à la 1.8, l’application gardait des noms de l’époque où elle s’appelait **Modpack Downloader**. La 1.9.0 prend
partout le nom **Modpack Manager**. La mise à jour s’en charge, sans rien te demander :

- l’installeur retire l’ancienne application (`Programs\minecraft-modpack-downloader`) et installe la nouvelle dans
  `%LOCALAPPDATA%\Programs\minecraft-modpack-manager` ;
- au premier lancement, tes réglages, ta connexion GitHub, ta clé CurseForge et ton historique passent de
  `%APPDATA%\Modpack Downloader` à `%APPDATA%\Modpack Manager` ;
- ton raccourci du bureau, ceux du menu Démarrer et tes épingles de la barre des tâches lancent la nouvelle
  application ; pour un publieur, la tâche planifiée des mises à jour automatiques et la connexion à Claude Code
  aussi ;
- chaque modpack installé garde son lien avec l’application : son marqueur devient `.modpack-manager.json` la
  première fois qu’elle le lit.

> [!NOTE]
> Un raccourci que tu avais créé ailleurs que sur le bureau (avec **Choisir l’emplacement**) n’est pas retrouvé :
> recrée-le depuis **Paramètres → Utilisation**. Si une épingle de la barre des tâches ne s’ouvre plus, détache-la et
> épingle de nouveau l’application.

## En cas de problème

Si la mise à jour échoue, la notification **Mise à jour impossible** en donne la raison et propose **Télécharger
depuis GitHub** : télécharge l’installeur de la nouvelle version et lance-le. Il met l’application à jour ; si elle
est encore ouverte, il propose d’abord de la fermer (voir
[Relancer l’installeur](installation.md#relancer-linstalleur)).

Les messages possibles sont détaillés dans
[Dépannage](depannage.md#mise-à-jour-de-lapplication).
