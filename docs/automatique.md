# Mises à jour automatiques

Le Studio peut tenir tes modpacks à jour tout seul : à son tour, chaque modpack reçoit les nouvelles versions de ses
mods, packs de textures et shaders, essayées sur une copie de son profil et testées, puis une nouvelle version prête à
valider, ou publiée directement si tu le permets.

## Ce que fait un passage

Un passage traite un modpack à la fois, d’après le **profil CurseForge** d’où viennent ses versions (lié par
**Créer la vN depuis CurseForge**, ou **Lier** dans [Tes profils CurseForge](studio.md#tes-profils-curseforge)) :

1. il cherche les mises à jour du profil sur CurseForge, pour la même version de Minecraft et le même chargeur
   (voir [Mettre à jour les mods](studio.md#mettre-à-jour-les-mods)) ; sans rien de nouveau, il s’arrête là ;
2. il crée la copie d’essai `<profil> (essai)` avec ces mises à jour ; ton profil n’est pas touché ;
3. il teste l’essai : **vérification des fichiers**, puis **test sur un serveur** (voir
   [Tester un profil](studio.md#tester-un-profil)) ;
4. si les tests passent, la mise à jour est **prête, à valider** ; s’ils échouent, l’essai reste là pour que tu le
   regardes.

Avec **Publier seul quand les tests passent**, le passage continue : l’essai est reporté dans ton profil, la version
suivante est créée avec ses notes (la liste des mises à jour), puis publiée sur GitHub et sur CurseForge selon les
cibles du modpack.

Il faut la clé de l’API CurseForge (voir [Compte CurseForge](parametres.md#compte-curseforge)), et le jeton d’auteur
pour publier sur CurseForge. Une mise à jour que l’auteur du mod réserve au téléchargement depuis CurseForge n’est pas
faite : le passage la signale, à faire dans CurseForge.

## Régler un modpack

Sur la carte du modpack, la ligne **Mises à jour…** dit son rythme et la date du prochain passage. **Réglages** ouvre :

- **Fréquence** : chaque semaine, toutes les deux semaines, chaque mois, **à la demande** (réglage par défaut :
  seulement quand tu le lances) ou **jamais** ;
- **Accepter les versions bêta des mods** : sinon, seulement les versions stables ;
- **Publier seul quand les tests passent** : désactivé par défaut. Une version envoyée sur CurseForge ne se retire que
  depuis le site ;
- **Mods figés** : des mods gardés exprès dans leur version, jamais mis à jour. Cherche-les par leur nom parmi les mods
  de la dernière version.

**Rechercher maintenant** lance tout de suite un passage pour ce modpack, quelle que soit sa fréquence. **Arrêter**
l’interrompt.

## Valider une mise à jour

Une mise à jour prête s’affiche en vert sur la carte, avec la liste des mods mis à jour. L’essai est dans CurseForge
après sa relance : tu peux y jouer avant de décider.

- **Créer la vN et publier** reporte l’essai dans ton profil (CurseForge est fermé le temps de l’écriture, puis
  rouvert ; ferme Minecraft avant), crée la version avec ses notes, puis la publie sur GitHub et sur CurseForge selon
  les cibles du modpack ;
- **Créer sans publier** fait de même sans publier : relis ses notes, puis publie-la comme d’habitude ;
- **Abandonner** met l’essai à la corbeille sans rien changer à ton profil.

Une mise à jour qui échoue aux tests s’affiche en rouge, avec la raison. **Voir l’essai** ouvre son dossier,
**Valider quand même** crée la version sans la publier (si tu as vérifié toi-même), **Abandonner** retire l’essai.

Tant qu’un essai attend ta décision, les passages suivants laissent ce modpack de côté.

## La tâche planifiée

Pour que les passages se fassent seuls, active la tâche planifiée dans
[Paramètres → Mises à jour automatiques](parametres.md#mises-à-jour-automatiques) : chaque jour à l’heure choisie,
Windows lance l’application sans fenêtre, qui passe les modpacks dont le tour est venu. Une notification résume
ensuite ce qui a changé ; un clic dessus ouvre le Studio.

- La tâche tourne sous ton compte, seulement quand ta session Windows est ouverte (verrouillée suffit) : il lui faut
  tes connexions GitHub et CurseForge, et de quoi fermer et rouvrir CurseForge.
- **Réveiller le PC en veille** : Windows sort le PC de veille pour le passage. Il faut aussi que « Autoriser les
  minuteurs de réveil » soit activé dans les options d’alimentation de Windows (Panneau de configuration → Options
  d’alimentation → Modifier les paramètres du mode → Paramètres d’alimentation avancés → Veille).
- PC éteint à l’heure prévue : le passage se fait au prochain démarrage.
- Un passage ne démarre pas si un autre tourne déjà (depuis la fenêtre, un terminal ou Claude).

## Claude dans la boucle

Avec **Confier les échecs à Claude Code** (même section des paramètres), une mise à jour qui échoue aux tests est
confiée à Claude Code, s’il est installé sur ton PC. Il lit les rapports de test et les notes de version des mods en
cause, puis écrit sur la carte la cause probable et ce qu’il propose (figer un mod, attendre une version corrigée…).
Il n’a accès qu’à des opérations en lecture : il ne change rien. Chaque analyse utilise ton abonnement Claude.

Dans une session Claude Code connectée à tes modpacks (voir [Claude Code et commandes](commandes.md)), tu peux aussi
lui demander « mets à jour tous mes modpacks » ou « pourquoi la mise à jour de X échoue ? » : il utilise les mêmes
commandes `maintenance`.
