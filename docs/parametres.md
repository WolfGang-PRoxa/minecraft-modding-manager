# Paramètres

Les paramètres s’ouvrent avec le bouton en forme d’engrenage, à droite de la barre de titre. `Échap`, la croix ou un
clic à côté de la fenêtre les referment. Chaque réglage est enregistré dès qu’il est modifié.

Les sections **Dossier des modpacks**, **Compte CurseForge**, **Mises à jour automatiques** et **Claude Code et
terminal** n’apparaissent qu’en mode publieur.

Les sections sont rangées côte à côte, en deux colonnes. En mode publieur, sur un grand écran, elles passent sur trois
colonnes : l’application (utilisation, apparence, raccourci, à propos), CurseForge (installation, dossier des instances, compte),
puis le Studio (dossier des modpacks, mises à jour automatiques, Claude Code). Quand la fenêtre est étroite, elles
s’empilent sur une seule colonne.

## Utilisation

Le rôle et le dépôt suivi. Deux onglets, **Récepteur** et **Publieur**, indiquent le rôle actuel.

**En récepteur**, la ligne **Modpacks de** montre le dépôt dont la Bibliothèque affiche les modpacks. **Changer**
permet d’en suivre un autre (voir
[Suivre les modpacks d’un autre publieur](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur)).

**En publieur**, la section montre :

- **Dépôt GitHub des modpacks**, avec **Changer** pour en choisir un autre (le compte connecté doit pouvoir y
  publier) ;
- **Compte GitHub** : le compte utilisé pour publier, et d’où vient la connexion (voir
  [Connecter le compte GitHub](publieur.md#connecter-le-compte-github)) ;
- **Aller au Studio**.

Pour **passer en publieur**, cliquer sur l’onglet **Publieur** : le formulaire demande le dépôt et le compte GitHub
(voir [Devenir publieur](publieur.md)). Pour **revenir en récepteur**, cliquer sur l’onglet **Récepteur** : l’onglet
Studio disparaît, la Bibliothèque s’affiche. Le dossier des modpacks, la connexion GitHub et les releases ne sont pas
touchés : repasser en publieur les retrouve.

## Apparence

Le style de couleurs de l’application et la taille de son interface. Tout s’applique aussitôt, à toute la fenêtre.

**Style** : chaque vignette montre un style avec ses propres couleurs ; un clic l’applique. Six styles sont fournis :
**Herbe** (le style d’origine), **Océan**, **Améthyste**, **Nether**, **Contraste élevé** et **Neige**, un style clair.

Un **style personnalisé** se crée avec **Nouveau style** (à partir du style en cours) ou **Personnaliser** sous un
style fourni. Sa fenêtre règle, avec un aperçu à côté :

- son **nom** ;
- trois **couleurs** : le **fond**, le **texte** et l’**accent** (boutons principaux, liens, interrupteurs). Les
  autres nuances de l’interface en sont tirées. Une couleur se choisit dans la palette de Windows ou s’écrit en
  hexadécimal (`#3a8a22`). Un avertissement signale un texte trop proche du fond ;
- l’**aspect** : les **angles** (carrés, légers, arrondis, très arrondis), la **police des titres** (Space Grotesk,
  Inter ou Segoe UI), les **animations** et les **effets de flou** (arrière-plan flouté derrière les fenêtres, lueurs).

**Enregistrer** l’ajoute aux vignettes et l’applique. Un style personnalisé sélectionné se **modifie**, se
**duplique** ou se **supprime** (un second clic confirme la suppression) ; supprimé, il laisse la place au style
**Herbe**. Les styles personnalisés restent sur ce PC, dans les réglages de l’application (24 au plus).

**Taille de l’interface** : de 80 % à 150 %. Tous les éléments, textes compris, grandissent ou rapetissent ensemble.
`Ctrl` + `+` et `Ctrl` + `-` passent au palier suivant ou précédent depuis n’importe quelle vue, `Ctrl` + `0` revient à
100 %. La taille minimale de la fenêtre grandit avec l’interface, sans dépasser l’écran.

## Dossier des modpacks

Réservé aux publieurs : le dossier où le Studio range les modpacks, un sous-dossier par modpack. **Changer…** en
choisit un autre, **Ouvrir** l’affiche dans l’Explorateur. Voir [Le Studio](studio.md#choisir-le-dossier-des-modpacks).

## CurseForge

L’état de CurseForge : installé (version Overwolf ou application autonome), ou introuvable avec un bouton
**Télécharger**.

- **Relancer CurseForge** ferme puis rouvre CurseForge, pour qu’il affiche un modpack installé pendant qu’il était
  ouvert (voir [Quand CurseForge était déjà ouvert](curseforge.md#quand-curseforge-était-déjà-ouvert)).
- **Ouvrir CurseForge après une installation** (activé par défaut) lance CurseForge à la fin de chaque installation.
  S’il était déjà ouvert, l’application propose plutôt de le relancer.

## Dossier des instances

Le dossier `Instances` de CurseForge, où les modpacks sont installés, et la façon dont il a été trouvé :
**Choisi manuellement**, **Détecté automatiquement depuis CurseForge** ou **Emplacement par défaut de CurseForge**.

- **Modifier…** choisit un autre dossier ;
- **Ouvrir** l’affiche dans l’Explorateur ;
- **Détection automatique** (après un choix manuel) revient à la détection.

À ne modifier que si le dossier d’installation a été changé dans les paramètres Minecraft de CurseForge et que
l’application ne trouve pas les profils. Voir [Le dossier des instances](curseforge.md#le-dossier-des-instances).

## Raccourci

Indique si Modpack Manager a un raccourci sur le bureau.

- **Ajouter au bureau** (ou **Recréer sur le bureau**) crée le raccourci sur le bureau, ou le remplace. Le recréer
  répare aussi une icône restée vide.
- **Autre emplacement…** crée un raccourci à l’endroit choisi.

## Compte CurseForge

Réservé aux publieurs : ce qu’il faut pour travailler avec CurseForge.

- **Clé de l’API CurseForge** : sert à chercher les mises à jour des mods, packs de textures et shaders. Elle se crée
  sur [console.curseforge.com](https://console.curseforge.com/) (**Profile API key**).
- **Jeton d’auteur** : sert à mettre les modpacks en ligne sur les projets CurseForge du publieur. Il se crée sur
  [authors.curseforge.com](https://authors.curseforge.com/account/api-tokens) (**API Tokens**).

Coller la clé ou le jeton dans son champ, puis cliquer sur **Vérifier et enregistrer** : CurseForge doit l’accepter,
sinon rien n’est enregistré. L’état indique s’il est enregistré et accepté. **Retirer** le supprime de
l’application. Les deux sont chiffrés par Windows pour le compte en cours (comme la connexion GitHub) ; ni
l’application, ni le terminal, ni Claude ne les affichent.

## Mises à jour automatiques

Réservé aux publieurs. **Activer** crée la tâche planifiée de Windows qui fait chaque jour, à l’**heure** choisie, les
passages des modpacks dont le tour est venu ; **Réveiller le PC en veille** le sort de veille pour cela.
**Enregistrer** change l’heure ou le réveil, **Retirer la tâche** la supprime. **Confier les échecs à Claude Code**
fait analyser par Claude Code une mise à jour qui échoue aux tests. Voir [Mises à jour automatiques](automatique.md).

## Claude Code et terminal

Réservé aux publieurs. Indique si [Claude Code](https://claude.com/claude-code) est installé sur ce PC et s’il est
connecté aux modpacks. **Connecter** (ou **Reconnecter**) inscrit l’application dans Claude Code : il peut alors
créer, régler et publier les modpacks à la demande du publieur. La section rappelle aussi que les mêmes opérations
existent dans un terminal (`mpm.cmd`). Voir [Claude Code et commandes](commandes.md).

## À propos

Le numéro de la version installée et sa date de publication.

- **Rechercher une mise à jour** interroge GitHub tout de suite. Une mise à jour disponible est proposée en haut de
  la fenêtre ; sinon, une notification confirme que l’application est à jour.
- **Nouveautés** ouvre l’historique des versions de l’application.
- **Documentation** ouvre cette aide.
- **Signaler un problème** ouvre le formulaire de signalement (voir [Signaler un problème](signalement.md)).
- **Dépôt GitHub** ouvre la page du projet dans le navigateur.

## La fenêtre

- La fenêtre s’ouvre en grand, la barre des tâches restant visible. Sa taille minimale est de 960 × 640 pixels, plus
  si l’interface est agrandie (voir [Apparence](#apparence)).
- La barre de titre se fait glisser pour déplacer la fenêtre ; un double-clic l’agrandit ou la ramène à sa taille.
- Les boutons de droite **réduisent**, **agrandissent** (ou ramènent au **niveau inférieur**) et **ferment** la
  fenêtre. En plein écran, le bouton du milieu en fait sortir.
- `F11` passe en plein écran, et en fait sortir en retrouvant la taille d’avant.
- Fermer la fenêtre quitte l’application. Une publication en cours est alors interrompue : ce qui n’était pas
  terminé sera repris à la publication suivante (voir [Publier et supprimer](publication.md#publier-sur-github)).

## Raccourcis clavier

| Touche | Action |
|---|---|
| `F1` | Ouvrir ou fermer l’aide |
| `F11` | Passer en plein écran, ou en sortir |
| `Échap` | Fermer la fenêtre de dialogue, le panneau de détails ou l’aide |
| `Ctrl` + `+` / `Ctrl` + `-` | Agrandir ou réduire l’interface (voir [Apparence](#apparence)) |
| `Ctrl` + `0` | Revenir à la taille normale de l’interface |
| `Entrée` | Valider le formulaire en cours (dépôt, jeton GitHub, nom d’un modpack…) |
| `Ctrl` + `K` | Dans l’aide, rechercher dans toutes les pages |
| `Alt` + `←` | Dans l’aide, revenir à la page précédente |
