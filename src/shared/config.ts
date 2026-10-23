import type { RepoRef } from './types'

// Nom de l'application, affiché partout (aussi dans package.json et electron-builder.yml), et nom de son dossier de
// données (%APPDATA%\Modpack Manager) et de son exécutable. L'identité d'avant la 1.9.0 est dans previousIdentity.ts.
export const APP_NAME = 'Modpack Manager'
// Identifiant de l'application pour Windows (barre des tâches, raccourcis, notifications) : l'appId d'electron-builder.yml.
export const APP_USER_MODEL_ID = 'com.wolfgangproxa.modpackmanager'

/** Page de soutien du développeur (bouton « Offrir un café » de la barre de titre). */
export const SUPPORT_URL = 'https://buymeacoffee.com/wolfgang_proxa'

// Dépôt de l'application : ses mises à jour (tags app-v*) en viennent toujours,
// et c'est la source des modpacks par défaut. Un publieur peut en choisir une autre.
export const APP_REPO: RepoRef = { owner: 'WolfGang-PRoxa', name: 'minecraft-modpack-manager' }
export const APP_REPO_URL = `https://github.com/${APP_REPO.owner}/${APP_REPO.name}`

// Conventions de tags :
//  - modpack : pack-<id>-v<version>  (ex. pack-create-plus-v12)
//  - autres contenus (mod-, rp-, shader-, plugin-) : voir shared/content.ts
//  - application : app-v<version>     (ex. app-v1.0.0)
export const MODPACK_TAG_PREFIX = 'pack-'
export const APP_TAG_PREFIX = 'app-v'

// Asset décrivant un modpack dans chaque release (généré par le Studio).
export const MODPACK_MANIFEST_ASSET = 'modpack.json'
// Asset décrivant un autre contenu (mod, pack de ressources, shader, plugin) : jamais modpack.json, que les
// applications installées prendraient pour un modpack.
export const CONTENT_MANIFEST_ASSET = 'content.json'

// Fichier déposé dans chaque instance installée par l'application.
export const INSTANCE_MARKER_FILE = '.modpack-manager.json'

// Suffixe de la copie d'essai d'un profil, où les mises à jour sont appliquées et testées.
export const TRIAL_PROFILE_SUFFIX = ' (essai)'

// Fichier de métadonnées d'une instance CurseForge.
export const CURSEFORGE_INSTANCE_FILE = 'minecraftinstance.json'

// Identifiant de l'app CurseForge dans Overwolf.
export const CURSEFORGE_OVERWOLF_UID = 'cchhcaiapeikjbdbpfplgmpobbcdkdaphclbmkbj'

export const CURSEFORGE_DOWNLOAD_URL = 'https://www.curseforge.com/download/app'

// Application OAuth GitHub pour « Se connecter avec GitHub » (flux par code, sans secret : l'identifiant est public).
// Tant qu'il est vide, la connexion se fait en collant un jeton.
export const GITHUB_OAUTH_CLIENT_ID = ''
