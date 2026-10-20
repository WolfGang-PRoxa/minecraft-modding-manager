# Confidentialité et sécurité

Modpack Manager ne collecte aucune donnée et n’envoie rien à ses auteurs de lui-même. Cette page détaille ce qui
transite sur le réseau, ce qui reste sur le PC, et comment l’application protège ce qu’elle installe.

## Ce qui est envoyé, et à qui

L’application contacte GitHub : `api.github.com`, `github.com` et ses serveurs de fichiers. En mode publieur, elle
contacte aussi CurseForge, avec la clé et le jeton que le publieur lui a confiés, et, pour les tests, les serveurs de
Minecraft et de ses chargeurs. Elle ne contient ni statistiques d’utilisation ni publicité.

| Quand | Ce qui est demandé à GitHub |
|---|---|
| Au lancement, puis toutes les 30 minutes | La liste des releases du dépôt suivi et de celui de l’application, sans aucune information sur l’utilisateur. |
| À l’installation d’un modpack | Le zip et l’image de la version choisie. |
| Pour afficher un compte ou un dépôt | L’image de profil (avatar) du compte GitHub concerné. |
| À la mise à jour de l’application | L’installeur de la nouvelle version. |
| En mode publieur | Avec le jeton du publieur : la vérification de ses droits sur le dépôt, puis la publication de ses releases. |
| À l’envoi d’un signalement | Le texte saisi, et les informations techniques si elles sont jointes. |

| Quand | Ce qui est demandé à CurseForge (publieurs), avec la clé ou le jeton du publieur |
|---|---|
| À l’enregistrement de la clé ou du jeton | Une requête qui vérifie que CurseForge l’accepte. |
| À la recherche des mises à jour des mods | Les fichiers disponibles pour les mods du profil, et leurs notes de version. |
| À l’application de mises à jour | Les fichiers des mods choisis (`edge.forgecdn.net`). |
| À la liaison d’un modpack à son projet, ou à l’ouverture de ses versions | Le projet et ses versions, et les fichiers joints à sa dernière version. |
| À la publication d’une version sur CurseForge | L’export de la version (liste des mods, fichiers joints), ses notes et son type. |

| Quand | Ce qui est demandé ailleurs (publieurs) |
|---|---|
| Au premier test d’un profil sur un serveur | Le serveur de son chargeur : `meta.fabricmc.net` (Fabric), `maven.minecraftforge.net` (Forge) ou `maven.neoforged.net` (NeoForge), puis le serveur de Minecraft et ses bibliothèques (`piston-data.mojang.com`, `libraries.minecraft.net`, et `maven.fabricmc.net` pour Fabric). |
| Pendant un test (serveur ou partie avec des joueurs) | Le serveur et les jeux de test ne se connectent qu’entre eux, sur le PC, sans compte. Comme lors d’une partie ordinaire, Minecraft et certains mods peuvent contacter leurs propres services (vérification de mises à jour, par exemple). |
| Avec **Confier les échecs à Claude Code** activé | Le résumé d’un passage des mises à jour automatiques qui a échoué (nom du modpack, mises à jour essayées, message des tests) est envoyé à Claude Code, installé sur le PC, qui le transmet à Anthropic avec le compte Claude du publieur. Désactivé par défaut. |

Le bouton **Offrir un café** n’envoie rien : il ouvre la page Buy Me a Coffee du développeur dans le navigateur.

Comme tout site web, ces services voient l’adresse IP du PC lors de ces échanges. Aucune autre information n’est
transmise à un autre système.

## Ce qui reste sur le PC

- **Les réglages** et la **liste mise en cache**, dans `%APPDATA%\Modpack Manager` (voir
  [Fichiers et dossiers](fichiers.md)), et pour un publieur les serveurs, jeux et résultats des tests, dans
  `%LOCALAPPDATA%\Modpack Manager`.
- **La connexion GitHub** : le jeton est chiffré par Windows (DPAPI), avec une clé liée à la session Windows. Un
  autre compte Windows, ou une copie du fichier sur un autre PC, ne peut pas le relire. **Se déconnecter** le
  supprime.
- **La clé de l’API CurseForge et le jeton d’auteur** (publieurs) : chiffrés de la même façon. **Retirer** les
  supprime.
- **Ce que l’application lit pour fonctionner**, sans jamais l’envoyer : l’emplacement de CurseForge (dans le
  registre de Windows), le dossier de ses profils (dans ses journaux), la liste des profils et de leurs mods, et la
  liste des programmes en cours (pour savoir si CurseForge ou Minecraft tournent).
- **Ce qu’elle change sur le PC, seulement sur demande** : un raccourci (bureau ou emplacement choisi), la tâche
  planifiée des mises à jour automatiques (publieurs), la connexion de Claude Code à l’application.

## Intégrité des téléchargements

- **Modpacks** : l’empreinte SHA-256 de chaque zip téléchargé est comparée à celle publiée dans son `modpack.json`
  (à défaut, à celle que GitHub calcule pour le zip), et sa taille à celle annoncée. Un fichier abîmé ou modifié est
  refusé avant toute installation, et un modpack sans empreinte connue n’est pas installé.
- **Mises à jour de l’application** : l’empreinte SHA-256 de l’installeur téléchargé est comparée à celle que GitHub
  calcule pour le fichier publié ; sans elle, la mise à jour n’est pas téléchargée. L’adresse et la version viennent
  des releases relues par l’application elle-même.
- **Mods mis à jour par le Studio** (publieurs) : l’empreinte SHA-1 publiée par CurseForge est vérifiée avant que le
  fichier n’arrive dans le profil ; un fichier sans empreinte est laissé à mettre à jour dans CurseForge.
- **Serveurs de test** (publieurs) : les installeurs de Forge et de NeoForge sont comparés à l’empreinte SHA-256
  publiée à côté d’eux. Fabric n’en publie pas pour son lanceur de serveur : seul le HTTPS le protège.
- **Extraction** : un zip qui contiendrait un chemin sortant du dossier du profil est refusé.
- **Mise à jour d’un modpack** : l’ancienne version est mise de côté avant d’être remplacée ; en cas d’échec, rien
  n’est supprimé.

## Signature de l’installeur

L’installeur sera signé gratuitement par [SignPath Foundation](https://signpath.org), qui réserve ce service aux
projets open source : les propriétés du fichier indiqueront l’éditeur **SignPath Foundation**. Seuls les installeurs
construits par GitHub Actions à partir du dépôt public seront signés, après une approbation manuelle du mainteneur.
Tant que la signature n’est pas en place, l’installeur n’est pas signé : Windows peut afficher « Windows a protégé
votre ordinateur » (voir [Installation](installation.md)). La politique de signature complète est dans le
[README du dépôt](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager/blob/main/README.fr.md#politique-de-signature-du-code).

## Protection de l’application

- La fenêtre de l’application est isolée du système : elle n’accède aux fichiers du PC qu’à travers les fonctions
  prévues par l’application, et n’affiche que son propre contenu. Elle n’exécute aucun script écrit dans la page et
  n’ouvre aucune connexion : tout passe par l’application.
- Caméra, micro, position et autres permissions sont refusés à la fenêtre ; seule l’écriture dans le presse-papiers
  (bouton **Copier** du code de connexion GitHub) est permise.
- Les boutons **Ouvrir** n’ouvrent que des dossiers dans l’Explorateur, jamais un fichier ou un programme.
- Les liens s’ouvrent dans le navigateur, et seulement s’ils sont en `https`.
- Le Studio n’ouvre que les zips du dossier des modpacks.
- Une seule installation de modpack, et une seule opération du Studio, se font à la fois ; la mise à jour de
  l’application attend qu’elles soient terminées.

## Les signalements

Un signalement devient une issue **publique** du dépôt de l’application. Il contient le texte saisi et, si elles
sont jointes, les informations techniques affichées dans le formulaire avant l’envoi : versions de l’application et
de Windows, rôle, dépôt suivi, état de CurseForge et modpacks installés. Elles ne contiennent ni chemin de dossier,
ni nom de compte. Voir [Signaler un problème](signalement.md).

Le mainteneur est prévenu par un service à lui, qui transmet le texte de l’issue (titre, description, derniers
commentaires, nom du compte GitHub de son auteur) à une session Claude Code de son compte Anthropic, pour en évaluer
le risque avant toute correction automatique. Comme l’issue elle-même, ce texte est public, et l’évaluation l’est
aussi (sur une branche du dépôt, le temps que l’issue soit réglée).
