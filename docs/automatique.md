# Mises à jour automatiques

Le Studio peut tenir les modpacks à jour tout seul : à son tour, chaque modpack reçoit les nouvelles versions de ses
mods, packs de textures et shaders, essayées sur une copie de son profil et testées, puis une nouvelle version prête à
valider, ou publiée directement si le modpack est réglé ainsi.

## Ce que fait un passage

Un passage traite un modpack à la fois, d’après le **profil CurseForge** d’où viennent ses versions (lié par
**Créer la vN depuis CurseForge**, ou **Lier** dans [Les profils CurseForge](studio.md#les-profils-curseforge)) :

1. il cherche les mises à jour du profil sur CurseForge, pour la même version de Minecraft et le même chargeur
   (voir [Mettre à jour les mods](studio.md#mettre-à-jour-les-mods)) ; sans rien de nouveau, il s’arrête là ;
2. il crée la copie d’essai `<profil> (essai)` avec ces mises à jour ; le profil d’origine n’est pas touché ;
3. il teste l’essai : **vérification des fichiers**, puis **partie avec des joueurs** : un serveur et deux vrais
   joueurs qui le rejoignent (voir [Tester un profil](studio.md#tester-un-profil)). Si la partie est impossible sur ce
   PC (mémoire insuffisante, jeu jamais lancé depuis CurseForge), seul le serveur est testé, et c’est signalé. Il en
   va de même si la partie échoue aussi sur le profil d’origine : les mises à jour n’y sont pour rien, seul le serveur
   les départage ;
4. il compare les journaux de l’essai à ceux du profil d’origine (testé lui aussi, une fois, s’il ne l’a pas encore
   été) : une erreur qui n’apparaît qu’avec les mises à jour est signalée ;
5. si les tests passent, la mise à jour est **prête, à valider** ; s’ils échouent, l’essai reste en place pour être
   examiné.

Avec **Publier seul quand les tests passent**, le passage continue : l’essai est reporté dans le profil, la version
suivante est créée avec ses notes (la liste des mises à jour), puis publiée sur GitHub et sur CurseForge selon les
cibles du modpack. Une erreur nouvelle dans les journaux, ou une partie avec des joueurs qui n’a pas pu se faire,
retient cette publication : la mise à jour attend alors une validation, avec **À regarder avant de publier**. Si
l’essai n’a pas pu être reporté (CurseForge qui ne se ferme pas, Minecraft lancé depuis le profil…), la mise à jour,
qui a passé les tests, attend aussi une validation, avec la raison.

Pendant la partie de test, les fenêtres du jeu s’ouvrent derrière les autres, puis se ferment seules : la tâche
planifiée de la nuit les ouvre aussi (le PC doit être allumé ou réveillé, sa session ouverte ou verrouillée).

Il faut la clé de l’API CurseForge (voir [Compte CurseForge](parametres.md#compte-curseforge)), et le jeton d’auteur
pour publier sur CurseForge. Un fichier que l’auteur du mod réserve au téléchargement depuis CurseForge est pris sur
le site de CurseForge, comme depuis un navigateur : sa page de téléchargement est ouverte dans une fenêtre cachée, et
le fichier reçu n’est gardé que si son empreinte est celle publiée. Si le site ne l’envoie pas, la mise à jour est à
faire dans CurseForge, et une mise à jour qui a besoin de ce fichier (dépendance obligatoire) n’est pas faite non
plus : le jeu ne démarrerait pas sans lui.

## Régler un modpack

Sur la carte du modpack, la ligne **Mises à jour…** dit son rythme et la date du prochain passage. La fréquence dit
seulement quand le modpack doit passer : c’est la [tâche planifiée](#la-tâche-planifiée) qui lance les passages. Tant
qu’elle n’existe pas, la ligne n’annonce pas de date mais **Pas de tâche planifiée : rien ne se lancera seul**, avec
**Activer la tâche**, qui ouvre son réglage. **Réglages** ouvre :

- **Fréquence** : chaque semaine, toutes les deux semaines, chaque mois, **à la demande** (réglage par défaut :
  seulement sur demande explicite) ou **jamais** ;
- **Accepter les versions bêta des mods** : sinon, seulement les versions stables ;
- **Publier seul quand les tests passent** : désactivé par défaut. Une version envoyée sur CurseForge ne se retire que
  depuis le site ;
- **Mods figés** : des mods gardés exprès dans leur version, jamais mis à jour. Ils se cherchent par leur nom parmi
  les mods de la dernière version.

**Rechercher maintenant** lance tout de suite un passage pour ce modpack, quelle que soit sa fréquence. **Arrêter**
l’interrompt.

## Valider une mise à jour

Une mise à jour prête s’affiche en vert sur la carte, avec la liste des mods mis à jour. L’essai est dans CurseForge
après sa relance : une partie dessus permet de vérifier avant de décider.

- **Créer la vN et publier** reporte l’essai dans le profil (CurseForge est fermé le temps de l’écriture, puis
  rouvert ; fermer Minecraft avant), crée la version avec ses notes, puis la publie sur GitHub et sur CurseForge selon
  les cibles du modpack ;
- **Créer sans publier** fait de même sans publier : ses notes peuvent alors être relues avant une publication
  habituelle ;
- **Abandonner** met l’essai à la corbeille sans rien changer au profil.

Une mise à jour qui échoue aux tests s’affiche en rouge, avec la raison. **Voir l’essai** ouvre son dossier,
**Valider quand même** crée la version sans la publier (après une vérification à la main), **Abandonner** retire
l’essai.

Tant qu’un essai attend une décision, les passages suivants laissent ce modpack de côté.

Un essai gardé ou abandonné ailleurs (depuis les mises à jour du profil, dans un terminal ou par Claude) retire aussi
la mise à jour en attente de la carte. Si le dossier de l’essai a disparu autrement, la carte cesse de la montrer, et
**Abandonner** la retire.

## La tâche planifiée

Pour que les passages se fassent seuls, activer la tâche planifiée dans
[Paramètres → Mises à jour automatiques](parametres.md#mises-à-jour-automatiques) : chaque jour à l’heure choisie,
Windows lance l’application sans fenêtre, qui passe les modpacks dont le tour est venu. Une notification résume
ensuite ce qui a changé ; un clic dessus ouvre le Studio.

- La tâche tourne sous le compte Windows du publieur, seulement quand sa session est ouverte (verrouillée suffit) :
  il lui faut les connexions GitHub et CurseForge, et de quoi fermer et rouvrir CurseForge.
- **Réveiller le PC en veille** : Windows sort le PC de veille pour le passage. Il faut aussi que « Autoriser les
  minuteurs de réveil » soit activé dans les options d’alimentation de Windows (Panneau de configuration → Options
  d’alimentation → Modifier les paramètres du mode → Paramètres d’alimentation avancés → Veille).
- PC éteint à l’heure prévue : le passage se fait au prochain démarrage.
- Un passage ne démarre pas si un autre tourne déjà (depuis la fenêtre, un terminal ou Claude).

## Claude dans la boucle

Avec **Confier les échecs à Claude Code** (même section des paramètres), une mise à jour qui échoue aux tests est
confiée à Claude Code, s’il est installé sur le PC. Il lit les rapports de test et les notes de version des mods en
cause, puis écrit sur la carte la cause probable et ce qu’il propose (figer un mod, attendre une version corrigée…).
Il n’a accès qu’à des opérations en lecture : il ne change rien. Chaque analyse utilise l’abonnement Claude du
publieur. Si Claude Code ne répond pas (introuvable, connexion expirée, limite d’utilisation, délai de 10 minutes
dépassé), la carte affiche **Analyse impossible** avec la raison, notée aussi dans le journal des opérations.

Dans une session Claude Code connectée aux modpacks (voir [Claude Code et commandes](commandes.md)), il suffit aussi
de lui demander « mets à jour tous mes modpacks » ou « pourquoi la mise à jour de X échoue ? » : il utilise les mêmes
commandes `maintenance`.
