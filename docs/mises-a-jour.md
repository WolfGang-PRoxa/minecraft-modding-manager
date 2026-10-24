# Mises à jour de l’application

Modding Manager se tient à jour tout seul : quand une nouvelle version sort, il la propose, la télécharge, la
vérifie et l’installe en un clic, sans rien faire perdre.

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
3. L’application se ferme. La fenêtre **Mise à jour** de l’installeur montre la progression, avec la version installée
   et la nouvelle (`1.0.3 → 1.0.4`) : il remplace les fichiers sans rien demander, puis relance l’application.
4. Une notification confirme la nouvelle version et propose **Voir les nouveautés**.

Les réglages, la connexion GitHub, le raccourci sur le bureau et les modpacks installés ne bougent pas.

> [!IMPORTANT]
> Pour ne rien interrompre, la mise à jour ne démarre pas pendant l’installation d’un modpack ni pendant une
> opération du Studio (publication, suppression, rangement, création d’un zip) : « Mise à jour reportée ». Il faut
> d’abord terminer l’opération en cours. À l’inverse, tant que la mise à jour est en cours, ces opérations attendent.

## Voir les nouveautés

L’historique des versions de l’application est dans l’aide, page [Nouveautés](../CHANGELOG.md), et s’ouvre aussi
depuis **Paramètres → À propos → Nouveautés**. Pour chaque version : sa date et ses changements, rangés en
**Ajouts**, **Améliorations**, **Corrections**, **Sécurité** et **Suppressions**.

- La version installée porte la mention **Ta version**.
- Juste après une mise à jour, les versions qui viennent d’être reçues sont marquées **Nouveau**.
- Quand une mise à jour est disponible, ses changements sont présentés en tête, avec le bouton **Mettre à jour**.

## Quelles versions sont proposées

- Seules les versions **stables** publiées sur le dépôt de l’application
  ([WolfGang-PRoxa/minecraft-modding-manager](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases))
  sont proposées, quel que soit le dépôt de modpacks suivi.
- Une version n’est proposée qu’une fois son installeur en ligne, et seulement si elle est **plus récente** que la
  version installée : l’application ne revient jamais en arrière d’elle-même.

## Passage à la 2.0.0

L’application s’appelait **Modpack Manager** jusqu’à la 1.9 (et gardait avant la 1.9.0 des noms de l’époque où elle
s’appelait **Modpack Downloader**). Elle gère maintenant aussi les mods, les packs de ressources, les shaders et les
plugins : la 2.0.0 prend partout le nom **Modding Manager**, et son dépôt devient
`WolfGang-PRoxa/minecraft-modding-manager` (GitHub redirige l’ancienne adresse). La mise à jour s’en charge, sans rien
demander, depuis la 1.9 comme depuis une version plus ancienne :

- l’installeur retire l’ancienne application (`Programs\minecraft-modpack-manager`, ou
  `Programs\minecraft-modpack-downloader`) et installe la nouvelle dans
  `%LOCALAPPDATA%\Programs\minecraft-modding-manager` ;
- au premier lancement, les réglages, les connexions (GitHub, CurseForge, Modrinth, Hangar) et l’historique passent
  de `%APPDATA%\Modpack Manager` (ou `%APPDATA%\Modpack Downloader`) à `%APPDATA%\Modding Manager`, et les résultats
  des tests de `%LOCALAPPDATA%\Modpack Manager` à `%LOCALAPPDATA%\Modding Manager` ;
- le raccourci du bureau prend le nouveau nom ; lui, ceux du menu Démarrer et les épingles de la barre des tâches
  lancent la nouvelle application ; pour un publieur, la tâche planifiée des mises à jour automatiques (désormais
  « Modding Manager - mises a jour des modpacks ») et la connexion à Claude Code (serveur MCP `modding-manager`)
  aussi ;
- chaque modpack installé garde son lien avec l’application : son marqueur devient `.modding-manager.json` la
  première fois qu’elle le lit ;
- un dépôt de modpacks suivi sous l’ancienne adresse du dépôt de l’application prend la nouvelle.

> [!NOTE]
> Un raccourci créé ailleurs que sur le bureau (avec **Autre emplacement…**) n’est pas retrouvé : il se recrée depuis
> [Paramètres → Raccourci](parametres.md#raccourci). Si une épingle de la barre des tâches ne s’ouvre plus, la
> détacher puis épingler de nouveau l’application.

## En cas de problème

Si la mise à jour échoue, la notification **Mise à jour impossible** en donne la raison et propose **Télécharger
depuis GitHub** : il suffit alors de télécharger l’installeur de la nouvelle version et de le lancer. Il met
l’application à jour ; si elle est encore ouverte, il propose d’abord de la fermer (voir
[Relancer l’installeur](installation.md#relancer-linstalleur)).

Les messages possibles sont détaillés dans
[Dépannage](depannage.md#mise-à-jour-de-lapplication).
