import { create } from 'zustand';
import { HOME } from './content';

export interface DocsLocation {
  slug: string;
  /** Ancre d'un titre de la page, ou null pour le haut de la page. */
  anchor: string | null;
}

interface DocsState {
  open: boolean;
  location: DocsLocation;
  /** Pages précédentes, pour « Retour ». */
  history: DocsLocation[];
  /** Augmente à chaque navigation : relance le défilement, même vers la page déjà affichée. */
  seq: number;
  query: string;
  /** Version d'avant la dernière mise à jour de l'application : les versions reçues depuis sont mises en avant. */
  updatedFrom: string | null;

  /** Ouvre l'aide, sur la page demandée ou là où elle avait été laissée. */
  show(target?: Partial<DocsLocation>): void;
  navigate(target: Partial<DocsLocation>): void;
  back(): void;
  close(): void;
  toggle(): void;
  setQuery(query: string): void;
  setUpdatedFrom(version: string | null): void;
}

const sameLocation = (a: DocsLocation, b: DocsLocation) => a.slug === b.slug && a.anchor === b.anchor;

export const useDocs = create<DocsState>((set, get) => ({
  open: false,
  location: { slug: HOME, anchor: null },
  history: [],
  seq: 0,
  query: '',
  updatedFrom: null,

  show(target) {
    if (!get().open) {
      // Rouverte : on repart de la page demandée, sans l'historique de la fois précédente.
      const location = target ? { slug: target.slug ?? HOME, anchor: target.anchor ?? null } : get().location;
      set((s) => ({ open: true, location, history: [], query: target ? '' : s.query, seq: s.seq + 1 }));
      return;
    }
    if (target) get().navigate(target);
  },

  navigate(target) {
    const { location, history } = get();
    const next = { slug: target.slug ?? location.slug, anchor: target.anchor ?? null };
    set((s) => ({
      location: next,
      history: sameLocation(next, location) ? history : [...history, location].slice(-50),
      query: '',
      seq: s.seq + 1,
    }));
  },

  back() {
    const history = get().history;
    if (history.length === 0) return;
    set((s) => ({ location: history[history.length - 1], history: history.slice(0, -1), query: '', seq: s.seq + 1 }));
  },

  close() {
    set({ open: false });
  },

  toggle() {
    if (get().open) get().close();
    else get().show();
  },

  setQuery(query) {
    set({ query });
  },

  setUpdatedFrom(updatedFrom) {
    set({ updatedFrom });
  },
}));

/** Ouvre une page de l'aide (raccourci pour les boutons « En savoir plus »). */
export const showDocs = (slug: string, anchor: string | null = null): void => useDocs.getState().show({ slug, anchor });
