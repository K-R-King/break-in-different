// Skill alias normalization (JS = JavaScript) and a vocabulary for the rules fallback
// used when Claude is unavailable. Canonical name first, aliases after.
import aliasFile from "../../shared/fixtures/skill-aliases.json";
const SKILLS: string[][] = aliasFile.skills;

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, ...aliases] of SKILLS) {
  ALIAS_TO_CANONICAL.set(key(canonical), canonical);
  for (const a of aliases) ALIAS_TO_CANONICAL.set(key(a), canonical);
}

function key(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function canonicalSkill(name: string): string {
  return ALIAS_TO_CANONICAL.get(key(name)) ?? name.trim();
}

export function skillKey(name: string): string {
  return key(canonicalSkill(name));
}

// Rules fallback: find vocabulary skills mentioned in free text.
export function findSkillsInText(text: string): string[] {
  const found = new Set<string>();
  const lower = ` ${text.toLowerCase()} `;
  for (const [canonical, ...aliases] of SKILLS) {
    for (const term of [canonical, ...aliases]) {
      const t = term.toLowerCase();
      if (t.length <= 2 && !/[+#]/.test(t)) {
        // Short terms (Go, C, ML, JS) only count as whole words in upper/mixed case in the original.
        const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(term === canonical ? canonical : term.toUpperCase())}([^A-Za-z0-9]|$)`);
        if (re.test(text)) {
          found.add(canonical);
          break;
        }
        continue;
      }
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`);
      if (re.test(lower)) {
        found.add(canonical);
        break;
      }
    }
  }
  return [...found];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
