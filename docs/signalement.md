# Signaler un problème

Un problème, une idée d’amélioration ? Le formulaire **Signaler un problème** les transmet au mainteneur de
l’application, sous la forme d’une issue GitHub publique qu’il suit et à laquelle il répond.

## Ouvrir le formulaire

- le bouton en forme d’insecte, à droite de la barre de titre ;
- ou **Paramètres → À propos → Signaler un problème**.

## Remplir le formulaire

1. **Un problème** ou **Une suggestion** : le type de signalement.
2. **Titre** : une phrase qui résume, de 5 à 120 caractères. Par exemple : « L’installation s’arrête à 85 % ».
3. **Description** : de 10 à 5 000 caractères. Pour un problème, décrire ce qui était en cours, ce qui s’est passé,
   et ce qui était attendu à la place ; recopier le message d’erreur s’il y en a un. Pour une suggestion, dire ce qui
   serait souhaité et à quoi cela servirait.
4. **Modpack concerné** (facultatif) : déjà rempli si le panneau de détails d’un modpack était ouvert.
5. **Joindre les informations techniques** (coché par défaut) : **Voir** affiche exactement ce qui sera joint.

Les informations techniques aident à comprendre un problème, sans rien de personnel (ni chemin de dossier, ni nom
de compte) :

- la version de l’application, et de Windows ;
- le rôle choisi et le dépôt de modpacks suivi ;
- l’état de CurseForge (détecté, Overwolf ou application autonome) et de son dossier `Instances` (présent ou non,
  détecté ou choisi à la main) ;
- les modpacks installés par l’application, avec leur version.

> [!WARNING]
> Un signalement est **public** : il ne doit rien contenir de personnel (adresse, mot de passe, jeton…).

## Envoyer

**Avec un compte GitHub connecté** (dans l’application, ou une session GitHub CLI du PC), le bas du formulaire
indique « Envoyé avec le compte … ». **Envoyer** crée l’issue directement : l’application affiche son numéro
(« Il porte le numéro #12 sur GitHub »), et **Voir sur GitHub** l’ouvre dans le navigateur.

**Sans compte connecté**, **Ouvrir sur GitHub** ouvre le navigateur sur la page de création d’une issue, déjà
remplie : se connecter à GitHub si besoin, puis cliquer sur **Create**. Une description très longue y est raccourcie.

Si GitHub refuse l’envoi direct (jeton expiré, ou limité à un autre dépôt), l’application propose **Ouvrir plutôt le
signalement sur GitHub**.

Les signalements arrivent toujours sur le dépôt de l’application
([WolfGang-PRoxa/minecraft-modding-manager](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/issues)),
quel que soit le dépôt de modpacks suivi. Pour un problème propre au contenu d’un modpack publié par quelqu’un
d’autre (un mod qui plante, une quête bloquée), mieux vaut prévenir aussi son publieur.

## Après l’envoi

Le mainteneur est prévenu dès que l’issue est créée, avec une évaluation automatique de son contenu par Claude
(voir [Confidentialité](confidentialite.md#les-signalements)). Il peut poser des questions dans l’issue : GitHub envoie une
notification à l’auteur de l’issue, si elle a été créée avec son compte. Une correction validée est publiée dans une
prochaine version de l’application, et apparaît dans les [Nouveautés](../CHANGELOG.md).
