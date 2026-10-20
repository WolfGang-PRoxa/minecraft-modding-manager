# Installation et premier lancement

Cette page explique comment installer Modpack Manager, ce qui se passe au premier lancement, et comment
désinstaller l’application proprement.

## Installer l’application

1. Installe [CurseForge](https://www.curseforge.com/download/app) si ce n’est pas déjà fait : c’est depuis
   CurseForge que tu lanceras les modpacks.
2. Télécharge **Modpack-Manager-Setup-x.y.z.exe** depuis la
   [dernière version publiée](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager/releases/latest).
3. Lance le fichier téléchargé. Une petite fenêtre aux couleurs de l’application montre la progression :
   l’installation prend quelques secondes, sans aucune question, puis l’application s’ouvre.

L’application s’installe pour ton compte Windows seulement, **sans droits d’administrateur**, dans
`%LOCALAPPDATA%\Programs\minecraft-modpack-manager` (soit `C:\Users\<toi>\AppData\Local\Programs\…`). Un raccourci
**Modpack Manager** est ajouté au menu Démarrer.

> [!NOTE]
> Windows peut afficher « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires**, puis
> **Exécuter quand même**. Cet avertissement de SmartScreen apparaît pour un installeur non signé, et parfois pour
> une nouvelle version signée, le temps que Microsoft la connaisse. Les installeurs signés indiquent l’éditeur
> **SignPath Foundation** (voir [Confidentialité et sécurité](confidentialite.md#signature-de-linstalleur)).

## Le premier lancement

L’écran **Bienvenue dans Modpack Manager** te demande comment tu vas utiliser l’application :

- **Récepteur** (le choix par défaut) : tu installes les modpacks publiés et tu joues. Clique sur **Continuer** : la
  Bibliothèque s’affiche, avec les modpacks du dépôt `WolfGang-PRoxa/minecraft-modpack-manager`.
- **Publieur** : tu crées des modpacks et tu les publies sur ton dépôt GitHub. Indique ce dépôt et connecte ton
  compte GitHub, puis clique sur **Devenir publieur** : le Studio s’affiche. Tout est détaillé dans
  [Devenir publieur](publieur.md).

Rien n’est définitif : le rôle et le dépôt suivi se changent à tout moment dans
[Paramètres → Utilisation](parametres.md#utilisation).

> [!TIP]
> Un joueur dont les modpacks sont publiés sur un autre dépôt choisit **Récepteur**, puis indique ce dépôt dans
> [Paramètres → Utilisation → Modpacks de](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur).

## Le raccourci sur le bureau

L’installeur ne pose pas de raccourci sur le bureau : l’application te le propose dans la Bibliothèque, avec le
bandeau **Ajouter un raccourci ?**

- **Ajouter au bureau** crée le raccourci sur ton bureau ;
- **Ailleurs…** te laisse choisir l’emplacement (un dossier, une clé USB…) ;
- **Non merci** ferme le bandeau pour de bon.

Tu peux créer ou recréer le raccourci plus tard dans [Paramètres → Raccourci](parametres.md#raccourci). Recréer le
raccourci répare aussi une icône restée vide.

## Lancer l’application

Lance Modpack Manager depuis le menu Démarrer ou depuis ton raccourci. La fenêtre s’ouvre en grand, la barre des
tâches restant visible ; `F11` passe en plein écran.

L’application ne s’ouvre qu’une fois : la relancer alors qu’elle tourne déjà ramène simplement sa fenêtre au premier
plan. Un publieur retrouve la dernière vue utilisée (Bibliothèque ou Studio).

## Relancer l’installeur

Si tu relances un installeur alors que l’application est déjà installée, il le détecte et s’adapte :

| Application déjà installée | Ce que fait l’installeur |
|---|---|
| La même version | La fenêtre **Déjà installé** propose de l’ouvrir. **Ouvrir l’application** (ou `Entrée`) l’ouvre, **Réinstaller** la réinstalle, **Annuler** (ou `Échap`) ne fait rien. |
| Une version plus récente | La fenêtre **Version plus récente installée** prévient avant un retour en arrière. **Ouvrir la …** ouvre la version installée, **Installer la …** revient à la version de l’installeur, **Annuler** ne fait rien. |
| Une version plus ancienne | Il la met à jour, sans question. |

Si l’application est ouverte, la fenêtre **Application ouverte** prévient qu’elle va être fermée pour continuer.
**Fermer et continuer** (ou `Entrée`) la ferme, comme un clic sur la croix de sa fenêtre, puis poursuit ;
**Annuler** ne fait rien. L’application est rouverte à la fin. Si un modpack est en cours d’installation ou de
publication, attends qu’il se termine avant de continuer.

L’en-tête de la fenêtre de progression dit ce qui se passe : **Installation**, **Réinstallation**, **Mise à jour**
(en bleu, avec l’ancienne et la nouvelle version, par exemple `1.0.3 → 1.0.4`) ou **Retour à une version
précédente** (en orange). Une mise à jour a aussi son propre titre de fenêtre, « Mise à jour de Modpack Manager ».

Une installation abîmée (fichiers de l’application supprimés à la main) est simplement réinstallée. En mode
silencieux (`/S`), l’installeur ne pose aucune question et n’affiche aucune fenêtre : il ferme l’application si elle
est ouverte, et ne la rouvre pas.

Tes réglages, ta connexion GitHub et tes modpacks ne sont jamais touchés par une réinstallation.

## Désinstaller

Ouvre **Paramètres Windows → Applications → Applications installées**, cherche **Modpack Manager**, puis
**Désinstaller**. Une fenêtre demande confirmation : clique sur **Désinstaller** (la touche `Entrée` ne suffit pas,
pour éviter une fausse manœuvre) ; elle se ferme d’elle-même une fois l’application retirée. Si l’application est
ouverte, la confirmation le signale : elle est fermée avant d’être retirée. Le raccourci du bureau est retiré avec
l’application (un raccourci créé ailleurs reste à supprimer à la main).

La désinstallation laisse en place :

- **tes modpacks** : ce sont des profils CurseForge comme les autres, toujours jouables ;
- **tes réglages et ta connexion GitHub**, dans `%APPDATA%\Modpack Manager` : supprime ce dossier pour ne rien
  laisser derrière toi (et pour effacer le jeton GitHub enregistré) ;
- pour un publieur, **le dossier des modpacks** et les releases publiées sur GitHub.

Le détail de chaque fichier est dans [Fichiers et dossiers](fichiers.md).
