export interface SecretFinding {
  ruleId: string;
  description: string;
  line: number;
}

const secretRules: { ruleId: string; description: string; pattern: RegExp }[] = [
  {
    ruleId: 'private-key',
    description: 'Private key material',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    ruleId: 'openai-key',
    description: 'OpenAI-style API key',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    ruleId: 'github-token',
    description: 'GitHub-style access token',
    pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/,
  },
  {
    ruleId: 'authorization-header',
    description: 'Authorization header',
    pattern: /authorization\s*:\s*(?:bearer|basic)\s+\S+/i,
  },
  {
    ruleId: 'credential-assignment',
    description: 'Credential-like assignment',
    pattern: /\b(?:password|passwd|secret|access_token|session_token)\s*[=:]\s*['"]?[^\s'"]{8,}/i,
  },
];

export function scanTextForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const rule of secretRules) {
      if (rule.pattern.test(line)) {
        findings.push({ ruleId: rule.ruleId, description: rule.description, line: index + 1 });
      }
    }
  }
  return findings;
}

export function assertNoSecrets(content: string): void {
  const findings = scanTextForSecrets(content);
  if (findings.length > 0) {
    throw new Error(`SECRET_DETECTED:${findings.map((finding) => finding.ruleId).join(',')}`);
  }
}
