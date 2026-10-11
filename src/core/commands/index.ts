import { curseforgeStatus, journal, status } from './general'
import { packsCover, packsCreate, packsDelete, packsEdit, packsList, packsNotes, packsSettings, packsShow } from './packs'
import { publishApply, publishPlan, rangerApply, rangerPlan, releasesDelete } from './publish'
import { packsLink, profilesList } from './profiles'
import type { Command } from './registry'
import { testsCheck, testsServer } from './tests'
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
  updatesCheck,
  updatesChangelog,
  updatesApply,
  updatesPromote,
  updatesDiscard,
  testsCheck,
  testsServer,
  rangerPlan,
  rangerApply,
  publishPlan,
  publishApply,
  releasesDelete,
  curseforgeStatus,
  journal
] as unknown as Command[]
