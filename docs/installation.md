# Installation et premier lancement

Cette page explique comment installer Modding Manager, ce qui se passe au premier lancement, et comment
désinstaller l’application proprement.

## Installer l’application

1. Installer [CurseForge](https://www.curseforge.com/download/app) s’il ne l’est pas déjà : c’est depuis
   CurseForge que les modpacks se lancent.
2. Télécharger **Modding-Manager-Setup-x.y.z.exe** depuis la
   [dernière version publiée](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/latest).
3. Lancer le fichier téléchargé. Une petite fenêtre aux couleurs de l’application montre la progression :
   l’installation prend quelques secondes, sans aucune question, puis l’application s’ouvre.

L’application s’installe pour le compte Windows en cours seulement, **sans droits d’administrateur**, dans
`%LOCALAPPDATA%\Programs\minecraft-modding-manager` (soit `C:\Users\<nom>\AppData\Local\Programs\…`). Un
raccourci **Modding Manager** est ajouté au menu Démarrer.

> [!NOTE]
> Windows affiche « Windows a protégé votre ordinateur » : cliquer sur **Informations complémentaires**, puis
> **Exécuter quand même**. Cet avertissement de SmartScreen apparaît parce que l’installeur n’est pas signé pour
> l’instant (voir [Confidentialité et sécurité](confidentialite.md#signature-de-linstalleur)) ; il ne se télécharge
> que depuis la [page officielle des versions](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases).

## Le premier lancement

L’écran **Bienvenue dans Modding Manager** demande comment l’application sera utilisée :

- **Récepteur** (le choix par défaut) : pour installer les modpacks publiés et jouer. **Continuer** affiche la
  Bibliothèque, avec les modpacks du dépôt `WolfGang-PRoxa/minecraft-modding-manager`.
- **Publieur** : pour créer des modpacks et les publier sur son propre dépôt GitHub. Après avoir indiqué ce dépôt et
  connecté le compte GitHub, **Devenir publieur** affiche le Studio. Tout est détaillé dans
  [Devenir publieur](publieur.md).

Rien n’est définitif : le rôle et le dépôt suivi se changent à tout moment dans
[Paramètres → Utilisation](parametres.md#utilisation).

> [!TIP]
> Un joueur dont les modpacks sont publiés sur un autre dépôt choisit **Récepteur**, puis indique ce dépôt dans
> [Paramètres → Utilisation → Modpacks de](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur).

## Le raccourci sur le bureau

L’installeur ne pose pas de raccourci sur le bureau : l’application le propose dans la Bibliothèque, avec le
bandeau **Ajouter un raccourci ?**

- **Ajouter au bureau** crée le raccourci sur le bureau ;
- **Ailleurs…** permet de choisir l’emplacement (un dossier, une clé USB…) ;
- **Non merci** ferme le bandeau pour de bon.

Le raccourci se crée ou se recrée plus tard dans [Paramètres → Raccourci](parametres.md#raccourci). Recréer le
raccourci répare aussi une icône restée vide.

## Lancer l’application

Modding Manager se lance depuis le menu Démarrer ou depuis son raccourci. La fenêtre s’ouvre en grand, la barre des
tâches restant visible ; `F11` passe en plein écran.

L’application ne s’ouvre qu’une fois : la relancer alors qu’elle tourne déjà ramène simplement sa fenêtre au premier
plan. Un publieur retrouve la dernière vue utilisée (Bibliothèque ou Studio).

## Relancer l’installeur

Un installeur relancé alors que l’application est déjà installée le détecte et s’adapte :

| Application déjà installée | Ce que fait l’installeur |
|---|---|
| La même version | La fenêtre **Déjà installé** propose de l’ouvrir. **Ouvrir l’application** (ou `Entrée`) l’ouvre, **Réinstaller** la réinstalle, **Annuler** (ou `Échap`) ne fait rien. |
| Une version plus récente | La fenêtre **Version plus récente installée** prévient avant un retour en arrière. **Ouvrir la …** ouvre la version installée, **Installer la …** revient à la version de l’installeur, **Annuler** ne fait rien. |
| Une version plus ancienne | Il la met à jour, sans question. |

Si l’application est ouverte, la fenêtre **Application ouverte** prévient qu’elle va être fermée pour continuer.
**Fermer et continuer** (ou `Entrée`) la ferme, comme un clic sur la croix de sa fenêtre, puis poursuit ;
**Annuler** ne fait rien. L’application est rouverte à la fin. Si un modpack est en cours d’installation ou de
publication, mieux vaut attendre qu’il se termine avant de continuer.

L’en-tête de la fenêtre de progression dit ce qui se passe : **Installation**, **Réinstallation**, **Mise à jour**
(en bleu, avec l’ancienne et la nouvelle version, par exemple `1.0.3 → 1.0.4`) ou **Retour à une version
précédente** (en orange). Une mise à jour a aussi son propre titre de fenêtre, « Mise à jour de Modding Manager ».

Une installation abîmée (fichiers de l’application supprimés à la main) est simplement réinstallée. En mode
silencieux (`/S`), l’installeur ne pose aucune question et n’affiche aucune fenêtre : il ferme l’application si elle
est ouverte, et ne la rouvre pas.

Les réglages, la connexion GitHub et les modpacks installés ne sont jamais touchés par une réinstallation.

## Désinstaller

Dans **Paramètres Windows → Applications → Applications installées**, chercher **Modding Manager**, puis choisir
**Désinstaller**. Une fenêtre demande confirmation : il faut cliquer sur **Désinstaller** (la touche `Entrée` ne
suffit pas, pour éviter une fausse manœuvre) ; elle se ferme d’elle-même une fois l’application retirée. Si
l’application est ouverte, la confirmation le signale : elle est fermée avant d’être retirée. Le raccourci du bureau
est retiré avec l’application (un raccourci créé ailleurs reste à supprimer à la main).

La désinstallation laisse en place :

- **les modpacks installés** : ce sont des profils CurseForge comme les autres, toujours jouables ;
- **les réglages et la connexion GitHub**, dans `%APPDATA%\Modding Manager` : supprimer ce dossier pour ne rien
  laisser derrière (et pour effacer le jeton GitHub enregistré) ;
- pour un publieur, **le dossier des modpacks** et les releases publiées sur GitHub.

Le détail de chaque fichier est dans [Fichiers et dossiers](fichiers.md).
