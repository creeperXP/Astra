import type { PersonalSkill } from '../types/personal';

export const saxophoneSkill: PersonalSkill = {
  skill_id: 'personal_saxophone_00001',
  name: 'Saxophone',
  emoji: '🎷',
  description: 'Learn to play saxophone from first notes to jazz improvisation.',
  nodes: [
    {
      id: 'sax_embouchure',
      name: 'Embouchure & First Notes',
      description:
        'Build correct mouth position, reed placement, and produce your first stable tone.',
      deps: [],
      institutionalSuccess: 0.88,
      resources: [
        {
          type: 'youtube',
          title: 'How to Get Your First Sound on Saxophone',
          url: 'https://www.youtube.com/results?search_query=saxophone+first+sound+embouchure+beginner',
          description: 'Correct mouth shape and reed pressure',
        },
        {
          type: 'youtube',
          title: 'Saxophone Embouchure Tutorial',
          url: 'https://www.youtube.com/results?search_query=saxophone+embouchure+tutorial+2024',
          description: 'Step-by-step embouchure setup',
        },
        {
          type: 'website',
          title: 'SaxStation – Embouchure Guide',
          url: 'https://www.saxstation.com/saxophone-embouchure/',
          description: 'Free written guide with diagrams',
        },
      ],
    },
    {
      id: 'sax_fingering',
      name: 'Fingering & Scales',
      description:
        'Learn all major key fingerings and practice C, G, F major scales with correct technique.',
      deps: ['sax_embouchure'],
      institutionalSuccess: 0.83,
      resources: [
        {
          type: 'youtube',
          title: 'Saxophone Fingering Chart — All Notes',
          url: 'https://www.youtube.com/results?search_query=saxophone+fingering+chart+all+notes+beginner',
          description: 'Visual fingering reference for all keys',
        },
        {
          type: 'youtube',
          title: 'Major Scales on Saxophone',
          url: 'https://www.youtube.com/results?search_query=saxophone+major+scales+practice',
          description: 'Practice along with a teacher',
        },
        {
          type: 'website',
          title: 'Saxopedia Fingering Chart',
          url: 'https://www.saxpics.com/fingering_chart.htm',
          description: 'Free interactive fingering chart',
        },
      ],
    },
    {
      id: 'sax_breathing',
      name: 'Breath Control & Tone',
      description:
        'Develop diaphragm breathing, long-tone exercises, and consistent tone quality.',
      deps: ['sax_embouchure'],
      institutionalSuccess: 0.80,
      resources: [
        {
          type: 'youtube',
          title: 'Long Tone Practice for Saxophone',
          url: 'https://www.youtube.com/results?search_query=saxophone+long+tone+exercises+breath+control',
          description: 'Daily tone-building routine',
        },
        {
          type: 'youtube',
          title: 'Diaphragm Breathing for Saxophone',
          url: 'https://www.youtube.com/results?search_query=saxophone+diaphragm+breathing+tutorial',
          description: 'Breathing technique fundamentals',
        },
      ],
    },
    {
      id: 'sax_music_theory',
      name: 'Music Theory Basics',
      description:
        'Read sheet music, understand rhythm, time signatures, and key signatures for Bb instruments.',
      deps: ['sax_fingering'],
      institutionalSuccess: 0.78,
      resources: [
        {
          type: 'youtube',
          title: 'Music Theory for Saxophone Players',
          url: 'https://www.youtube.com/results?search_query=music+theory+saxophone+beginner+notes+rhythm',
          description: 'Theory tailored for sax players',
        },
        {
          type: 'website',
          title: 'musictheory.net (free)',
          url: 'https://www.musictheory.net/lessons',
          description: 'Interactive free music theory lessons',
        },
      ],
    },
    {
      id: 'sax_articulation',
      name: 'Articulation & Tonguing',
      description:
        'Master single tonguing, legato slurs, staccato, and accents to control note separation.',
      deps: ['sax_breathing', 'sax_fingering'],
      institutionalSuccess: 0.75,
      resources: [
        {
          type: 'youtube',
          title: 'Saxophone Tonguing Technique',
          url: 'https://www.youtube.com/results?search_query=saxophone+tonguing+technique+articulation',
          description: 'Single, double, and flutter tonguing',
        },
      ],
    },
    {
      id: 'sax_repertoire',
      name: 'First Songs & Repertoire',
      description:
        'Learn classic beginner songs and simple jazz melodies to build musicality.',
      deps: ['sax_music_theory', 'sax_articulation'],
      institutionalSuccess: 0.82,
      resources: [
        {
          type: 'youtube',
          title: 'Easy Saxophone Songs for Beginners',
          url: 'https://www.youtube.com/results?search_query=easy+saxophone+songs+beginners+play+along',
          description: 'Play-along with popular beginner tunes',
        },
        {
          type: 'website',
          title: '8notes – Free Saxophone Sheet Music',
          url: 'https://www.8notes.com/saxophone/',
          description: 'Free printable sheet music library',
        },
      ],
    },
    {
      id: 'sax_jazz_improv',
      name: 'Jazz Improvisation',
      description:
        'Learn blues scale, call-and-response, and improvise over a 12-bar blues progression.',
      deps: ['sax_repertoire'],
      institutionalSuccess: 0.65,
      resources: [
        {
          type: 'youtube',
          title: 'Jazz Improvisation on Saxophone for Beginners',
          url: 'https://www.youtube.com/results?search_query=saxophone+jazz+improvisation+beginner+blues+scale',
          description: 'Blues scale and 12-bar blues improv intro',
        },
        {
          type: 'youtube',
          title: 'Saxophone Pentatonic Scales for Jazz',
          url: 'https://www.youtube.com/results?search_query=saxophone+pentatonic+scale+jazz+improvisation',
          description: 'Core scales for jazz soloing',
        },
      ],
    },
  ],
  links: [
    { source: 'sax_embouchure',    target: 'sax_fingering',       type: 'hard' },
    { source: 'sax_embouchure',    target: 'sax_breathing',       type: 'hard' },
    { source: 'sax_fingering',     target: 'sax_music_theory',    type: 'hard' },
    { source: 'sax_breathing',     target: 'sax_articulation',    type: 'hard' },
    { source: 'sax_fingering',     target: 'sax_articulation',    type: 'hard' },
    { source: 'sax_music_theory',  target: 'sax_repertoire',      type: 'hard' },
    { source: 'sax_articulation',  target: 'sax_repertoire',      type: 'hard' },
    { source: 'sax_repertoire',    target: 'sax_jazz_improv',     type: 'hard' },
  ],
};
