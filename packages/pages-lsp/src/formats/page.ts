import { dashboardSchema } from '@casehubio/pages-schema';
import type { FormatRegistration } from '../types.js';
import { pageSymbolExtractor } from '../refactoring/page-symbols.js';

export const pageFormat: FormatRegistration = {
  formatId: 'page',
  extensions: ['.page.yaml'],
  contentDetector: (inspector) =>
    inspector.hasKey(['pages']) || inspector.hasKey(['datasets']),
  documentSchema: dashboardSchema,
  symbolExtractor: pageSymbolExtractor,
};
