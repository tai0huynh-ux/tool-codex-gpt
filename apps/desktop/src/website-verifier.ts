import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const PILOT_HEADING = 'Xin chào từ AI';
export const PILOT_PARAGRAPH =
  'Đây là trang web thử nghiệm được tạo thông qua ChatGPT và Codex Context Bridge.';

export interface WebsiteCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface WebsiteVerification {
  status: 'passed' | 'failed';
  root: string;
  files: string[];
  checks: WebsiteCheck[];
  verifiedAt: string;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function textContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function safeFile(
  root: string,
  relative: string,
): Promise<{ path: string; content: string } | undefined> {
  const candidate = path.join(root, relative);
  if (!inside(root, candidate)) return undefined;
  try {
    const stat = await lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return { path: candidate, content: await readFile(candidate, 'utf8') };
  } catch {
    return undefined;
  }
}

export async function verifyStaticWebsite(
  repositoryRoot: string,
  now = () => new Date().toISOString(),
): Promise<WebsiteVerification> {
  let root = repositoryRoot;
  try {
    root = await realpath(repositoryRoot);
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ROOT_INVALID');
  } catch {
    return {
      status: 'failed',
      root: repositoryRoot,
      files: [],
      checks: [
        {
          name: 'repository_root',
          passed: false,
          detail: 'Canonical repository root is unavailable.',
        },
      ],
      verifiedAt: now(),
    };
  }

  const html = await safeFile(root, 'index.html');
  const css = await safeFile(root, 'styles.css');
  const files = [html, css].flatMap((item) => (item ? [path.relative(root, item.path)] : []));
  const htmlText = html?.content ?? '';
  const checks: WebsiteCheck[] = [
    {
      name: 'index.html',
      passed: Boolean(html),
      detail: html ? 'Found regular file.' : 'index.html is missing or unsafe.',
    },
    {
      name: 'html_parse',
      passed: Boolean(html && /<html\b[\s\S]*<\/html>/i.test(htmlText)),
      detail: 'Document has an html root.',
    },
    {
      name: 'no_script',
      passed: !/<\s*script\b/i.test(htmlText),
      detail: 'No script element.',
    },
    {
      name: 'no_iframe',
      passed: !/<\s*iframe\b/i.test(htmlText),
      detail: 'No iframe element.',
    },
    {
      name: 'no_form',
      passed: !/<\s*form\b/i.test(htmlText),
      detail: 'No form element.',
    },
    {
      name: 'no_external_url',
      passed: !/(?:https?:\/\/|javascript:|data:)/i.test(htmlText),
      detail: 'No external or executable URL.',
    },
    {
      name: 'no_inline_handler',
      passed: !/\bon[a-z]+\s*=/i.test(htmlText),
      detail: 'No inline event handler.',
    },
    {
      name: 'heading_text',
      passed: textContent(htmlText).includes(PILOT_HEADING),
      detail: `Required heading: ${PILOT_HEADING}`,
    },
    {
      name: 'paragraph_text',
      passed: textContent(htmlText).includes(PILOT_PARAGRAPH),
      detail: 'Required Vietnamese paragraph is present.',
    },
    {
      name: 'styles_file',
      passed: !css || !/(?:https?:\/\/|@import)/i.test(css.content),
      detail: css ? 'styles.css has no external import.' : 'styles.css is optional.',
    },
  ];
  return {
    status: checks.every((check) => check.passed) ? 'passed' : 'failed',
    root,
    files,
    checks,
    verifiedAt: now(),
  };
}
