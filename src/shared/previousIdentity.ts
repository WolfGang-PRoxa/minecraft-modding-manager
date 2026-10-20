// L'identité de l'application jusqu'à la 1.8.x, sous son ancien nom « Modpack Downloader » : ce que les installations
// d'avant la 1.9.0 ont laissé sur les PC, et que la 1.9.0 reprend une fois (previousIdentity.ts du moteur et de
// l'application, et build/installer.nsh). Tout ce qui s'y rapporte est à retirer quand plus personne n'a de version
// d'avant la 1.9.0 (prévu en 2.0).
export const PREVIOUS_IDENTITY = {
  /** Dossier des données, dans %APPDATA%. */
  dataDir: 'Modpack Downloader',
  /** Exécutable, dans le dossier d'installation. */
  executable: 'Modpack Downloader.exe',
  /** Dossier d'installation, dans %LOCALAPPDATA%\Programs. */
  installDir: 'minecraft-modpack-downloader',
  /** Marqueur posé dans chaque profil installé par l'application. */
  instanceMarker: '.modpack-downloader.json',
  /** Dossier des téléchargements, dans %TEMP%. */
  tempDir: 'modpack-downloader',
  /** Nom du dépôt de l'application avant son renommage (GitHub redirige encore l'ancienne adresse). */
  repoName: 'minecraft-modpack-downloader'
} as const
