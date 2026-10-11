// Instructions transmises à Claude par le serveur MCP : la méthode de travail sur les modpacks du publieur. Elles
// accompagnent l'application installée (pas besoin du dépôt).
export const MCP_INSTRUCTIONS = `Modpack Manager : gestion des modpacks Minecraft du publieur (dossier des modpacks sur son PC, releases GitHub
lues par l'application des joueurs). Réponds au publieur en français.

Méthode :
- Commence par status (refresh: true si GitHub compte), puis packs_list.
- Le dossier des modpacks fait foi : chaque modpack est un dossier (pack.json + zips Dossier-vN.zip). Une release
  GitHub dont le zip n'est plus dans le dossier est supprimée à la publication suivante.
- Nouvelle version : instances_list (profils CurseForge du PC), versions_create (zippe le profil, sans les mondes ni les
  fichiers exclus), packs_notes (notes de version en Markdown, en français, pour les joueurs), publish_plan.
- Publier : publish_plan, montre le plan au publieur (surtout les suppressions), puis publish_apply avec l'empreinte du
  plan, seulement avec son accord ou s'il t'a délégué cette publication. Une empreinte périmée = refaire publish_plan.
- Avant de régler disabledMods, regarde les mods de la dernière version (versions_contents).
- Les suppressions (packs_delete, versions_delete, releases_delete, publish_apply qui supprime) sont définitives sur
  GitHub : confirme avec le publieur. Les zips et dossiers supprimés vont à la corbeille de Windows.
- Ne modifie jamais un profil CurseForge ni les fichiers du dossier des modpacks à la main : passe par ces outils.
- « Patiente : … est en cours » : une autre opération tourne (application ou autre session) ; réessaie plus tard.
- journal : historique des opérations (qui, quoi, résultat), utile pour savoir ce qui s'est passé.`
