import type { SectionContent, PlaybookBase } from '../scenario/types.js';

export interface TutorialDescriptor {
  scenario: string;
  title: string;
  description: string;
  area: string;
  labels: string[];
  tags: string[];
  estimated?: string;
  prerequisites: string[];
  path: string;
  contentType: 'slides-only' | 'hands-on' | 'yaml-editor';
  target?: 'builder-shell';
  hero?: { title: string; subtitle?: string; icon?: string };
}

export interface LearningPath {
  path: string;
  title: string;
  description: string;
  labels: string[];
  tutorials: string[];
}

export interface YamlEditorSection {
  title: string;
  content?: SectionContent;
  initialYaml: string;
  expectedKeys?: string[];
  expectedStructure?: Record<string, unknown>;
  hint?: string;
  solutionYaml?: string;
  buildOnPrevious?: boolean;
}

export interface YamlEditorScenario extends PlaybookBase {
  sections: YamlEditorSection[];
}
