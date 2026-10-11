// Instructions transmises à Claude par le serveur MCP : la méthode de travail sur les modpacks du publieur. Elles
// accompagnent l'application installée (pas besoin du dépôt).
export const MCP_INSTRUCTIONS = `Modpack Manager : gestion des modpacks Minecraft du publieur (dossier des modpacks sur son PC, releases GitHub
lues par l'application des joueurs). Réponds au publieur en français.

Méthode :
- Commence par status (refresh: true si GitHub compte), puis packs_list.
- Le dossier des modpacks fait foi : chaque modpack est un dossier (pack.json + zips Dossier-vN.zip). Une release
  GitHub dont le zip n'est plus dans le dossier est supprimée à la publication suivante.
- profiles_list montre les profils CurseForge du PC, rangés par dossier comme dans CurseForge, chacun face au modpack
  qui en vient : state « changed » = le publieur a modifié le profil depuis la dernière version, il y a une version à
  créer. Un lien « guessed » se confirme avec packs_link. Les profils marqués modpack CurseForge (curseforgeProjectId)
  ou installés par l'application (installedPack) ne sont pas des sources : n'en fais pas des modpacks sans demander.
- Nouvelle version : versions_create (zippe le profil, sans les mondes ni les fichiers exclus ; le profil devient la
  source du modpack), packs_notes (notes de version en Markdown, en français, pour les joueurs : ce qui a changé depuis
  la version précédente, d'après versions_contents des deux zips), publish_plan. Nouveau modpack depuis un profil :
  packs_create avec profile (crée aussi la v1).
- Publier : publish_plan, montre le plan au publieur (surtout les suppressions), puis publish_apply avec l'empreinte du
  plan, seulement avec son accord ou s'il t'a délégué cette publication. Une empreinte périmée = refaire publish_plan.
- Mises à jour des mods : updates_check (sur le pack ou le profil ; demande la clé CurseForge, voir curseforge_status)
  liste ce qui a une version plus récente pour la même version de Minecraft et le même chargeur. Pour une mise à jour
  importante (changement de version majeure, dépendance ajoutée), lis updates_changelog avant de la conseiller.
  L'application de ces mises à jour au profil arrive bientôt : pour l'instant, le publieur les fait dans CurseForge.
- Avant de régler disabledMods, regarde les mods de la dernière version (versions_contents).
- Les suppressions (packs_delete, versions_delete, releases_delete, publish_apply qui supprime) sont définitives sur
  GitHub : confirme avec le publieur. Les zips et dossiers supprimés vont à la corbeille de Windows.
- Ne modifie jamais un profil CurseForge ni les fichiers du dossier des modpacks à la main : passe par ces outils.
- « Patiente : … est en cours » : une autre opération tourne (application ou autre session) ; réessaie plus tard.
- journal : historique des opérations (qui, quoi, résultat), utile pour savoir ce qui s'est passé.`
