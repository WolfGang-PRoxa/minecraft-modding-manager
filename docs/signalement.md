# Signaler un problème

Un problème, une idée d’amélioration ? Le formulaire **Signaler un problème** les transmet au mainteneur de
l’application, sous la forme d’une issue GitHub publique qu’il suit et à laquelle il répond.

## Ouvrir le formulaire

- le bouton en forme d’insecte, à droite de la barre de titre ;
- ou **Paramètres → À propos → Signaler un problème**.

## Remplir le formulaire

1. **Un problème** ou **Une suggestion** : le type de signalement.
2. **Titre** : une phrase qui résume, de 5 à 120 caractères. Par exemple : « L’installation s’arrête à 85 % ».
3. **Description** : de 10 à 5 000 caractères. Pour un problème, décris ce que tu faisais, ce qui s’est passé, et ce
   que tu attendais à la place ; recopie le message d’erreur s’il y en a un. Pour une suggestion, dis ce que tu
   aimerais et à quoi ça te servirait.
4. **Modpack concerné** (facultatif) : déjà rempli si le panneau de détails d’un modpack était ouvert.
5. **Joindre les informations techniques** (coché par défaut) : **Voir** affiche exactement ce qui sera joint.

Les informations techniques aident à comprendre un problème, sans rien de personnel (ni chemin de dossier, ni nom
de compte) :

- la version de l’application, et de Windows ;
- ton rôle et le dépôt de modpacks suivi ;
- l’état de CurseForge (détecté, Overwolf ou application autonome) et de son dossier `Instances` (présent ou non,
  détecté ou choisi à la main) ;
- les modpacks installés par l’application, avec leur version.

> [!WARNING]
> Un signalement est **public** : n’y mets rien de personnel (adresse, mot de passe, jeton…).

## Envoyer

**Avec un compte GitHub connecté** (dans l’application, ou une session GitHub CLI du PC), le bas du formulaire
indique « Envoyé avec le compte … ». **Envoyer** crée l’issue directement : l’application affiche son numéro
(« Il porte le numéro #12 sur GitHub »), et **Voir sur GitHub** l’ouvre dans ton navigateur.

**Sans compte connecté**, **Ouvrir sur GitHub** ouvre ton navigateur sur la page de création d’une issue, déjà
remplie : connecte-toi à GitHub si besoin, puis clique sur **Create**. Une description très longue y est raccourcie.

Si GitHub refuse l’envoi direct (jeton expiré, ou limité à un autre dépôt), l’application propose **Ouvrir plutôt le
signalement sur GitHub**.

Les signalements arrivent toujours sur le dépôt de l’application
([WolfGang-PRoxa/minecraft-modpack-manager](https://github.com/WolfGang-PRoxa/minecraft-modpack-manager/issues)),
quel que soit le dépôt de modpacks suivi. Pour un problème propre au contenu d’un modpack publié par quelqu’un
d’autre (un mod qui plante, une quête bloquée), préviens aussi son publieur.

## Après l’envoi

Le mainteneur est prévenu dès que l’issue est créée. Il peut te poser des questions dans l’issue : garde un œil sur
GitHub (tu reçois une notification si tu as créé l’issue avec ton compte). Une correction validée est publiée dans
une prochaine version de l’application, et apparaît dans les [Nouveautés](../CHANGELOG.md).
