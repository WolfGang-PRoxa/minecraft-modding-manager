# Modpack Manager

Application Windows pour installer en un clic les modpacks Minecraft publiés sur GitHub. Le modpack apparaît
directement dans CurseForge, prêt à être lancé, et se met à jour sans perdre tes mondes. Les auteurs de modpacks les
publient avec le Studio, dans la même application.

**[Télécharger la dernière version](https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/releases/latest)**
· [Documentation](docs/README.md) · [Nouveautés](CHANGELOG.md)

## Fonctionnalités

- **Installation en un clic** dans CurseForge (version Overwolf ou application autonome), avec vérification de
  l'empreinte de chaque téléchargement.
- **Mises à jour sur place** : mondes, options, captures d'écran, packs de ressources et réglages du profil sont
  conservés.
- **Ce que tu as déjà** : l'application reconnaît les versions présentes dans ton CurseForge, même installées à la
  main, et ne modifie jamais un profil qu'elle n'a pas installé.
- **Studio** pour les auteurs : un dossier par modpack, numérotation des versions, notes, image, contenu des zips, et
  publication qui met les releases GitHub en accord avec le dossier. Les mêmes opérations existent en ligne de
  commande.
- **Mises à jour de l'application** proposées en haut de la fenêtre, avec leurs nouveautés, et installées en un clic.
- **Aide intégrée** (`F1`) : toute la documentation et l'historique des versions, avec une recherche.
- **Signalement d'un problème** depuis l'application, transmis au mainteneur.

## Installation

1. Installe [CurseForge](https://www.curseforge.com/download/app) si ce n'est pas déjà fait.
2. Télécharge **Modpack-Manager-Setup-x.y.z.exe** depuis la
   [dernière version](https://github.com/WolfGang-PRoxa/minecraft-modpack-downloader/releases/latest) et lance-le.
   Les installeurs signés indiquent l'éditeur **SignPath Foundation** (voir
   [Politique de signature du code](#politique-de-signature-du-code)). Si Windows affiche « Windows a protégé votre
   ordinateur », clique sur **Informations complémentaires**, puis **Exécuter quand même** : cet avertissement
   apparaît pour un installeur non signé, et parfois pour une nouvelle version signée, le temps que Microsoft la
   connaisse.
3. Au premier lancement, choisis **Récepteur** (le choix par défaut) : tu reçois les modpacks publiés sur ce dépôt.
4. Dans la bibliothèque, clique sur **Installer** : le modpack est dans CurseForge, onglet Minecraft.

L'application s'installe pour ton compte Windows, sans droits d'administrateur. Le détail est dans
[Installation et premier lancement](docs/installation.md) ; en cas de souci, voir le [Dépannage](docs/depannage.md).

## Documentation

La documentation est intégrée à l'application (bouton **Aide** de la barre de titre, ou `F1`) et se lit aussi ici :

- **Bien démarrer** : [Présentation](docs/presentation.md) · [Installation et premier lancement](docs/installation.md)
- **Jouer** : [La bibliothèque](docs/bibliotheque.md) · [CurseForge](docs/curseforge.md)
- **Publier** : [Devenir publieur](docs/publieur.md) · [Le Studio](docs/studio.md) ·
  [Préparer une version](docs/versions.md) · [Publier et supprimer](docs/publication.md) ·
  [En ligne de commande](docs/ligne-de-commande.md)
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
npm run changelog        # changements pas encore mentionnés dans l'historique
npm run build:win        # installeur local dans dist/
```

L'organisation du code, les règles de la documentation, le suivi des changements et les moyens de tester sans
risque sont décrits dans [docs/developpement.md](docs/developpement.md).

### Publier une nouvelle version de l'application

1. `npm run changelog` : vérifie que chaque changement visible est mentionné dans la section « Non publié » de
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

L'installeur est signé gratuitement par [SignPath Foundation](https://signpath.org), réservé aux projets open source.
Tant que la signature n'est pas configurée, la CI publie l'installeur sans signature.

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

À chaque tag `app-v*`, la CI envoie l'installeur à SignPath et attend : approuve la demande sur signpath.io (un e-mail
te prévient). L'installeur signé est ensuite vérifié puis publié. Seul l'installeur est signé : c'est le fichier que
Windows contrôle au téléchargement.

## Politique de signature du code

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).
(Signature gratuite fournie par SignPath.io, certificat de la SignPath Foundation.)

Rôles :

- **Auteurs** (modifient le code sans relecture) : [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)
- **Relecteurs** (relisent les contributions extérieures) : [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)
- **Approbateurs** (autorisent la signature de chaque version) : [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)

Seuls les installeurs construits par GitHub Actions à partir de ce dépôt sont signés, après approbation manuelle.

### Confidentialité

Modpack Manager ne collecte aucune donnée et n'envoie rien à ses auteurs de lui-même. Il ne contacte que GitHub
(`api.github.com`, `github.com` et ses serveurs de fichiers) : pour lister les modpacks et les mises à jour du dépôt
suivi, télécharger les fichiers que tu choisis d'installer et afficher les avatars des comptes. En mode publieur, la
connexion GitHub (jeton) reste chiffrée sur ton PC et n'est envoyée qu'à GitHub, pour publier sur le dépôt choisi.
Un signalement n'est envoyé que si tu remplis et valides le formulaire « Signaler un problème » : il devient alors
une issue publique de ce dépôt, avec ce que tu as écrit et, si tu les joins, les informations techniques affichées
dans le formulaire.
Aucune autre information n'est transmise à un autre système. Le détail est dans
[Confidentialité et sécurité](docs/confidentialite.md).

Licence : [MIT](LICENSE).
