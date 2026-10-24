# Modding Manager

[![English](https://img.shields.io/badge/lang-English-2ea44f)](README.md)
[![Français](https://img.shields.io/badge/langue-Fran%C3%A7ais-0366d6)](README.fr.md)

Windows application (formerly **Modpack Manager**) that installs Minecraft modpacks published on GitHub in one click.
Each modpack appears directly in CurseForge, ready to play, and updates without losing worlds or settings; the mods,
resource packs and shaders published alongside are added to it in one click. Authors publish their modpacks, mods,
resource packs, shaders and server plugins with the Studio, in the same application (GitHub, CurseForge, Modrinth,
Hangar).

**[Download the latest version](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/latest)**
· [Documentation (French)](docs/README.md) · [Changelog (French)](CHANGELOG.md)

## Features

- **One-click installation** into CurseForge (Overwolf version or standalone application), with a SHA-256 check of
  every download.
- **In-place updates**: worlds, options, screenshots, resource packs and profile settings are kept.
- **Existing profiles recognized**: the application detects the modpack versions already present in CurseForge, even
  installed by hand, and never modifies a profile it did not install.
- **Studio** for authors: one folder per modpack, version numbering, release notes, cover image, zip contents, and
  publishing that keeps the GitHub releases in sync with the folder, as well as on **CurseForge** (export in the
  CurseForge format, moderation tracking).
- **Mod updates** for a profile, tried on a copy before being kept, and **tests before publishing**: file checks
  (dependencies, versions, incompatibilities), a test server, then a test session with real offline game clients.
  **Automatic updates** chain all of this at the chosen frequency.
- **Claude Code** can drive the Studio (MCP server); the same operations are available on the command line (`mpm`).
- **Application updates** offered at the top of the window, with their release notes, and installed in one click.
- **Built-in help** (`F1`): the whole documentation and the version history, with search.
- **Problem reports** sent from the application to the maintainer.

The application and its documentation are in French.

## Installation

1. Install [CurseForge](https://www.curseforge.com/download/app) if it is not installed yet.
2. Download **Modding-Manager-Setup-x.y.z.exe** from the
   [latest version](https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/latest) and run it. The
   installer is not code-signed for now (see [Code signing policy](#code-signing-policy)): Windows shows "Windows
   protected your PC". Click **More info**, then **Run anyway**. Only download the installer from this page.
3. On first launch, choose **Récepteur** (receiver, the default choice) to receive the modpacks published on this
   repository.
4. In the library, click **Installer**: the modpack appears in CurseForge, in the Minecraft tab.

The application installs for the current Windows account, without administrator rights. Details are in
[Installation et premier lancement](docs/installation.md); for problems, see [Dépannage](docs/depannage.md).
Uninstalling is done from Windows settings (**Apps → Installed apps → Modding Manager → Uninstall**).

## Documentation

The documentation is built into the application (**Aide** button of the title bar, or `F1`) and can also be read
here, in French:

- **Getting started**: [Présentation](docs/presentation.md) · [Installation et premier lancement](docs/installation.md)
- **Playing**: [La bibliothèque](docs/bibliotheque.md) · [CurseForge](docs/curseforge.md)
- **Publishing**: [Devenir publieur](docs/publieur.md) · [Le Studio](docs/studio.md) ·
  [Préparer une version](docs/versions.md) · [Publier et supprimer](docs/publication.md) ·
  [Claude Code et commandes](docs/commandes.md)
- **The application**: [Paramètres](docs/parametres.md) · [Mises à jour](docs/mises-a-jour.md) ·
  [Signaler un problème](docs/signalement.md) · [Nouveautés](CHANGELOG.md)
- **Reference**: [Dépannage](docs/depannage.md) · [Fichiers et dossiers](docs/fichiers.md) ·
  [Confidentialité et sécurité](docs/confidentialite.md) · [Glossaire](docs/glossaire.md)
- **Development**: [architecture, commands, change tracking](docs/developpement.md)

## Development

```bash
npm install
npm run dev              # runs the application with hot reload
npm run studio           # same, opened on the Studio view (--studio option)
npm run typecheck
npm run docs:verifier    # documentation and version history
npm test
npm run changelog        # changes not mentioned in the version history yet
npm run build:win        # local installer in dist/
```

The code layout, the documentation rules, change tracking and the ways to test without risk are described in
[docs/developpement.md](docs/developpement.md).

### Releasing a new version of the application

1. `npm run changelog` checks that every visible change is mentioned in the « Non publié » section of
   [CHANGELOG.md](CHANGELOG.md).
2. `npm run changelog -- --version 1.1.0` turns this section into version 1.1.0 and sets `package.json` to 1.1.0.
3. Commit, then push an `app-v1.1.0` tag:

   ```bash
   git commit -am "chore: version 1.1.0"
   git tag app-v1.1.0
   git push origin main app-v1.1.0
   ```

GitHub Actions checks that the version is in the history, builds the installer, has it signed once signing is set
up (see below) and creates
the release, with the release notes taken from `CHANGELOG.md`. Installed applications then offer the new version at
the top of their window, with its release notes, and update in one click.

### Problem report tracking (maintainer)

The [`relay/`](relay/README.md) folder contains a small service, hosted on Netlify, that emails the repository owner
for each issue and lets the owner, from the buttons of those emails, have the issue fixed, then approve or reject the
proposed fix. Nothing is merged into the main branch without the owner's approval.

### Code signing (maintainer)

The installer is not signed for now. Signing by [SignPath Foundation](https://signpath.org), free for open source
projects, requires a project that already has some public visibility (stars, forks, external references): the
application will be submitted again once the project is better known. Until then, the CI publishes the installer
unsigned; it is ready to sign as soon as the SignPath secret exists.

One-time setup:

1. SignPath Foundation prerequisites: an open source license ([MIT](LICENSE)), two-factor authentication on GitHub and
   SignPath, and a first release of the application already published (`app-v1.0.0`, unsigned).
2. Apply on [signpath.org](https://signpath.org/apply) with the repository address.
3. Once the project is created at SignPath: install the SignPath GitHub application on the repository, link the
   *Trusted Build System* "GitHub.com" to the project, set the content of
   [`.github/signpath/artifact-configuration.xml`](.github/signpath/artifact-configuration.xml) as the default
   artifact configuration, and create an API token for a user allowed to submit signing requests.
4. In GitHub → *Settings* → *Secrets and variables* → *Actions*: the secret `SIGNPATH_API_TOKEN` and the variables
   `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG` (usually
   `release-signing`).

For each `app-v*` tag, the CI sends the installer to SignPath and waits for the signing request to be approved on
signpath.io (an email announces it). The signed installer is then verified and published. Only the installer is
signed: it is the file Windows checks on download.

## Code signing policy

The installer is currently **not signed**. Its integrity is still checked: each update downloaded by the
application is compared to the SHA-256 digest GitHub computes for the published file.

Once signing is set up, free code signing will be provided by [SignPath.io](https://about.signpath.io), with a
certificate by [SignPath Foundation](https://signpath.org), and the installer will show the publisher **SignPath
Foundation**.

Team roles:

- **Committers and reviewers** (modify the code, review outside contributions):
  [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)
- **Approvers** (approve the signing of each release): [WolfGang-PRoxa](https://github.com/WolfGang-PRoxa)

Only installers built by GitHub Actions from this repository will be signed, after manual approval.

### Privacy

Modding Manager collects no data, contains no usage statistics or advertising, and sends nothing to its authors on
its own. It only transmits information to the services needed for what the user asks it to do:

- **GitHub** (`api.github.com`, `github.com` and its file servers), for everyone: listing the modpacks and updates of
  the followed repository, downloading the files the user chooses to install, showing account avatars. In publisher
  mode, the GitHub connection (token) stays encrypted on the PC and is only sent to GitHub, to publish on the chosen
  repository.
- **CurseForge** (`api.curseforge.com`, `minecraft.curseforge.com`, `edge.forgecdn.net`), in publisher mode and with
  the key or token saved by the user: looking for and downloading mod updates, publishing versions.
- **Minecraft and mod loader servers** (Mojang, Fabric, Forge, NeoForge), in publisher mode, when a profile is tested:
  downloading the test server, once per version. The game clients of the test session run offline, without an
  account, and only connect to the test server on the same PC.
- **Claude Code**, only if it has been connected: when **Confier les échecs à Claude Code** is enabled (off by
  default), the summary of a failed automatic update is sent to it, and it forwards it to Anthropic with the user's
  Claude account.

A problem report is only sent when the user fills in and submits the « Signaler un problème » form: it then becomes a
public issue of this repository, with what was written and, if attached, the technical information shown in the form.
The « Offrir un café » button only opens a page in the browser.

No other information is transmitted to any other system. The application changes nothing in the PC configuration
unless asked to (shortcut, scheduled task for automatic updates, Claude Code connection). Details (in French) are in
[Confidentialité et sécurité](docs/confidentialite.md).

License: [MIT](LICENSE).
