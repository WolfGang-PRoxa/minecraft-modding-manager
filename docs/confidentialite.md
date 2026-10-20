# Confidentialité et sécurité

Modpack Manager ne collecte aucune donnée et n’envoie rien à ses auteurs de lui-même. Cette page détaille ce qui
transite sur le réseau, ce qui reste sur ton PC, et comment l’application protège ce qu’elle installe.

## Ce qui est envoyé, et à qui

L’application contacte GitHub : `api.github.com`, `github.com` et ses serveurs de fichiers. En mode publieur, elle
contacte aussi CurseForge, avec la clé et le jeton que tu lui as donnés, et, pour les tests, les serveurs de Minecraft
et de ses chargeurs. Elle ne contient ni statistiques d’utilisation ni publicité.

| Quand | Ce qui est demandé à GitHub |
|---|---|
| Au lancement, puis toutes les 30 minutes | La liste des releases du dépôt suivi et de celui de l’application, sans aucune information sur toi. |
| Quand tu installes un modpack | Le zip et l’image de la version choisie. |
| Pour afficher un compte ou un dépôt | L’image de profil (avatar) du compte GitHub concerné. |
| Quand tu mets l’application à jour | L’installeur de la nouvelle version. |
| En mode publieur | Avec ton jeton : la vérification de tes droits sur le dépôt, puis la publication de tes releases. |
| Quand tu envoies un signalement | Ce que tu as écrit, et les informations techniques si tu les joins. |

| Quand | Ce qui est demandé à CurseForge (publieurs), avec ta clé ou ton jeton |
|---|---|
| Quand tu enregistres ta clé ou ton jeton | Une requête qui vérifie que CurseForge l’accepte. |
| Quand tu cherches les mises à jour des mods | Les fichiers disponibles pour les mods de ton profil, et leurs notes de version. |
| Quand tu appliques des mises à jour | Les fichiers des mods choisis (`edge.forgecdn.net`). |
| Quand tu lies un modpack à son projet, ou ouvres ses versions | Le projet et ses versions, et les fichiers joints à sa dernière version. |
| Quand tu publies une version sur CurseForge | L’export de la version (liste des mods, fichiers joints), ses notes et son type. |

| Quand | Ce qui est demandé ailleurs (publieurs) |
|---|---|
| La première fois que tu testes un profil sur un serveur | Le serveur de son chargeur : `meta.fabricmc.net` (Fabric), `maven.minecraftforge.net` (Forge) ou `maven.neoforged.net` (NeoForge), puis le serveur de Minecraft et ses bibliothèques (`piston-data.mojang.com`, `libraries.minecraft.net`, et `maven.fabricmc.net` pour Fabric). |
| Pendant un test (serveur ou partie avec des joueurs) | Le serveur et les jeux de test ne se connectent qu’entre eux, sur ton PC, sans compte. Comme quand tu joues, Minecraft et certains mods peuvent contacter leurs propres services (vérification de mises à jour, par exemple). |
| Avec **Confier les échecs à Claude Code** activé | Le résumé d’un passage des mises à jour automatiques qui a échoué (nom du modpack, mises à jour essayées, message des tests) est envoyé à Claude Code, installé sur ton PC, qui le transmet à Anthropic avec ton compte Claude. Désactivé par défaut. |

Le bouton **Offrir un café** n’envoie rien : il ouvre la page Buy Me a Coffee du développeur dans ton navigateur.

Comme tout site web, ces services voient l’adresse IP de ton PC lors de ces échanges. Aucune autre information n’est
transmise à un autre système.

## Ce qui reste sur ton PC

- **Tes réglages** et la **liste mise en cache**, dans `%APPDATA%\Modpack Manager` (voir
  [Fichiers et dossiers](fichiers.md)), et pour un publieur les serveurs, jeux et résultats des tests, dans
  `%LOCALAPPDATA%\Modpack Manager`.
- **Ta connexion GitHub** : le jeton est chiffré par Windows (DPAPI), avec une clé liée à ta session Windows. Un
  autre compte Windows, ou une copie du fichier sur un autre PC, ne peut pas le relire. **Se déconnecter** le
  supprime.
- **Ta clé de l’API CurseForge et ton jeton d’auteur** (publieurs) : chiffrés de la même façon. **Retirer** les
  supprime.
- **Ce que l’application lit pour fonctionner**, sans jamais l’envoyer : l’emplacement de CurseForge (dans le
  registre de Windows), le dossier de ses profils (dans ses journaux), la liste des profils et de leurs mods, et la
  liste des programmes en cours (pour savoir si CurseForge ou Minecraft tournent).
- **Ce qu’elle change sur ton PC, seulement si tu le demandes** : un raccourci (bureau ou emplacement choisi), la
  tâche planifiée des mises à jour automatiques (publieurs), la connexion de Claude Code à l’application.

## Intégrité des téléchargements

- **Modpacks** : l’empreinte SHA-256 de chaque zip téléchargé est comparée à celle publiée dans son `modpack.json`,
  et sa taille à celle annoncée. Un fichier abîmé ou modifié est refusé avant toute installation.
- **Mises à jour de l’application** : l’empreinte SHA-256 de l’installeur téléchargé est comparée à celle que GitHub
  calcule pour le fichier publié. L’adresse et la version viennent des releases relues par l’application elle-même.
- **Extraction** : un zip qui contiendrait un chemin sortant du dossier du profil est refusé.
- **Mise à jour d’un modpack** : l’ancienne version est mise de côté avant d’être remplacée ; en cas d’échec, rien
  n’est supprimé.

## Signature de l’installeur

L’installeur sera signé gratuitement par [SignPath Foundation](https://signpath.org), qui réserve ce service aux
projets open source : les propriétés du fichier indiqueront l’éditeur **SignPath Foundation**. Seuls les installeurs
construits par GitHub Actions à partir du dépôt public seront signés, après une approbation manuelle du mainteneur.
Tant que la signature n’est pas en place, l’installeur n’est pas signé : Windows peut afficher « Windows a protégé
votre ordinateur » (voir [Installation](installation.md)). La politique de signature complète est dans le
[README du dépôt](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager#politique-de-signature-du-code).

## Protection de l’application

- La fenêtre de l’application est isolée du système : elle n’accède à tes fichiers qu’à travers les fonctions
  prévues par l’application, et n’affiche que son propre contenu.
- Les liens s’ouvrent dans ton navigateur, et seulement s’ils sont en `https`.
- Le Studio n’ouvre que les zips du dossier des modpacks.
- Une seule installation de modpack, et une seule opération du Studio, se font à la fois ; la mise à jour de
  l’application attend qu’elles soient terminées.

## Les signalements

Un signalement devient une issue **publique** du dépôt de l’application. Il contient ce que tu as écrit et, si tu
les joins, les informations techniques affichées dans le formulaire avant l’envoi : versions de l’application et de
Windows, rôle, dépôt suivi, état de CurseForge et modpacks installés. Elles ne contiennent ni chemin de dossier, ni
nom de compte. Voir [Signaler un problème](signalement.md).
