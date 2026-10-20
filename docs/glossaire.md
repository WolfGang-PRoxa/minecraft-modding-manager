# Glossaire

Les termes employés dans l’application et dans cette documentation, par ordre alphabétique.

**Bibliothèque**\
La vue des modpacks publiés sur le dépôt suivi, d’où on les installe. Voir [La bibliothèque](bibliotheque.md).

**CurseForge**\
L’application qui gère les profils Minecraft moddés et lance le jeu. Elle existe en version Overwolf et en
application autonome. Voir [CurseForge](curseforge.md).

**Dépôt**\
Un projet hébergé sur GitHub, désigné par `propriétaire/nom`. Le dépôt des modpacks contient leurs releases ; le
dépôt de l’application (`WolfGang-PRoxa/minecraft-modpack-manager`) contient aussi son code et ses versions.

**Dossier des instances** (ou dossier `Instances`)\
Le dossier où CurseForge range ses profils, un sous-dossier par profil. L’application y installe les modpacks.

**Dossier des modpacks**\
Le dossier du publieur, avec un sous-dossier par modpack, que le Studio publie sur GitHub. Il fait foi : GitHub en
est le miroir.

**Empreinte (SHA-256)**\
Un résumé de 64 caractères calculé à partir du contenu d’un fichier : la moindre modification change l’empreinte.
L’application s’en sert pour vérifier chaque téléchargement.

**Empreinte des mods**\
Une empreinte calculée à partir du nom et de la taille des mods d’un profil ou d’un zip. Elle permet de reconnaître
une version dans un profil que l’application n’a pas installé. Voir
[L’empreinte des mods](fichiers.md#lempreinte-des-mods).

**Exclusion**\
Un fichier ou un dossier de l’instance que le publieur ne publie jamais, choisi dans les réglages du modpack. Voir
[Exclure des fichiers](reglages.md#exclure-des-fichiers).

**Identifiant** (d’un modpack)\
Le nom technique d’un modpack (`hardcore-endgame`), utilisé dans les tags GitHub et dans les profils des joueurs. Il
ne change jamais.

**Instance**\
Le dossier d’un profil CurseForge : ses mods, ses configurations, ses mondes et son fichier `minecraftinstance.json`.

**Issue**\
Un sujet de discussion public sur GitHub, ouvert pour signaler un problème ou proposer une idée.

**Jeton** (GitHub)\
Une clé d’accès créée sur GitHub, qui permet à l’application de publier en ton nom sur un dépôt précis. Voir
[Créer un jeton GitHub](publieur.md#créer-un-jeton-github).

**Marqueur**\
Le fichier `.modpack-manager.json` que l’application dépose dans chaque profil qu’elle installe, pour le
reconnaître et le mettre à jour.

**Mod désactivé**\
Un mod installé dans le profil mais que le jeu ne charge pas : son fichier finit par `.jar.disabled`. Le publieur peut
livrer un mod désactivé, en option ; le joueur l’active dans CurseForge. Voir
[Désactiver des mods chez les joueurs](reglages.md#désactiver-des-mods-chez-les-joueurs).

**Mod loader**\
Le chargeur de mods d’une instance : Forge, NeoForge, Fabric ou Quilt, avec sa version.

**Modpack**\
Un ensemble de mods, de configurations et de réglages pensés pour jouer ensemble, distribué sous forme d’instance
CurseForge.

**modpack.json**\
Le fichier qui décrit une version de modpack dans sa release : nom, version, empreintes… Voir
[Format d’une release de modpack](fichiers.md#format-dune-release-de-modpack).

**Notes de version**\
Le texte qui présente les changements d’une version de modpack, écrit par le publieur dans le Studio.

**Nouveautés**\
L’historique des versions de l’application, dans l’aide. Voir [Nouveautés](../CHANGELOG.md).

**pack.json**\
Le fichier d’un dossier de modpack où le Studio garde son identifiant, son nom, sa description, ses notes et le
dernier numéro attribué. Voir [Le fichier pack.json](studio.md#le-fichier-packjson).

**Profil**\
Un modpack installé dans CurseForge, qui apparaît dans son onglet Minecraft. Chaque profil est une instance.

**Publier**\
Mettre les releases GitHub en accord avec le dossier des modpacks. Voir [Publier et supprimer](publication.md).

**Publieur**\
Le rôle des auteurs de modpacks : la Bibliothèque et le Studio. Voir [Devenir publieur](publieur.md).

**Ranger**\
Donner un numéro de version aux zips déposés dans le dossier d’un modpack. Voir
[Ranger les zips](versions.md#ranger-les-zips).

**Récepteur**\
Le rôle des joueurs, par défaut : la Bibliothèque seule.

**Réglages des versions**\
Les choix d’un publieur pour un modpack : fichiers exclus, mods désactivés chez les joueurs, configurations gardées.
Voir [Réglages des versions](reglages.md).

**Release**\
Une publication sur GitHub, rattachée à un tag, avec un texte et des fichiers. Chaque version d’un modpack est une
release, comme chaque version de l’application.

**Studio**\
La vue du publieur, qui range les zips et publie les releases. Voir [Le Studio](studio.md).

**Tag**\
Un nom attaché à une release GitHub : `pack-<id>-v<N>` pour une version de modpack, `app-v<version>` pour une
version de l’application.

**Version**\
Une étape numérotée d’un modpack (v1, v2, v3…), publiée sous forme de release. Un numéro n’est jamais réutilisé.
