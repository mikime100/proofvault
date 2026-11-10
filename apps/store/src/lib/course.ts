// Catalogue copy for the demo course. Name and price come from the shared fixture so the store,
// the api and the evidence all agree; everything else is the seller's own product page text.
import { DEMO_PRODUCT } from '@proofvault/shared/fixtures';

export const STORE_NAME = 'Lumen Lessons';

export interface Lesson {
  /** Sent as the lesson number on lesson_view events (the evidence cites it). Keep 1 to 4. */
  n: number;
  title: string;
  summary: string;
  minutes: number;
}

export const COURSE = {
  name: DEMO_PRODUCT.name,
  price: DEMO_PRODUCT.price,
  tagline: 'Turn a Figma file into a clean, responsive page, one real component at a time.',
  author: 'Sara Tesfaye',
  authorRole: 'Front-end engineer and design systems lead',
  outcomes: [
    'Read a Figma file the way a developer needs to',
    'Map Auto Layout to Flexbox and Grid without guesswork',
    'Pull type, colour and spacing into reusable tokens',
    'Ship a page that holds up from phone to desktop',
  ],
  lessons: [
    {
      n: 1,
      title: 'Reading a Figma file like a developer',
      summary: 'Frames, constraints and what the designer actually meant.',
      minutes: 12,
    },
    {
      n: 2,
      title: 'Auto Layout to Flexbox',
      summary: 'Direction, gaps and alignment, translated line by line.',
      minutes: 16,
    },
    {
      n: 3,
      title: 'Type, colour and spacing tokens',
      summary: 'One source of truth for every value on the page.',
      minutes: 14,
    },
    {
      n: 4,
      title: 'Shipping a responsive page',
      summary: 'Breakpoints, testing on a phone, and the handoff back.',
      minutes: 18,
    },
  ] satisfies Lesson[],
  bonus: { file: 'bonus.pdf', title: 'Developer handoff checklist', kind: 'PDF' },
};

export const TOTAL_MINUTES = COURSE.lessons.reduce((s, l) => s + l.minutes, 0);
