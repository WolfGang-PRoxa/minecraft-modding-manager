# Paramètres

Les paramètres s’ouvrent avec le bouton en forme d’engrenage, à droite de la barre de titre. `Échap`, la croix ou un
clic à côté de la fenêtre les referment. Chaque réglage est enregistré dès que tu le modifies.

Les sections **Dossier des modpacks** et **En ligne de commande** n’apparaissent qu’en mode publieur.

## Utilisation

Le rôle et le dépôt suivi. Deux onglets, **Récepteur** et **Publieur**, indiquent le rôle actuel.

**En récepteur**, la ligne **Modpacks de** montre le dépôt dont la Bibliothèque affiche les modpacks. **Changer**
permet d’en suivre un autre (voir
[Suivre les modpacks d’un autre publieur](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur)).

**En publieur**, la section montre :

- **Dépôt GitHub des modpacks**, avec **Changer** pour en choisir un autre (le compte connecté doit pouvoir y
  publier) ;
- **Compte GitHub** : le compte utilisé pour publier, et d’où vient la connexion (voir
  [Connecter ton compte GitHub](publieur.md#connecter-ton-compte-github)) ;
- **Aller au Studio**.

Pour **passer en publieur**, clique sur l’onglet **Publieur** : le formulaire demande le dépôt et le compte GitHub
(voir [Devenir publieur](publieur.md)). Pour **revenir en récepteur**, clique sur l’onglet **Récepteur** : l’onglet
Studio disparaît, la Bibliothèque s’affiche. Ton dossier des modpacks, ta connexion GitHub et tes releases ne sont
pas touchés : repasser en publieur les retrouve.

## Dossier des modpacks

Réservé aux publieurs : le dossier où le Studio range tes modpacks, un sous-dossier par modpack. **Changer…** en
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

À ne modifier que si tu as changé le dossier d’installation dans les paramètres Minecraft de CurseForge et que
l’application ne trouve pas tes profils. Voir [Le dossier des instances](curseforge.md#le-dossier-des-instances).

## Raccourci

Indique si Modpack Manager a un raccourci sur ton bureau.

- **Ajouter au bureau** (ou **Recréer sur le bureau**) crée le raccourci sur le bureau, ou le remplace. Le recréer
  répare aussi une icône restée vide.
- **Autre emplacement…** crée un raccourci à l’endroit de ton choix.

## En ligne de commande

Réservé aux publieurs : rappelle que les opérations du Studio existent aussi dans un terminal. Voir
[En ligne de commande](ligne-de-commande.md).

## À propos

Le numéro de la version installée et sa date de publication.

- **Rechercher une mise à jour** interroge GitHub tout de suite. Une mise à jour disponible est proposée en haut de
  la fenêtre ; sinon, une notification confirme que l’application est à jour.
- **Nouveautés** ouvre l’historique des versions de l’application.
- **Documentation** ouvre cette aide.
- **Signaler un problème** ouvre le formulaire de signalement (voir [Signaler un problème](signalement.md)).
- **Dépôt GitHub** ouvre la page du projet dans ton navigateur.

## La fenêtre

- La fenêtre s’ouvre en grand, la barre des tâches restant visible. Sa taille minimale est de 960 × 640 pixels.
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
| `Entrée` | Valider le formulaire en cours (dépôt, jeton GitHub, nom d’un modpack…) |
| `Ctrl` + `K` | Dans l’aide, rechercher dans toutes les pages |
| `Alt` + `←` | Dans l’aide, revenir à la page précédente |
