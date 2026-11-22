# Changelog

[Français](CHANGELOG.fr.md)

All notable changes to Modding Manager (Modpack Manager up to 1.9, Modpack Downloader up to 1.0.5), from the most
recent to the oldest. The application shows the French version of this history in **Aide → Nouveautés**; its
interface is in French, so its labels are quoted as they appear.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). To keep this file up to date, see
[Suivi des changements](docs/developpement.md#suivi-des-changements) (French).

## [Unreleased]

## [2.6.0] - 2026-11-21

### Added

- Automatic modpack updates: a new version of an installed modpack installs itself, whether the window is open or
  closed, keeping worlds and settings as with **Mettre à jour**. Never during a game launched with that modpack, and
  CurseForge is not opened for it; a notification announces the new version. A player who deliberately went back to
  a previous version keeps it. Enabled by default, it can be turned off in **Paramètres → Démarrage et mises à
  jour**.
- Adjustable check frequency in **Paramètres → Démarrage et mises à jour**, from every minute to every 6 hours: for
  published modpacks (every 5 minutes by default, instead of 30) and for new versions of the application (every 10
  minutes by default, instead of 6 hours in the background).

### Changed

- Lighter checks: the application first reads the GitHub releases feed, which does not count toward the limit of 60
  requests per hour, and only reads the full list again if the feed has changed (or every 30 minutes). Frequent
  checks therefore do not reach that limit.

## [2.5.0] - 2026-11-17

### Added

- Mod updates: a file that its author only allows to be downloaded from CurseForge is no longer left out. The
  application fetches it from the CurseForge website, as a browser would, in a hidden window, and only keeps it if its
  hash matches the published one. Automatic updates benefit from this too.

### Fixed

- Automatic updates: an update that passed the tests but could not be carried over to the profile (CurseForge not
  closing, immediately restarted by Overwolf) now waits for validation, with the reason, instead of counting as a
  failure.
- Automatic updates: an update that needs a mod that cannot be downloaded is no longer applied to the trial copy,
  where it prevented the game from starting; it is left to be done in CurseForge.
- Automatic updates: when the test game also fails on the original profile, the updates are no longer blamed: only
  the server decides between them, and automatic publishing waits for a validation.
- Test with players: profiles on Forge 47.4.28 (and any version whose game CurseForge has not prepared yet) no longer
  crash before joining the game ("Modules minecraft and _1._20._1 export package…").
- Claude in the loop: a failure analysis that does not succeed (Claude Code not found, expired connection, timeout…)
  shows **Analyse impossible** with the reason, also written to the log, instead of disappearing without a trace.
- Studio: the **Tous mes modpacks** entry becomes **Tous mes contenus**, and the **Mes modpacks** title becomes **Mes
  contenus**: they also show mods, resource packs, shaders and plugins.
- Settings: the columns are balanced and end at the same height, instead of letting the last sections pile up in the
  first one. Only the content scrolls: the scrollbar no longer spills over the rounded corners of the window, and the
  title stays visible.

## [2.4.1] - 2026-11-16

### Fixed

- The application icon in the notification area (and in the hidden icons menu) shows its logo again, instead of the
  generic Windows icon that made it unrecognizable.

## [2.4.0] - 2026-11-13

### Added

- **Paramètres → Fenêtre à l’ouverture**: the window opens maximized (by default) or at the size and position chosen
  on a map of the screens, at launch as well as when it is reopened from the background.

### Changed

- Closing the window no longer quits the application: it keeps running in the background, with its icon in the
  notification area (at the bottom right of the screen), and reopens immediately with a click on that icon, from the
  Start menu or from its shortcut. To quit it: right-click the icon, then **Quitter Modding Manager**.
- When launched with Windows, the application now starts in the background, without a window. **Paramètres →
  Démarrage et mises à jour → Ouvrir la fenêtre au démarrage** restores opening minimized in the taskbar.
- Since it no longer closes, the application also checks for updates every 6 hours and when the PC wakes up: a new
  version installs itself while it runs in the background, never interrupting an open window or an operation in
  progress. The setting becomes **Se mettre à jour automatiquement**.

### Fixed

- Studio: a modpack set to an update frequency no longer announces a "next" date as long as the Windows scheduled
  task does not exist, since nothing would run. Its card says **Pas de tâche planifiée : rien ne se lancera seul**,
  with **Activer la tâche**, which opens the setting in the settings window. The modpack settings window and
  `mpm maintenance status` report it too.

## [2.3.2] - 2026-11-11

### Changed

- Studio: the versions of a mod that only differ by what follows a `+` (`1.0.0+26.3-fabric`, `1.0.0+1.21.5-forge`…,
  one per jar and per Minecraft version) are grouped on a single line, "Version 1.0.0", with all their jars. Its
  badges count the versions already online, **Notes** writes the same notes for all of them, and a single button
  publishes those not yet on CurseForge or Modrinth, one after the other. Each jar remains a separate version on
  Modrinth, and they can be published in any order.

- Application updates now only download the parts of the installer that changed, often a few megabytes instead of
  the whole installer. To do so, the application keeps the installer of the installed version. This applies from the
  update following this one: this one is still downloaded in full.

### Fixed

- Studio: a NeoForge mod for Minecraft 1.20.4 or older (a `mods.toml` file that depends on NeoForge, alone or next to
  `neoforge.mods.toml`) is no longer mistaken for a Forge mod: it is published under NeoForge only on CurseForge and
  Modrinth.

## [2.3.1] - 2026-11-04

### Changed

- Studio: once **Publier** is clicked, to GitHub, CurseForge, Modrinth or Hangar, the window closes and the upload
  continues in the background. The application remains usable meanwhile: a panel at the bottom right follows the
  upload in every view (**Détails** and **Arrêter** for GitHub), and a notification announces the end. A failure
  stays displayed until it is closed.
- Closing the application during a publication first asks for confirmation, instead of interrupting it immediately.

## [2.3.0] - 2026-10-26

### Added

- The application starts with Windows, minimized in the taskbar. A click on its icon opens it maximized. Can be turned
  off in **Paramètres → Démarrage et mises à jour → Lancer avec Windows**.
- A new version of the application installs itself when it starts, then the application restarts. Can be turned off
  in **Paramètres → Démarrage et mises à jour → Se mettre à jour au démarrage**: the update is then offered at the
  top of the window.

## [2.2.1] - 2026-10-26

### Changed

- Studio: the folder that holds modpacks, mods, resource packs, shaders and plugins is now called the **dossier des
  contenus** (content folder), and the default folder becomes `C:\Users\<name>\Modding Manager` (instead of
  `Modpacks`). A folder already chosen does not change; it can be renamed or replaced in **Paramètres → Dossier des
  contenus**.

## [2.2.0] - 2026-10-26

### Fixed

- Studio: a resource pack or a shader can be uploaded to CurseForge again. The upload failed with "Invalid game
  version ID": the application marked it `Client`, which CurseForge refuses on these projects.

## [2.1.0] - 2026-10-26

### Added

- Studio: mods, resource packs, shaders, plugins and modpacks without a profile can be sorted into **groups**,
  collapsible subfolders of the left column. The group is set in **Infos et image** (**Groupe** field), or with the
  `packs group` command. Nothing moves on disk or for players.

### Fixed

- Studio: a modpack, content or version whose name has an accent or an en dash ("Lumière", "MA3D – Plants") can be
  deleted again: moving it to the recycle bin failed with "introuvable" (not found).

## [2.0.0] - 2026-10-24

<!-- moteur des mods, décrit avec leur interface : b49e265 -->

### Added

- Studio: the publisher's **mods** are published like their modpacks. **Nouveau contenu** starts from the folder
  where the mod project puts its jars, which stays linked: new versions are detected there and imported in one click.
  Each version becomes a GitHub release, and is uploaded to CurseForge with its Minecraft version, loader and
  dependencies. Also from the terminal and Claude Code (`content` commands).
- Studio: server **plugins** (Paper, Spigot, Bukkit, Purpur, Folia) can be published too, from the folder where their
  project puts its jars, to GitHub, Modrinth and **Hangar** (key in Paramètres → **Compte Hangar**; `hangar`
  commands).
- Library: published **mods**, **resource packs** and **shaders** are shown below the modpacks. They can be added in
  one click to the profiles installed by the application, where they stay when the modpack updates; another version
  can be installed or removed from their page.
- Studio: **resource packs** and **shaders** can be published too, from the folder of the pack being created (zipped
  for each version) or from zips. The Minecraft versions of a resource pack are read from its `pack.mcmeta`; those of
  a shader are entered by hand.
- Studio: mods can also be published to **Modrinth**, with a token saved in Paramètres → **Compte Modrinth**
  (`modrinth` commands).
- Paramètres → **Apparence**: six color styles to choose from (including **Neige**, a light style, and **Contraste
  élevé**, high contrast), and custom styles to create: background, text and accent colors, corners, heading font,
  animations and blur effects, with a preview.
- The interface size can be set from 80% to 150%, in Paramètres → Apparence or with `Ctrl` + `+`, `Ctrl` + `-` and
  `Ctrl` + `0`.

### Changed

- The application is now called **Modding Manager**: it now also manages mods, resource packs, shaders and plugins.
  The update carries everything over by itself, without asking anything: settings, connections, test results,
  installed modpacks, desktop shortcut and pins, and for a publisher, automatic updates and the connection to Claude
  Code (see [Passage à la 2.0.0](docs/mises-a-jour.md#passage-à-la-200)). Its repository becomes
  `WolfGang-PRoxa/minecraft-modding-manager` (the old address redirects to it).
- Settings: the window is wider and lays out its sections side by side, in two columns, or three for a publisher on a
  large screen. It no longer needs to be scrolled to see everything.

## [1.9.3] - 2026-10-20

<!-- relais du mainteneur, sans effet dans l’application : aa93f74 2f35a2d 2d8faaf -->

### Fixed

- Studio, automatic updates: a pending update whose trial copy was kept or discarded elsewhere (profile updates,
  terminal, Claude) no longer stays displayed on the modpack card. Before, its section could no longer be removed:
  **Abandonner** and **Valider quand même** failed for lack of a trial copy.

## [1.9.2] - 2026-10-20

<!-- relais du mainteneur, sans effet dans l’application : b983e05 -->

### Added

- A warning reminds, when following a repository other than the default one, that a modpack contains code that runs
  during a game: only follow the repository of a trusted person.

### Security

- A modpack whose hash is unknown is no longer installed, and an application update for which GitHub gives no hash is
  no longer downloaded: nothing would prove that the received file is the published one.
- The **Ouvrir** buttons now only open folders, never a file or a program.
- The application window refuses camera, microphone, location and other permissions (only copying to the clipboard
  remains allowed), and no longer runs any script written in the page.
- Studio: the Forge and NeoForge installers used by server tests are checked against the hash published by their
  website, and a mod without a hash on CurseForge is no longer updated by the application.
- Update of the MCP SDK used by the connection to Claude Code.

## [1.9.1] - 2026-10-20

### Changed

- The help is rewritten in a neutral tone, without addressing the reader informally, and several pages are clarified
  (testing a version before publishing, shortcut recreated after moving to 1.9.0).
- The project presentation on GitHub now exists in English (shown by default) and in French.

## [1.9.0] - 2026-10-20

### Changed

- The application takes the name **Modpack Manager** everywhere: executable `Modpack Manager.exe`, installed in
  `Programs\minecraft-modpack-manager`, data in `%APPDATA%\Modpack Manager`, repository
  `WolfGang-PRoxa/minecraft-modpack-manager`. The update carries everything over by itself: the old application is
  removed, your settings, GitHub connection and installed modpacks are kept, and your shortcuts, taskbar pins, the
  scheduled task and the connection to Claude Code launch the new one (see
  [Passage à la 1.9.0](docs/mises-a-jour.md#passage-à-la-200)).
- The **Confidentialité et sécurité** help page lists every service the application contacts, and when.

## [1.8.3] - 2026-10-19

### Added

- **Offrir un café** button, at the top right: the developer's Buy Me a Coffee page, to support the project.

### Changed

- Drop-down menus in the application's colors: rounded list, current choice checked, with the keyboard as with the
  mouse. Checkboxes and radio buttons follow the same style.

## [1.8.2] - 2026-10-19

### Changed

- Studio: versions also leave out the Distant Horizons cache of visited servers (often several GB), Essential data
  (account, friends), Simple Voice Chat recordings and microphone settings, and per-world JEI data.

### Fixed

- Studio: **Garder l’essai** properly closes CurseForge when it runs in Overwolf (it stayed open, locked profile files
  and could rewrite its mod list). Carrying over is now all or nothing: if a file stays in use by another program,
  your profile is restored exactly as before, instead of being left half updated.
- Studio: a modpack published only on CurseForge is no longer limited to 2 GB: that limit is GitHub's.

## [1.8.1] - 2026-10-19

### Changed

- Studio: on a version's line, the zip name is no longer cut off. The badges (GitHub, CurseForge, tests) move below
  the name, and the buttons below them when the window is narrow. The badge of a version online on the website
  becomes **Publiée sur CurseForge**, so it is no longer confused with **Version sur CurseForge** (the version is in
  your profiles).

## [1.8.0] - 2026-10-19

### Added

- Studio: **test game with real players**. In a profile's tests, the test server starts, then 1 to 4 real Minecraft
  games join it with all the profile's mods (client-side ones included): they spread out across the world, at night,
  and the test checks that none crashes or gets disconnected. The players have no account: they are offline games
  that only connect to the test server, on your PC. **Tout tester** runs files, server and game in a row. As
  commands: `tests players`, `tests all`.
- Studio: the file check also verifies the **versions required** by each mod (of Minecraft, of the loader and of other
  mods) and the **declared incompatibilities**, as the game will do at startup.
- Studio: errors in the server and game logs are reported, even when they start.
- Studio: each version carries the result of its latest tests (**Testée**, **Testée en partie**, **Tests en échec**,
  **Pas testée**), shown again when publishing to GitHub and CurseForge.

### Changed

- Automatic updates: the trial copy goes through the game with players, and its logs are compared with those of your
  profile. An error that only appears with the updates is reported and holds back automatic publishing.

### Fixed

- File check: mods embedded by a Forge mod in `META-INF/jars` are recognized (false missing dependencies, such as ESL
  for Create: New Age); a multi-loader jar is read with the description of the profile's loader; a mod made for
  another loader is reported as ignored by the game, no longer as an error.

## [1.7.0] - 2026-10-19

### Added

- Studio: the **Publié sur CurseForge** line of a modpack linked to its project says how many versions are already
  there, and which one is the latest ("28 versions, dernière : V27"). A click opens the list of all its versions,
  including those uploaded from the website: number, date, type, Minecraft versions, moderation status, link to each
  file's page. On version lines, the **Sur CurseForge** badge also appears for numbers already uploaded from the
  website. The `curseforge versions` command gives the same list.

### Fixed

- Studio: a version whose number is already on CurseForge (uploaded from the website), or older than the latest one
  there, no longer offers **Publier sur CurseForge**, and its upload is refused.

## [1.6.0] - 2026-10-11

### Added

- Studio: **automatic updates**. Each modpack has its frequency (every week, every two weeks, every month, on demand
  or never): on its turn, its mods are updated on a copy of its profile, tested (files then server), and the new
  version waits for your validation on its card, or publishes itself if you allow it. Frozen mods, beta versions
  optional. A Windows scheduled task runs the passes every day, waking the PC if you want, then a notification sums
  up what changed. Claude Code can analyze failures. As commands: `maintenance run`, `maintenance validate`,
  `maintenance schedule`…

## [1.5.0] - 2026-10-11

### Added

- Studio: **publishing to CurseForge**. Link a modpack to its CurseForge project (numbering continues after your
  versions already published), then publish its latest version in one click: export in CurseForge's format, display
  name `<name>_V<N>.zip`, release notes, then moderation tracking on the card. A modpack can be published on GitHub,
  on CurseForge, or both. As commands: `curseforge link`, `curseforge publish`, `curseforge versions`…
- Studio: **tests before publishing**, in the details of a profile or of its trial copy. **Vérifier les fichiers**
  finds duplicate mods, missing dependencies and mods made for another loader in a few seconds; **Tester sur un
  serveur** starts a real Minecraft server with the profile's mods and says whether it starts, or why it crashes. The
  same tests as commands: `tests check` and `tests server`.

## [1.4.0] - 2026-10-11

### Added

- Studio: **mod updates**. In the details of a profile, the application looks on CurseForge for new versions of its
  mods, texture packs and shaders (same Minecraft version, same loader, missing dependencies included). Those you
  choose are applied to a **trial copy** of the profile, to test in CurseForge; you keep it (its updates go into your
  profile, your worlds, settings and disabled mods stay yours) or you discard it. Your profile is never changed
  without your consent.
- The same operations as commands, for you and for Claude: `updates check`, `updates changelog`, `updates apply`,
  `updates promote`, `updates discard`.

### Fixed

- An installed modpack gets its own CurseForge identity, everywhere in the profile: it can no longer be confused with
  the publisher's profile the version comes from. Versions created afterwards no longer contain the identity of the
  publisher's profile.

## [1.3.0] - 2026-10-11

### Added

- Publishers: **Paramètres → Compte CurseForge** saves your CurseForge API key and your author token, verified by
  CurseForge then encrypted by Windows. They will prepare mod updates and uploads to CurseForge.
- Studio: your **CurseForge profiles**, sorted in the same folders as in CurseForge, each facing the modpack that
  comes from it. A badge says whether it is up to date or has changed since the last version, and a click offers the
  next step: create the next version, or create a modpack from a profile (with its v1) in one go.

## [1.2.0] - 2026-10-11

### Added

- Publishers: **Claude Code** can manage your modpacks. Connect it in **Paramètres → Claude Code et terminal**: on
  request, it creates a version from your CurseForge profile, configures the modpack, writes the notes and publishes,
  showing you beforehand what will change on GitHub.
- Publishers: every Studio operation also exists as a command, in a terminal (`mpm.cmd`, next to the application).

### Changed

- The Studio, the terminal and Claude can no longer get in each other's way: only one write operation runs at a time,
  and the application update waits for it to finish.
- Each Studio operation (version creation, settings, publishing, deletion) is recorded in a log, with its author and
  its result.

## [1.1.0] - 2026-10-11

### Changed

- Modpack Downloader becomes **Modpack Manager**, with a new logo: in the application, on the icon of the program and
  its shortcuts, and in the installer windows. The update keeps everything: settings, GitHub connection, installed
  modpacks, shortcuts and taskbar pins.

## [1.0.5] - 2026-10-03

### Added

- Studio: **Réglages des versions** for each modpack. Choose the files you never publish (your game options, your
  shaders, a personal mod…), the mods players receive disabled, and whether the configurations they changed are kept
  on each update.
- Studio: a zip that contains excluded files reports it before being published, and **Retirer du zip** removes them.
- Mods a publisher offers as optional are installed disabled: enable the ones you want in CurseForge.
- An **update** window, distinct from the installation one, shows your version and the new one (for example
  `1.0.4 → 1.0.5`).
- When launched while the application is open, the installer warns that it will close it (**Fermer et continuer** or
  **Annuler**), then reopens it at the end.

### Changed

- Updating a modpack keeps the mods you enabled or disabled in CurseForge, and, if the publisher chose so, the
  configuration files you changed.
- The installer and uninstaller windows take the application's style: dark background, logo, colors, buttons and
  progress bar.
- When run again while the application is already installed, the installer shows a clear page (**Ouvrir
  l’application**, **Réinstaller** or **Annuler**) instead of a Yes / No / Cancel box. Likewise when a more recent
  version is installed.
- Uninstalling asks for confirmation in a window of the same style, then closes by itself.

## [1.0.4] - 2026-10-03

### Added

- **Built-in help**: all the application's documentation (installing and playing, publishing with the Studio,
  settings, troubleshooting…) opens with the **Aide** button of the title bar or the `F1` key, with a search across
  all pages.
- **Nouveautés** page: the application's version history, available at any time from the help or **Paramètres → À
  propos**.
- After an application update, the notification offers **Voir les nouveautés**, which highlights the changes since
  your previous version.
- The update bar presents what the new version brings before installing it (**Nouveautés** button).

### Fixed

- Studio: the message that refuses a CurseForge export names the right button, "Créer la v… depuis CurseForge".

## [1.0.3] - 2026-10-02

### Added

- Studio: deleting a version (its zip goes to the recycle bin and its release is removed from GitHub right away) or a
  whole modpack, after a confirmation that says what will change for players. Releases whose zip has disappeared can
  also be removed without waiting for the publication. <!-- 1f4d1c4 -->
- Studio: **Contenu** button on each version and each zip to sort, to see its mods (name given by CurseForge, author,
  link to their page) and browse its files, with a preview of configurations and images. <!-- 335bee1 -->
- The window opens maximized, with the taskbar still visible; `F11` enters and exits full screen. <!-- 8f35361 -->

### Changed

- The "dans ton CurseForge" badge becomes "Version sur CurseForge : v2" ("Versions" if there are several).
  <!-- 3e5ccb0 -->

### Fixed

- A modpack installed or updated while CurseForge was open did not appear in it, or showed "404": the application
  reports it and offers **Relancer CurseForge**, which reopens CurseForge with all its profiles. The same button is in
  **Paramètres → CurseForge**. <!-- 58d0a17 -->
- A square or portrait modpack image was cropped: it is now shown in full in its frame. <!-- cbda3b3 -->
- After an application update, the desktop shortcut could lose its icon. <!-- bbf0122 -->

## [1.0.2] - 2026-10-02

### Added

- **Signaler un problème** (report a problem): a form, opened by the bug-shaped button of the title bar or from
  **Paramètres → À propos**, to describe a problem or suggest an idea. With a connected GitHub account, the report
  directly becomes an issue of the repository; otherwise, the GitHub page opens already filled in. <!-- 71316b4 -->
- Each report is tracked: the maintainer is notified right away and can have a fix prepared, published after their
  validation. <!-- c678c5f -->

### Fixed

- The button that cancels an installation is announced as "Annuler l’installation", with the typographic apostrophe
  used in the rest of the interface. <!-- 38fe174 -->

## [1.0.1] - 2026-10-02

### Added

- The application shows the modpack versions already present in your CurseForge ("v2 dans ton CurseForge"), even if
  it is not the latest one and even for a profile it did not install: it recognizes it by its mods. It never changes
  such a profile: **Installer** creates a separate one. <!-- 86621eb -->
- Studio: each modpack shows which version is in your CurseForge and whether it is online. Versions already published
  are completed on the next publication so that they are recognized on players' machines (only their `modpack.json`
  is sent again). <!-- 86621eb -->

## [1.0.0] - 2026-10-02

First public release.

### Added

- **Library**: the modpacks published on the followed repository, with their notes and version history. One-click
  installation, directly as a CurseForge profile, with a hash check of each download.
- In-place modpack update: worlds, options, screenshots, resource packs and profile settings (memory, Java arguments)
  are kept.
- Detection of CurseForge (Overwolf or standalone app) and of its `Instances` folder, changeable in the settings;
  CurseForge opens after an installation.
- Offline operation with the last known list, and GitHub read again every 30 minutes while the application stays
  open.
- **Receiver** and **publisher** roles, chosen at first launch and changeable in the settings. A receiver can follow
  the modpacks of another public repository.
- **Studio** for publishers: one folder per modpack, numbering of dropped zips, release notes, cover image, zip
  created directly from a CurseForge instance, and publishing that brings the GitHub releases in line with the
  folder. The same operations exist on the command line.
- Publisher's GitHub connection, encrypted by Windows and shared with the command line, falling back to a GitHub CLI
  session or the `GITHUB_TOKEN` variable.
- Shortcut on the desktop, or at the location of your choice, offered at first launch.
- The installer recognizes an application already installed: it offers to open it rather than reinstall it, and warns
  before going back to an older version.
- Application updates offered at the top of the window, whatever the view: verified download, automatic installation
  and restart.

[Unreleased]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.6.0...HEAD
[2.6.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.5.0...app-v2.6.0
[2.5.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.4.1...app-v2.5.0
[2.4.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.4.0...app-v2.4.1
[2.4.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.3.2...app-v2.4.0
[2.3.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.3.1...app-v2.3.2
[2.3.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.3.0...app-v2.3.1
[2.3.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.2.1...app-v2.3.0
[2.2.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.2.0...app-v2.2.1
[2.2.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.1.0...app-v2.2.0
[2.1.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v2.0.0...app-v2.1.0
[2.0.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.3...app-v2.0.0
[1.9.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.2...app-v1.9.3
[1.9.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.1...app-v1.9.2
[1.9.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.9.0...app-v1.9.1
[1.9.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.3...app-v1.9.0
[1.8.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.2...app-v1.8.3
[1.8.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.1...app-v1.8.2
[1.8.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.8.0...app-v1.8.1
[1.8.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.7.0...app-v1.8.0
[1.7.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.6.0...app-v1.7.0
[1.6.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.5.0...app-v1.6.0
[1.5.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.4.0...app-v1.5.0
[1.4.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.3.0...app-v1.4.0
[1.3.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.2.0...app-v1.3.0
[1.2.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.1.0...app-v1.2.0
[1.1.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.5...app-v1.1.0
[1.0.5]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.4...app-v1.0.5
[1.0.4]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.3...app-v1.0.4
[1.0.3]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.2...app-v1.0.3
[1.0.2]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.1...app-v1.0.2
[1.0.1]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/compare/app-v1.0.0...app-v1.0.1
[1.0.0]: https://github.com/WolfGang-PRoxa/minecraft-modding-manager/releases/tag/app-v1.0.0
