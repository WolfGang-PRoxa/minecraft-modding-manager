// Les identités précédentes de l'application : ce que ses anciennes installations ont laissé sur les PC, et que la
// version actuelle reprend une fois (previousIdentity.ts du moteur et de l'application, et build/installer.nsh).
//  - de la 1.9.0 à la 1.9.x : « Modpack Manager » ;
//  - jusqu'à la 1.8.x : « Modpack Downloader » (le produit s'affichait déjà « Modpack Manager »).
// Une identité se retire quand plus personne n'a de version qui la porte.
export interface PreviousIdentity {
  /** Dossier des données, dans %APPDATA%. */
  dataDir: string
  /** Exécutable, dans le dossier d'installation. */
  executable: string
  /** Dossier d'installation, dans %LOCALAPPDATA%\Programs. */
  installDir: string
  /** Marqueur posé dans chaque profil installé par l'application. */
  instanceMarker: string
  /** Dossier des téléchargements, dans %TEMP%. */
  tempDir: string
  /** Nom du dépôt de l'application (GitHub redirige encore l'ancienne adresse). */
  repoName: string
}

/** De la plus récente à la plus ancienne. */
export const PREVIOUS_IDENTITIES: readonly PreviousIdentity[] = [
  {
    dataDir: 'Modpack Manager',
    executable: 'Modpack Manager.exe',
    installDir: 'minecraft-modpack-manager',
    instanceMarker: '.modpack-manager.json',
    tempDir: 'modpack-manager',
    repoName: 'minecraft-modpack-manager'
  },
  {
    dataDir: 'Modpack Downloader',
    executable: 'Modpack Downloader.exe',
    installDir: 'minecraft-modpack-downloader',
    instanceMarker: '.modpack-downloader.json',
    tempDir: 'modpack-downloader',
    repoName: 'minecraft-modpack-downloader'
  }
]

/**
 * Ce que les deux identités précédentes avaient en commun, sous le nom de produit « Modpack Manager » : nom affiché
 * (raccourcis, « Applications installées »), données locales (%LOCALAPPDATA%), tâche planifiée, serveur MCP.
 */
export const PREVIOUS_PRODUCT = {
  name: 'Modpack Manager',
  localDataDir: 'Modpack Manager',
  maintenanceTask: 'Modpack Manager - mises a jour des modpacks',
  mcpServer: 'modpack-manager'
} as const

export const PREVIOUS_INSTANCE_MARKERS = PREVIOUS_IDENTITIES.map((identity) => identity.instanceMarker)
export const PREVIOUS_EXECUTABLES = PREVIOUS_IDENTITIES.map((identity) => identity.executable)
