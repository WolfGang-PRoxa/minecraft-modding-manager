# Confidentialité et sécurité

Modpack Manager ne collecte aucune donnée et n’envoie rien à ses auteurs de lui-même. Cette page détaille ce qui
transite sur le réseau, ce qui reste sur ton PC, et comment l’application protège ce qu’elle installe.

## Ce qui est envoyé, et à qui

L’application contacte GitHub : `api.github.com`, `github.com` et ses serveurs de fichiers. En mode publieur, elle
contacte aussi CurseForge, avec la clé et le jeton que tu lui as donnés. Elle ne contient ni statistiques
d’utilisation ni publicité.

| Quand | Ce qui est demandé à GitHub |
|---|---|
| Au lancement, puis toutes les 30 minutes | La liste des releases du dépôt suivi et de celui de l’application, sans aucune information sur toi. |
| Quand tu installes un modpack | Le zip et l’image de la version choisie. |
| Pour afficher un compte ou un dépôt | L’image de profil (avatar) du compte GitHub concerné. |
| Quand tu mets l’application à jour | L’installeur de la nouvelle version. |
| En mode publieur | Avec ton jeton : la vérification de tes droits sur le dépôt, puis la publication de tes releases. |
| Quand tu envoies un signalement | Ce que tu as écrit, et les informations techniques si tu les joins. |

| Quand | Ce qui est demandé à CurseForge (publieurs) |
|---|---|
| Quand tu enregistres ta clé ou ton jeton | Une requête qui vérifie que CurseForge l’accepte. |

Comme tout site web, GitHub et CurseForge voient l’adresse IP de ton PC lors de ces échanges. Aucune autre information n’est
transmise à un autre système.

## Ce qui reste sur ton PC

- **Tes réglages** et la **liste mise en cache**, dans `%APPDATA%\Modpack Downloader` (voir
  [Fichiers et dossiers](fichiers.md)).
- **Ta connexion GitHub** : le jeton est chiffré par Windows (DPAPI), avec une clé liée à ta session Windows. Un
  autre compte Windows, ou une copie du fichier sur un autre PC, ne peut pas le relire. **Se déconnecter** le
  supprime.
- **Ta clé de l’API CurseForge et ton jeton d’auteur** (publieurs) : chiffrés de la même façon. **Retirer** les
  supprime.
- **Ce que l’application lit pour fonctionner**, sans jamais l’envoyer : l’emplacement de CurseForge (dans le
  registre de Windows), le dossier de ses profils (dans ses journaux), la liste des profils et de leurs mods, et la
  liste des programmes en cours (pour savoir si CurseForge ou Minecraft tournent).

## Intégrité des téléchargements

- **Modpacks** : l’empreinte SHA-256 de chaque zip téléchargé est comparée à celle publiée dans son `modpack.json`,
  et sa taille à celle annoncée. Un fichier abîmé ou modifié est refusé avant toute installation.
- **Mises à jour de l’application** : l’empreinte SHA-256 de l’installeur téléchargé est comparée à celle que GitHub
  calcule pour le fichier publié. L’adresse et la version viennent des releases relues par l’application elle-même.
- **Extraction** : un zip qui contiendrait un chemin sortant du dossier du profil est refusé.
- **Mise à jour d’un modpack** : l’ancienne version est mise de côté avant d’être remplacée ; en cas d’échec, rien
  n’est supprimé.

## Signature de l’installeur

L’installeur est signé gratuitement par [SignPath Foundation](https://signpath.org), qui réserve ce service aux
projets open source : les propriétés du fichier indiquent l’éditeur **SignPath Foundation**. Seuls les installeurs
construits par GitHub Actions à partir du dépôt public sont signés, après une approbation manuelle du mainteneur. La
politique de signature complète est dans le
[README du dépôt](https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader#politique-de-signature-du-code).

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
