# CurseForge

Modpack Manager installe les modpacks comme des profils CurseForge : c’est depuis CurseForge, onglet Minecraft,
que tu lances une partie. Cette page explique comment l’application trouve CurseForge et son dossier de profils, et
ce qu’elle fait quand CurseForge est déjà ouvert.

## Détection de CurseForge

Les deux versions de CurseForge sont prises en charge : l’application **Overwolf** et l’application **autonome**.
L’application les trouve grâce au lien `curseforge://` que CurseForge enregistre dans Windows, puis, à défaut, à
leurs emplacements d’installation habituels.

La barre de titre indique l’état de CurseForge :

- **CurseForge** (avec un point qui pulse) : CurseForge est installé ; un clic l’ouvre, ou ramène sa fenêtre au
  premier plan s’il tourne déjà ;
- **CurseForge introuvable** : un clic ouvre les paramètres.

Sans CurseForge, la Bibliothèque affiche aussi le bandeau **CurseForge n’est pas installé**, avec un bouton
**Télécharger CurseForge**. Une fois CurseForge installé, reviens sur la fenêtre de l’application : elle le détecte
aussitôt.

## Le dossier des instances

CurseForge range chaque profil dans un sous-dossier de son dossier `Instances`. L’application y installe les
modpacks, et y cherche les profils qui contiennent déjà une version d’un modpack. Elle détermine ce dossier dans cet
ordre :

1. **Choisi manuellement**, dans [Paramètres → Dossier des instances](parametres.md#dossier-des-instances) ;
2. **Détecté automatiquement depuis CurseForge** : CurseForge écrit dans ses journaux le dossier qu’il utilise, et
   l’application le lit à chaque fois. Si tu déplaces ce dossier dans les paramètres de CurseForge, l’application
   suit ;
3. **Emplacement par défaut de CurseForge** : `C:\Users\<toi>\curseforge\minecraft\Instances`.

Les paramètres affichent le dossier retenu et son origine. **Modifier…** en choisit un autre, **Ouvrir** l’affiche
dans l’Explorateur, et **Détection automatique** (visible après un choix manuel) revient à la détection.

> [!TIP]
> Ne modifie ce dossier que si l’application ne trouve pas tes profils, par exemple après avoir déplacé le dossier
> d’installation dans les paramètres Minecraft de CurseForge sans avoir relancé CurseForge depuis. Un dossier qui
> n’existe pas encore est créé à la première installation.

## Ouvrir CurseForge après une installation

Le réglage **Ouvrir CurseForge après une installation** (activé par défaut, dans
[Paramètres → CurseForge](parametres.md#curseforge)) lance CurseForge à la fin de chaque installation ou mise à
jour, pour que tu puisses jouer tout de suite.

S’il est désactivé, la notification de fin d’installation propose un bouton **Ouvrir CurseForge**. Sur la carte d’un
modpack déjà à jour, le bouton **Ouvrir CurseForge** fait de même.

## Quand CurseForge était déjà ouvert

CurseForge surveille son dossier `Instances`, mais il ne relit tous ses profils qu’à son démarrage. Ouvert pendant
une installation, il peut ne pas afficher le nouveau modpack ; ouvert pendant une mise à jour, il peut afficher
« 404 » à la place du profil.

L’application fait son possible pour qu’il le remarque sans redémarrer (le fichier qui décrit le profil est posé en
dernier, puis réécrit). Si CurseForge était ouvert, la notification de fin d’installation reste affichée et propose
**Relancer CurseForge** au lieu de simplement le mettre au premier plan.

**Relancer CurseForge** :

1. ferme CurseForge, comme un clic sur la croix de sa fenêtre ;
2. s’il reste dans la zone de notification de Windows, le ferme de force au bout de quelques secondes ;
3. le rouvre : il relit alors tous ses profils, y compris le nouveau.

La relance ne touche ni à Overwolf lui-même, ni à Minecraft, ni à aucune autre application. Le même bouton se trouve
dans [Paramètres → CurseForge](parametres.md#curseforge), pour s’en servir à tout moment.

## Pendant une partie

Pour ne jamais abîmer une partie en cours :

- la mise à jour d’un modpack est refusée tant que Minecraft tourne avec ce profil (« Minecraft est lancé avec ce
  modpack. Ferme le jeu puis réessaie. ») ;
- la relance de CurseForge est refusée tant que Minecraft tourne depuis l’un de ses profils (« Minecraft est lancé
  depuis CurseForge : ferme le jeu, puis relance CurseForge. »).

Ferme le jeu, puis recommence. Les autres messages sont expliqués dans [Dépannage](depannage.md#curseforge).
