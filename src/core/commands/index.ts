import { curseforgeExport, curseforgeLink, curseforgePublish, curseforgeTargets, curseforgeVersions } from './curseforge'
import { curseforgeStatus, journal, status } from './general'
import {
  maintenanceConfigure,
  maintenanceDiscard,
  maintenanceRun,
  maintenanceSchedule,
  maintenanceStatusCommand,
  maintenanceValidate
} from './maintenance'
import { modrinthLink, modrinthPublish, modrinthStatus, modrinthVersions } from './modrinth'
import { contentCreate, contentCurseforge, contentDelete, contentImport, contentMinecraft, contentNotes, contentSource, contentVersions, contentZip } from './content'
import { packsCover, packsCreate, packsDelete, packsEdit, packsList, packsNotes, packsSettings, packsShow } from './packs'
import { publishApply, publishPlan, rangerApply, rangerPlan, releasesDelete } from './publish'
import { packsLink, profilesList } from './profiles'
import type { Command } from './registry'
import { testsAll, testsCheck, testsPlayers, testsServer } from './tests'
import { updatesApply, updatesChangelog, updatesCheck, updatesDiscard, updatesPromote } from './updates'
import { versionsContents, versionsCreate, versionsDelete, versionsFile, versionsStrip } from './versions'

/** Toutes les commandes, dans l'ordre de l'aide. */
export const COMMANDS = [
  status,
  packsList,
  packsShow,
  packsCreate,
  packsEdit,
  packsSettings,
  packsNotes,
  packsCover,
  packsLink,
  packsDelete,
  profilesList,
  versionsCreate,
  versionsContents,
  versionsFile,
  versionsStrip,
  versionsDelete,
  contentCreate,
  contentVersions,
  contentImport,
  contentZip,
  contentSource,
  contentMinecraft,
  contentNotes,
  contentDelete,
  contentCurseforge,
  updatesCheck,
  updatesChangelog,
  updatesApply,
  updatesPromote,
  updatesDiscard,
  testsCheck,
  testsServer,
  testsPlayers,
  testsAll,
  maintenanceStatusCommand,
  maintenanceConfigure,
  maintenanceRun,
  maintenanceValidate,
  maintenanceDiscard,
  maintenanceSchedule,
  rangerPlan,
  rangerApply,
  publishPlan,
  publishApply,
  curseforgeLink,
  curseforgeTargets,
  curseforgeExport,
  curseforgePublish,
  curseforgeVersions,
  modrinthLink,
  modrinthPublish,
  modrinthVersions,
  releasesDelete,
  curseforgeStatus,
  modrinthStatus,
  journal
] as unknown as Command[]
