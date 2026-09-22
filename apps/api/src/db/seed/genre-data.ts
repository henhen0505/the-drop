export interface GenreNode {
  name: string;
  children?: string[];
}

/** EDM/rave-focused genre taxonomy seeded into the `genres` table. */
export const GENRE_TREE: GenreNode[] = [
  {
    name: 'House',
    children: [
      'Deep House',
      'Tech House',
      'Progressive House',
      'Afro House',
      'Acid House',
      'Melodic House',
      'Minimal House',
      'Soulful House',
      'Future House',
    ],
  },
  {
    name: 'Techno',
    children: [
      'Minimal Techno',
      'Industrial Techno',
      'Melodic Techno',
      'Acid Techno',
      'Hard Techno',
      'Detroit Techno',
      'Dub Techno',
    ],
  },
  {
    name: 'Trance',
    children: [
      'Progressive Trance',
      'Psytrance',
      'Uplifting Trance',
      'Vocal Trance',
      'Goa Trance',
      'Tech Trance',
    ],
  },
  {
    name: 'Drum and Bass',
    children: ['Liquid DnB', 'Neurofunk', 'Jump Up', 'Darkstep'],
  },
  {
    name: 'Dubstep',
    children: ['Melodic Dubstep', 'Riddim', 'Brostep'],
  },
  {
    name: 'Bass Music',
    children: ['Future Bass', 'Trap', 'Wave', 'Halftime', 'UK Bass'],
  },
  {
    name: 'Hardstyle',
    children: ['Rawstyle', 'Euphoric Hardstyle', 'Reverse Bass'],
  },
  {
    name: 'Hardcore',
  },
  {
    name: 'Ambient',
  },
  {
    name: 'Experimental',
  },
  {
    name: 'Garage',
  },
  {
    name: 'Breakbeat',
    children: ['Breakcore', 'Big Beat', 'Nu Skool Breaks'],
  },
  {
    name: 'Disco',
  },
  {
    name: 'Electro',
  },
  {
    name: 'Industrial',
  },
  {
    name: 'Downtempo',
  },
  {
    name: 'Jersey Club',
  },
  {
    name: 'Jungle',
  },
];
