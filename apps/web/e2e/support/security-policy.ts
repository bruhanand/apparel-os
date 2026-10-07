import type { Page } from '@playwright/test';

/**
 * Collects every content security policy violation the page reports, so a journey can show that the pages it opens
 * load nothing the one-origin policy refuses (deployment.md section 3; code-house-rules 12.1; S1-F01-T27).
 */
export function watchSecurityPolicy(page: Page): () => readonly string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });
  return () => violations;
}
