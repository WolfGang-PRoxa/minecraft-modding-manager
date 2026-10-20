# Présentation

Modpack Manager est une application Windows qui installe des modpacks Minecraft dans CurseForge en un clic, et
les garde à jour. Les modpacks sont publiés sur GitHub par leurs auteurs, qui utilisent la même application, avec
le Studio, pour préparer et publier chaque nouvelle version.

## À quoi sert l’application

**Pour les joueurs**, elle remplace les manipulations à la main (télécharger un zip, l’importer dans CurseForge,
recommencer à chaque mise à jour en espérant ne pas perdre ses mondes) :

- elle liste les modpacks publiés, avec leur description, leurs notes de version et l’historique de leurs versions ;
- elle installe un modpack directement comme profil CurseForge, après avoir vérifié l’intégrité du téléchargement ;
- elle le met à jour sur place quand une nouvelle version sort, en conservant tes mondes, tes options, tes captures
  d’écran, tes packs de ressources, les mods que tu as activés ou désactivés et les réglages du profil (et tes
  configurations modifiées, si le publieur l’a choisi) ;
- elle indique quelle version de chaque modpack se trouve déjà dans ton CurseForge, même si tu l’as installée
  autrement.

**Pour les auteurs de modpacks**, le Studio range les zips de chaque mise à jour, les numérote, et met les releases
GitHub en accord avec le dossier en quelques clics : nouvelle version, notes, image, suppression. Ses réglages
décident de ce que reçoivent les joueurs : fichiers jamais publiés, mods livrés désactivés, configurations gardées.

## Deux rôles

Au premier lancement, tu choisis comment tu utilises l’application. Ce choix se change à tout moment dans
[Paramètres → Utilisation](parametres.md#utilisation), sans réinstaller ni redémarrer.

| Rôle | Pour qui | Ce que tu vois |
|---|---|---|
| **Récepteur** (par défaut) | Les joueurs | La **Bibliothèque** : les modpacks publiés, à installer et à mettre à jour. |
| **Publieur** | Les auteurs de modpacks | La Bibliothèque et le **Studio**, avec des onglets pour passer de l’un à l’autre. |

Un publieur reste un joueur : il installe aussi les modpacks depuis la Bibliothèque.

## Comment ça marche

Chaque version d’un modpack est une **release** GitHub : un zip du dossier de l’instance CurseForge, un fichier
`modpack.json` qui la décrit, et éventuellement une image.

```
Publieur ── Studio ──── publie ───▶ GitHub (dépôt public)
                                    une release par version :
                                    zip · modpack.json · image
                                              │
                                              │ lue par
                                              ▼
Joueur ──── Bibliothèque ── installe ──▶ CurseForge (dossier Instances)
```

1. Le publieur range les zips de son modpack dans un dossier ; le Studio crée une release par version.
2. L’application des joueurs lit les releases du dépôt suivi, et affiche les modpacks dans la Bibliothèque.
3. **Installer** télécharge le zip, vérifie son empreinte, puis place le modpack dans le dossier `Instances` de
   CurseForge, comme un profil créé par CurseForge lui-même.
4. Le joueur lance le modpack depuis CurseForge, onglet Minecraft.

Les mises à jour de l’application elle-même viennent toujours de son propre dépôt
([WolfGang-PRoxa/minecraft-modpack-manager](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager)),
quel que soit le dépôt de modpacks suivi. Voir [Mises à jour de l’application](mises-a-jour.md).

## Ce dont tu as besoin

- **Windows 10 ou 11**, en 64 bits.
- **[CurseForge](https://www.curseforge.com/download/app)**, pour jouer aux modpacks : la version Overwolf comme
  l’application autonome conviennent. Voir [CurseForge](curseforge.md).
- **Une connexion internet**, pour lister et télécharger les modpacks. Sans connexion, l’application affiche la
  dernière liste connue.
- **De l’espace disque** : pendant une installation, le zip téléchargé et son contenu extrait occupent la place
  ensemble, le temps que le zip soit supprimé.
- **Pour publier** : un compte GitHub et un dépôt public. Voir [Devenir publieur](publieur.md).

Aucun compte n’est nécessaire pour jouer.

## La fenêtre en un coup d’œil

La barre de titre, en haut, reste visible dans toutes les vues :

- à gauche, le nom de l’application, et pour un publieur les onglets **Bibliothèque** et **Studio** ;
- à droite, le rappel **Mise à jour** (quand une mise à jour de l’application a été remise à plus tard),
  **Offrir un café** (la page Buy Me a Coffee du développeur, pour le soutenir), l’état de CurseForge (un clic
  l’ouvre), puis les boutons **Actualiser**, **Aide**, **Signaler un problème** et **Paramètres**, et enfin les
  boutons de la fenêtre (réduire, agrandir, fermer).

Juste en dessous apparaît la barre de mise à jour de l’application quand une nouvelle version est disponible. Le
reste de la fenêtre affiche la vue en cours : la Bibliothèque, ou le Studio pour un publieur.

## Pour aller plus loin

- [Installation et premier lancement](installation.md)
- [La bibliothèque](bibliotheque.md) : installer son premier modpack.
- [Le Studio](studio.md) : publier ses modpacks.
- [Dépannage](depannage.md) : quand quelque chose ne se passe pas comme prévu.
