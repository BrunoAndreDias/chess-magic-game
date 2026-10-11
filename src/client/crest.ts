import type { ClassId } from '../engine/index';

/** How the draft presents a class: its land and order (docs/world.md), its line (docs/classes.md) and its land's glow. Story only; no rule reads it. */
export interface Crest {
  land: string;
  order: string;
  quote: string;
  owns: string;
  /** The land's glow colour: the class's rim light, aura and lock-in flare. */
  glow: string;
  /** The CSS object-position y that keeps the face in a cropped splash card: a little above the eye height art/splash.sh prints. */
  face: string;
}

export const CREST: Readonly<Record<ClassId, Crest>> = {
  astromancer: { land: 'Gilded Rift', order: 'The Last Almanac', quote: 'I don’t aim where you are. I aim where you’ll be.', owns: 'The elements', glow: '#c9a8ff', face: '34%' },
  gravecaller: { land: 'Ashen Ferry', order: 'The Ferrymen', quote: 'Everyone pays the ferry. I only choose when.', owns: 'Life and death', glow: '#5dffc0', face: '30%' },
  bellringer: { land: 'Sworn Heights', order: 'The Unslept Hour', quote: 'The hour is mine to call.', owns: 'The turn order', glow: '#ffb640', face: '28%' },
};

/** The class's splash render, built by art/splash.sh. */
export const splash = (cls: ClassId): string => `${import.meta.env.BASE_URL}splash/${cls}.webp`;
