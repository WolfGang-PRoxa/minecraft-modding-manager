import type { StudioApi } from '../shared/studio';
import type { RendererApi } from '../shared/types';

declare global {
  interface Window {
    api: RendererApi;
    /** Vue Studio (publieurs). */
    studio: StudioApi;
  }
}
