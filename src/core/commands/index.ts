import { journal, status } from './general'
import { packsCover, packsCreate, packsDelete, packsEdit, packsList, packsNotes, packsSettings, packsShow } from './packs'
import { publishApply, publishPlan, rangerApply, rangerPlan, releasesDelete } from './publish'
import type { Command } from './registry'
import { instancesList, versionsContents, versionsCreate, versionsDelete, versionsFile, versionsStrip } from './versions'

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
  packsDelete,
  instancesList,
  versionsCreate,
  versionsContents,
  versionsFile,
  versionsStrip,
  versionsDelete,
  rangerPlan,
  rangerApply,
  publishPlan,
  publishApply,
  releasesDelete,
  journal
] as unknown as Command[]
