# Modding Manager

[![English](https://img.shields.io/badge/lang-English-0366d6)](README.md)
[![Français](https://img.shields.io/badge/langue-Fran%C3%A7ais-2ea44f)](README.fr.md)

Application Windows (anciennement **Modpack Manager**) qui installe en un clic les modpacks Minecraft publiés sur
GitHub. Chaque modpack apparaît directement dans CurseForge, prêt à être lancé, et se met à jour sans perte des mondes
ni des réglages ; les mods, packs de ressources et shaders publiés à côté s'y ajoutent en un clic. Les auteurs publient
leurs modpacks, mods, packs de ressources, shaders et plugins de serveur avec le Studio, dans la même application
(GitHub, CurseForge, Modrinth, Hangar).

**[Télécharger la dernière version](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/latest)**
· [Documentation](docs/README.md) · [Nouveautés](CHANGELOG.md)

## Fonctionnalités

- **Installation en un clic** dans CurseForge (version Overwolf ou application autonome), avec vérification de
  l'empreinte de chaque téléchargement.
- **Mises à jour sur place** : mondes, options, captures d'écran, packs de ressources et réglages du profil sont
  conservés.
- **Profils déjà présents reconnus** : l'application repère les versions déjà présentes dans CurseForge, même
  installées à la main, et ne modifie jamais un profil qu'elle n'a pas installé.
- **Studio** pour les auteurs : un dossier par modpack, numérotation des versions, notes, image, contenu des zips, et
  publication qui met les releases GitHub en accord avec le dossier, et aussi sur **CurseForge** (export au format de
  CurseForge, suivi de la modération).
- **Mises à jour des mods** d'un profil, essayées sur une copie avant d'être gardées, et **tests avant publication** :
  vérification des fichiers (dépendances, versions, incompatibilités), serveur de test, puis partie avec de vrais
  jeux hors ligne. Les **mises à jour automatiques** enchaînent le tout, à la fréquence choisie.
- **Claude Code** peut piloter le Studio (serveur MCP) ; les mêmes opérations existent en ligne de commande (`mpm`).
- **Mises à jour de l'application** proposées en haut de la fenêtre, avec leurs nouveautés, et installées en un clic.
- **Aide intégrée** (`F1`) : toute la documentation et l'historique des versions, avec une recherche.
- **Signalement d'un problème** depuis l'application, transmis au mainteneur.

## Installation

1. Installer [CurseForge](https://www.curseforge.com/download/app) s'il ne l'est pas déjà.
2. Télécharger **Modding-Manager-Setup-x.y.z.exe** depuis la
   [dernière version](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/latest), puis le lancer.
   L'installeur n'est pas signé pour l'instant (voir
   [Politique de signature du code](#politique-de-signature-du-code)) : Windows affiche « Windows a protégé votre
   ordinateur ». Cliquer sur **Informations complémentaires**, puis **Exécuter quand même**. L'installeur ne se
   télécharge que depuis cette page.
3. Au premier lancement, choisir **Récepteur** (le choix par défaut), pour recevoir les modpacks publiés sur ce dépôt.
4. Dans la bibliothèque, cliquer sur **Installer** : le modpack apparaît dans CurseForge, onglet Minecraft.

L'application s'installe pour le compte Windows en cours, sans droits d'administrateur. Le détail est dans
[Installation et premier lancement](docs/installation.md) ; en cas de souci, voir le [Dépannage](docs/depannage.md).
La désinstallation se fait depuis les paramètres de Windows (**Applications → Applications installées → Modpack
Manager → Désinstaller**).

## Documentation

La documentation est intégrée à l'application (bouton **Aide** de la barre de titre, ou `F1`) et se lit aussi ici :

- **Bien démarrer** : [Présentation](docs/presentation.md) · [Installation et premier lancement](docs/installation.md)
- **Jouer** : [La bibliothèque](docs/bibliotheque.md) · [CurseForge](docs/curseforge.md)
- **Publier** : [Devenir publieur](docs/publieur.md) · [Le Studio](docs/studio.md) ·
  [Préparer une version](docs/versions.md) · [Publier et supprimer](docs/publication.md) ·
  [Claude Code et commandes](docs/commandes.md)
- **L'application** : [Paramètres](docs/parametres.md) · [Mises à jour](docs/mises-a-jour.md) ·
  [Signaler un problème](docs/signalement.md) · [Nouveautés](CHANGELOG.md)
- **Référence** : [Dépannage](docs/depannage.md) · [Fichiers et dossiers](docs/fichiers.md) ·
  [Confidentialité et sécurité](docs/confidentialite.md) · [Glossaire](docs/glossaire.md)
- **Développement** : [architecture, commandes, suivi des changements](docs/developpement.md)

## Développement

```bash
npm install
npm run dev              # lance l'application avec rechargement à chaud
npm run studio           # même chose, ouverte sur la vue Studio (option --studio)
npm run typecheck
npm run docs:verifier    # documentation et historique des versions
npm test
npm run changelog        # changements pas encore mentionnés dans l'historique
npm run build:win        # installeur local dans dist/
```

L'organisation du code, les règles de la documentation, le suivi des changements et les moyens de tester sans
risque sont décrits dans [docs/developpement.md](docs/developpement.md).

### Publier une nouvelle version de l'application

1. `npm run changelog` vérifie que chaque changement visible est mentionné dans la section « Non publié » de
   [CHANGELOG.md](CHANGELOG.md).
2. `npm run changelog -- --version 1.1.0` : cette section devient la version 1.1.0, et `package.json` passe en 1.1.0.
3. Committer, puis pousser un tag `app-v1.1.0` :

   ```bash
   git commit -am "chore: version 1.1.0"
   git tag app-v1.1.0
   git push origin main app-v1.1.0
   ```

GitHub Actions vérifie que la version figure dans l'historique, construit l'installeur, le fait signer (voir
ci-dessous) et crée la release, avec les notes de la version tirées de `CHANGELOG.md`. Les applications déjà
installées proposent alors la nouvelle version en haut de leur fenêtre, avec ses nouveautés, et se mettent à jour en
un clic.

### Suivi des signalements (mainteneur)

Le dossier [`relay/`](relay/README.md) contient un petit service, hébergé sur Netlify, qui prévient le propriétaire
du dépôt par mail à chaque issue et lui permet, depuis les boutons de ses mails, de faire corriger l'issue puis de
valider ou d'invalider la correction proposée. Rien n'est fusionné sur la branche principale sans sa validation.

### Signature du code (mainteneur)

L'installeur n'est pas signé pour l'instant. La signature par [SignPath Foundation](https://signpath.org), gratuite
pour les projets open source, demande un projet déjà visible publiquement (étoiles, forks, références extérieures) :
la candidature sera renouvelée quand le projet sera plus connu. D'ici là, la CI publie l'installeur sans signature ;
elle est prête à le faire signer dès que le secret de SignPath existe.

Mise en place, une seule fois :

1. Prérequis de SignPath Foundation : licence open source ([MIT](LICENSE)), double authentification activée sur
   GitHub et sur SignPath, et une première release de l'application déjà publiée (`app-v1.0.0`, non signée).
2. Candidater sur [signpath.org](https://signpath.org/apply) avec l'adresse du dépôt.
3. Une fois le projet créé chez SignPath : installer l'application GitHub de SignPath sur le dépôt, lier le
   *Trusted Build System* « GitHub.com » au projet, définir comme configuration d'artefact par défaut le contenu de
   [`.github/signpath/artifact-configuration.xml`](.github/signpath/artifact-configuration.xml), et créer un jeton d'API
   pour un utilisateur autorisé à soumettre des demandes.
4. Dans GitHub → *Settings* → *Secrets and variables* → *Actions* : le secret `SIGNPATH_API_TOKEN` et les variables
   `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` et `SIGNPATH_SIGNING_POLICY_SLUG` (en général
   `release-signing`).

À chaque tag `app-v*`, la CI envoie l'installeur à SignPath et attend que la demande soit approuvée sur signpath.io
(un e-mail l'annonce). L'installeur signé est ensuite vérifié puis publié. Seul l'installeur est signé : c'est le
fichier que Windows contrôle au téléchargement.

## Politique de signature du code

L'installeur n'est **pas signé** pour l'instant. Son intégrité reste vérifiée : chaque mise à jour téléchargée par
l'application est comparée à l'empreinte SHA-256 que GitHub calcule pour le fichier publié.

Une fois la signature en place, elle sera fournie gratuitement par [SignPath.io](https://about.signpath.io), avec un
certificat de la [SignPath Foundation](https://signpath.org), et l'installeur indiquera l'éditeur **SignPath
Foundation**.

Rôles :

- **Auteurs et relecteurs** (modifient le code, relisent les contributions extérieures) :
  [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)
- **Approbateurs** (autorisent la signature de chaque version) : [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)

Seuls les installeurs construits par GitHub Actions à partir de ce dépôt seront signés, après approbation manuelle.

### Confidentialité

Modding Manager ne collecte aucune donnée, ne contient ni statistiques d'utilisation ni publicité, et n'envoie rien
à ses auteurs de lui-même. Il ne transmet d'informations qu'aux services nécessaires à ce que l'utilisateur lui
demande :

- **GitHub** (`api.github.com`, `github.com` et ses serveurs de fichiers), pour tous : lister les modpacks et les
  mises à jour du dépôt suivi, télécharger les fichiers choisis pour être installés, afficher les avatars des
  comptes. En mode publieur, la connexion GitHub (jeton) reste chiffrée sur le PC et n'est envoyée qu'à GitHub, pour
  publier sur le dépôt choisi.
- **CurseForge** (`api.curseforge.com`, `minecraft.curseforge.com`, `edge.forgecdn.net`), en mode publieur et avec la
  clé ou le jeton enregistrés : chercher et télécharger les mises à jour des mods, publier les versions.
- **Les serveurs de Minecraft et de ses chargeurs** (Mojang, Fabric, Forge, NeoForge), en mode publieur, lors du test
  d'un profil : téléchargement du serveur de test, une fois par version. Les jeux de la partie de test se lancent
  hors ligne, sans compte, et ne se connectent qu'au serveur de test, sur le même PC.
- **Claude Code**, seulement s'il a été connecté : avec **Confier les échecs à Claude Code** activé (désactivé par
  défaut), le résumé d'une mise à jour automatique qui a échoué lui est envoyé, et il le transmet à Anthropic avec le
  compte Claude de l'utilisateur.

Un signalement n'est envoyé qu'une fois le formulaire « Signaler un problème » rempli et validé : il devient alors une
issue publique de ce dépôt, avec le texte saisi et, s'il y est joint, les informations techniques affichées dans le
formulaire. Le bouton « Offrir un café » ouvre seulement une page dans le navigateur.

Aucune autre information n'est transmise à un autre système. L'application ne change rien à la configuration du PC
sans demande explicite (raccourci, tâche planifiée des mises à jour automatiques, connexion de Claude Code). Le
détail est dans [Confidentialité et sécurité](docs/confidentialite.md).

Licence : [MIT](LICENSE).
