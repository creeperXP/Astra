export interface PersonalResource {
  type: 'youtube' | 'website' | 'pdf';
  title: string;
  url: string;
  description?: string;
}

export interface PersonalNode {
  id: string;
  name: string;
  description: string;
  deps: string[];
  institutionalSuccess?: number;
  resources: PersonalResource[];
}

export interface PersonalLink {
  source: string;
  target: string;
  type: 'hard' | 'soft';
}

export interface PersonalSkill {
  skill_id: string;
  name: string;
  emoji: string;
  description: string;
  nodes: PersonalNode[];
  links: PersonalLink[];
}
