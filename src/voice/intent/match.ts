// Keyword matching from what was said to something on the page. Pure and synchronous: it runs on
// every partial transcript so the highlight can appear while the person is still talking.

export type Verb = "go" | "on" | "off" | "press" | "stop";
export type Kind = "link" | "button" | "checkbox" | "radio" | "text" | "range" | "select" | "group";

export interface Candidate {
  id: number;
  kind: Kind;
  names: string[]; // what the control is called: its label first, then alternate names
  parent?: number; // the closest group that contains it
  hidden?: boolean; // reachable but not on screen now (inside the closed settings dialog)
  current?: boolean; // a link to the page already open
  checked?: boolean;
  inView?: boolean;
}

export interface Match {
  id: number;
  verb: Verb | null;
  score: number;
  confident: boolean; // safe to act on: most of what was said is explained, clear winner
  ambiguousWith?: number;
}

// Several ways of saying the same thing become one token.
const SYNONYMS: [RegExp, string][] = [
  [/\b(text to speech|text-to-speech|tts|read(ing)? (it )?(out )?(aloud|loud)|read out|reading out)\b/g, " readaloud "],
  [/\b(on[- ]site|in[- ]office|in person)\b/g, " onsite "],
  [/\b(work(ing)? from home|wfh|remotely)\b/g, " remote "],
];

// Verb phrases, longest first so "turn on" wins over "on".
const VERBS: [RegExp, Verb][] = [
  [/\b(turn|switch|toggle) (it |that |this )?off\b|\b(disable|deactivate|uncheck|untick|deselect|unselect)\b/g, "off"],
  [/\b(turn|switch|toggle) (it |that |this )?on\b|\b(enable|activate|check|tick|select|choose|pick)\b/g, "on"],
  [/\b(go( back)? to|take me to|navigate to|switch to|bring me to|go|open|show( me)?|jump to|move to|find)\b/g, "go"],
  [/\b(click|press|tap|hit|push)( on)?\b/g, "press"],
  [/\b(stop|cancel|never ?mind|nevermind|close)\b/g, "stop"],
];

const STOP = new Set(
  "a an the to my me of and or with when while doing for please i i'd id want would like can you could it this that these those is be on off in at up some any page button checkbox box option radio toggle switch link tab field one just only now also then so let's lets us".split(" "),
);

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function normalize(text: string): string {
  let s = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' -]+/g, " ")} `;
  for (const [re, tok] of SYNONYMS) s = s.replace(re, tok);
  return s;
}

const tokenCache = new Map<string, string[]>();
export function tokens(text: string): string[] {
  const hit = tokenCache.get(text);
  if (hit) return hit;
  if (tokenCache.size > 5000) tokenCache.clear();
  const out = normalize(text)
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
  tokenCache.set(text, out);
  return out;
}

// The verb said (the last one wins: "open settings and turn on X") and the remaining words.
export function parse(text: string): { verb: Verb | null; words: string[] } {
  let s = normalize(text);
  let verb: Verb | null = null;
  let at = -1;
  for (const [re, v] of VERBS) {
    s = s.replace(re, (m, ...rest) => {
      const i = rest.at(-2) as number;
      if (i > at) {
        at = i;
        verb = v;
      }
      return " ".repeat(m.length);
    });
  }
  return { verb, words: s.split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem) };
}

interface Scored {
  c: Candidate;
  own: number; // words of its own name that were said
  score: number;
}

function nameHits(names: string[], said: Set<string>): { hits: number; coverage: number; used: Set<string> } {
  let best = { hits: 0, coverage: 0, used: new Set<string>() };
  for (const n of names) {
    const t = [...new Set(tokens(n))];
    if (!t.length) continue;
    const used = new Set(t.filter((w) => said.has(w)));
    const coverage = used.size / t.length;
    if (used.size > best.hits || (used.size === best.hits && coverage > best.coverage)) best = { hits: used.size, coverage, used };
  }
  return best;
}

// The page already open, when that is all that was said ("go to jobs" while on Jobs).
export function alreadyHere(text: string, candidates: Candidate[]): Candidate | null {
  const { words } = parse(text);
  if (!words.length) return null;
  const said = new Set(words);
  for (const c of candidates) {
    if (!c.current) continue;
    const h = nameHits(c.names, said);
    if (h.hits && h.coverage >= 0.5 && words.every((w) => h.used.has(w))) return c;
  }
  return null;
}

export function bestMatch(text: string, candidates: Candidate[], recent?: number): Match | null {
  const { verb, words } = parse(text);
  if (!words.length) return null;
  const said = new Set(words);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const own = new Map<number, ReturnType<typeof nameHits>>();
  const hitsOf = (c: Candidate) => {
    let h = own.get(c.id);
    if (!h) own.set(c.id, (h = nameHits(c.names, said)));
    return h;
  };

  // Words naming the page already open are context, not evidence for something else.
  const here = new Set<string>();
  for (const c of candidates) if (c.current) for (const w of hitsOf(c).used) here.add(w);

  const scored: Scored[] = [];
  for (const c of candidates) {
    const h = hitsOf(c);
    if (!h.hits || (h.coverage < 0.5 && h.hits < 2)) continue;
    // The page already open is not a target; "go to jobs" on Jobs is answered by alreadyHere().
    if (c.current || [...h.used].every((w) => here.has(w))) continue;
    let score = h.hits * 2 + h.coverage;
    const used = new Set(h.used);
    // Naming a group narrows to its members: "work setup remote" is the Remote option.
    for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) {
      const g = byId.get(p);
      if (!g) break;
      const gh = hitsOf(g);
      for (const w of gh.used) {
        if (used.has(w)) continue;
        used.add(w);
        score += 2;
      }
    }
    if (c.hidden) score -= 0.3;
    if (c.current) score -= 1; // already there: "job filters" on the Jobs page means the filters
    if (c.inView) score += 0.1;
    if (recent !== undefined && (c.id === recent || c.parent === recent)) score += 0.2;
    scored.push({ c, own: h.hits, score });
  }
  if (!scored.length) return null;
  // Higher score first; on a tie the more specific (a member of a group beats the group).
  const depth = (c: Candidate) => {
    let d = 0;
    for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) d++;
    return d;
  };
  scored.sort((a, b) => b.score - a.score || depth(b.c) - depth(a.c));
  const top = scored[0];
  const isAncestor = (a: Candidate, b: Candidate) => {
    for (let p = b.parent; p !== undefined; p = byId.get(p)?.parent) if (p === a.id) return true;
    return false;
  };
  const rival = scored.find((s) => s !== top && !isAncestor(s.c, top.c) && !isAncestor(top.c, s.c) && top.score - s.score < 0.5);

  // Explained words: the target's name plus its groups' names. Acting needs most of the
  // sentence explained, so chatter that happens to contain "remote" only highlights.
  const explained = new Set(hitsOf(top.c).used);
  for (let p = top.c.parent; p !== undefined; p = byId.get(p)?.parent) {
    const g = byId.get(p);
    if (g) for (const w of hitsOf(g).used) explained.add(w);
  }
  // Naming the page already open is context ("remote jobs" on the Jobs page), not noise.
  for (const w of here) explained.add(w);
  const share = words.filter((w) => explained.has(w)).length / words.length;
  return {
    id: top.c.id,
    verb,
    score: top.score,
    confident: !rival && share >= 0.5,
    ambiguousWith: rival?.c.id,
  };
}
