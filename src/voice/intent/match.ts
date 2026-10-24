// Keyword matching from what was said to something on the page. Pure and synchronous: it runs on
// every partial transcript so the highlight can appear while the person is still talking.

// Distinct actions. on: make it active (never turns anything off). off: make it inactive.
// toggle: flip it. select: choose an option. press: click. go: navigate or move to. do: the
// default action of what is selected ("yes", "do it"). No verb at all: select only, change nothing.
export type Verb = "go" | "on" | "off" | "toggle" | "select" | "press" | "do" | "stop";
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
  [/\b(log ?in|sign ?in)\b/g, " login "],
  [/\b(log ?out|sign ?out)\b/g, " logout "],
  [/\bprev\b/g, " previous "],
];

// Opposites. Saying one side rules out a control named only with the other ("log in" is never
// "Log out", "add skill" never "Remove TypeScript"). Checked on raw words, before filler is
// dropped, since "in", "on" and "up" are filler otherwise.
const OPPOSITES: [string, string][] = [
  ["in", "out"],
  ["login", "logout"],
  ["on", "off"],
  ["show", "hide"],
  ["open", "close"],
  ["add", "remove"],
  ["next", "previous"],
  ["up", "down"],
  ["start", "stop"],
  ["expand", "collapse"],
  ["more", "less"],
  ["increase", "decrease"],
  ["include", "exclude"],
  ["first", "last"],
  ["accept", "decline"],
  ["save", "unsave"],
  ["play", "pause"],
  ["before", "after"],
  ["allow", "block"],
  ["upload", "download"],
];
const OPPOSITE = new Map<string, string>(OPPOSITES.flatMap(([a, b]) => [[a, b], [b, a]]));

const polarCache = new Map<string, Set<string>>();
function polarWords(normalized: string): Set<string> {
  const hit = polarCache.get(normalized);
  if (hit) return hit;
  if (polarCache.size > 5000) polarCache.clear();
  const out = new Set(normalized.split(/\s+/).filter((w) => OPPOSITE.has(w)));
  polarCache.set(normalized, out);
  return out;
}

// True when what was said contradicts every name of the candidate.
function contradicts(said: Set<string>, names: string[]): boolean {
  if (!said.size) return false;
  const mine = new Set<string>();
  for (const n of names) for (const w of polarWords(normalize(n))) mine.add(w);
  for (const w of said) if (!mine.has(w) && mine.has(OPPOSITE.get(w)!)) return true;
  return false;
}

// Verb phrases. Earlier patterns claim their words first, so "turn off" never reads as "on" and
// "switch to" never reads as "switch" (toggle).
const VERBS: [RegExp, Verb][] = [
  [/\b(turn|switch|toggle) (it |that |this )?off\b|\b(disable|deactivate|uncheck|untick|(don't|do not|no longer) need)\b/g, "off"],
  [/\b(turn|switch|toggle) (it |that |this )?on\b|\b(enable|activate|check|tick|(i )?need)\b/g, "on"],
  [/\b(go( back)? to|take me to|navigate to|switch to|bring me to|go|open|show( me)?|jump to|move to|find)\b/g, "go"],
  [/\b(toggle|flip|switch)\b/g, "toggle"],
  [/\b(select|choose|pick|use)\b/g, "select"],
  [/\b(click|press|tap|hit|push)( on)?\b/g, "press"],
];

// Confirmations count as a verb only when nothing else was said: "yes" alone confirms, but
// "select yes" chooses an option called Yes.
const DO = /\b(do (it|that)|yes|yeah|yep|go ahead|confirm|okay|ok|sure)\b/g;

const STOP = new Set(
  "a an the to my me of and or with when while doing for please i i'd id want would like can you could it this that these those is be on off in at up some any page button checkbox box option radio toggle switch link tab field one just only now also then so let's lets us no uh uhh um umm uhm er erm hmm ah oh well".split(" "),
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
export interface Parsed {
  verb: Verb | null;
  words: string[]; // meaningful words, filler dropped, stemmed
  raw: string[]; // every word that is not a verb, for names made only of filler ("Any", "To")
  polar: Set<string>; // one side of an opposite pair, verbs included ("close", "turn off")
}

export function parse(text: string): Parsed {
  const full = normalize(text);
  let s = full;
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
  const split = (x: string) => x.split(/\s+/).filter(Boolean);
  let words = split(s).filter((w) => !STOP.has(w)).map(stem);
  const hasDo = DO.test(s);
  DO.lastIndex = 0;
  if (hasDo && verb === null && !split(s.replace(DO, " ")).filter((w) => !STOP.has(w)).length) {
    verb = "do";
    s = s.replace(DO, " ");
    words = [];
  }
  return { verb, words, raw: split(s).map(stem), polar: polarWords(full) };
}

function rawTokens(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean).map(stem);
}

interface Scored {
  c: Candidate;
  own: number; // words of its own name that were said
  score: number;
}

interface Hits {
  hits: number;
  coverage: number;
  used: Set<string>;
  exact: boolean; // a whole name was said and nothing else
}

// How well what was said covers the best of the candidate's names. A name made only of filler
// words ("Any", "No", "To") is compared on raw words instead.
function nameHits(names: string[], said: Set<string>, raw: Set<string> = said): Hits {
  let best: Hits = { hits: 0, coverage: 0, used: new Set<string>(), exact: false };
  for (const n of names) {
    let t = [...new Set(tokens(n))];
    let pool = said;
    if (!t.length) {
      t = [...new Set(rawTokens(n))];
      pool = raw;
    }
    if (!t.length) continue;
    const used = new Set(t.filter((w) => pool.has(w)));
    const coverage = used.size / t.length;
    const exact = coverage === 1 && used.size === pool.size;
    if (used.size > best.hits || (used.size === best.hits && (coverage > best.coverage || (exact && !best.exact))))
      best = { hits: used.size, coverage, used, exact };
  }
  return best;
}

// The page already open, when that is all that was said ("go to jobs" while on Jobs).
export function alreadyHere(text: string, candidates: Candidate[]): Candidate | null {
  const { words, raw } = parse(text);
  if (!words.length) return null;
  const said = new Set(words);
  for (const c of candidates) {
    if (!c.current) continue;
    const h = nameHits(c.names, said, new Set(raw));
    if (h.hits && h.coverage >= 0.5 && words.every((w) => h.used.has(w))) return c;
  }
  return null;
}

export interface MatchOptions {
  recent?: number; // what was last acted on or selected
  sticky?: number; // the guess shown now: keep it unless something clearly fits better
  context?: Set<number>; // groups around where the person is working (focus, last action)
}

const STICKY_BONUS = 0.75;
// Same words, different kinds of control: the verb says which ("press add skill" is the button,
// "add skill" alone selects the box to type in).
const AFFINITY: Record<Verb | "none", Kind[]> = {
  none: ["text", "select", "range", "group"],
  select: ["radio", "checkbox", "select"],
  on: ["checkbox", "radio", "button"],
  off: ["checkbox", "button"],
  toggle: ["checkbox", "button"],
  press: ["button", "link"],
  do: ["button", "link"],
  go: ["link", "group"],
  stop: [],
};
const AFFINITY_BONUS = 0.45; // a tie-breaker: never outweighs a better-named control
// Closer than this, two unrelated candidates are a real choice to ask about. Smaller than the
// verb tie-break, so "add skill" (box) vs "press add skill" (button) is never ambiguous.
const RIVAL_MARGIN = 0.4;
const EXACT_BONUS = 1; // the whole name, and nothing else, was said
// Repeated controls (a "Save" on every job card): the one where the person is working wins.
const CONTEXT_BONUS = 0.6;

export function bestMatch(text: string, candidates: Candidate[], opts: MatchOptions = {}): Match | null {
  const { recent, sticky, context } = opts;
  const { verb, words, raw, polar } = parse(text);
  if (!words.length && !raw.length) return null;
  const said = new Set(words);
  const saidRaw = new Set(raw);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const own = new Map<number, ReturnType<typeof nameHits>>();
  const hitsOf = (c: Candidate) => {
    let h = own.get(c.id);
    if (!h) own.set(c.id, (h = nameHits(c.names, said, saidRaw)));
    return h;
  };

  // Words naming the page already open are context, not evidence for something else.
  const here = new Set<string>();
  for (const c of candidates) if (c.current) for (const w of hitsOf(c).used) here.add(w);

  const scored: Scored[] = [];
  for (const c of candidates) {
    const h = hitsOf(c);
    if (!h.hits || (h.coverage < 0.5 && h.hits < 2)) continue;
    if (contradicts(polar, c.names)) continue;
    // The page already open is not a target ("go to jobs" on Jobs is answered by alreadyHere()),
    // nor is something only half-named by words that name that page ("saved jobs" on Jobs).
    if (c.current || (h.coverage < 1 && [...h.used].every((w) => here.has(w)))) continue;
    let score = h.hits * 2 + h.coverage + (h.exact ? EXACT_BONUS : 0);
    const used = new Set(h.used);
    // Naming a group narrows to its members: "work setup remote" is the Remote option. Only when
    // the member adds a word of its own: saying just the group's name means the group.
    const groupWords = new Set<string>();
    for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) {
      const g = byId.get(p);
      if (!g) break;
      for (const w of hitsOf(g).used) groupWords.add(w);
    }
    if ([...h.used].some((w) => !groupWords.has(w)))
      for (const w of groupWords) {
        if (used.has(w)) continue;
        used.add(w);
        score += 2;
      }
    if (c.hidden) score -= 0.3;
    if (c.inView) score += 0.1;
    if (recent !== undefined && (c.id === recent || c.parent === recent)) score += 0.2;
    if (c.id === sticky) score += STICKY_BONUS;
    if (AFFINITY[verb ?? "none"].includes(c.kind)) score += AFFINITY_BONUS;
    if (context && c.parent !== undefined && context.has(c.parent)) score += CONTEXT_BONUS;
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
  const rival = scored.find((s) => s !== top && !isAncestor(s.c, top.c) && !isAncestor(top.c, s.c) && top.score - s.score < RIVAL_MARGIN);

  // Explained words: the target's name plus its groups' names. Acting needs most of the
  // sentence explained, so chatter that happens to contain "remote" only highlights.
  const explained = new Set(hitsOf(top.c).used);
  for (let p = top.c.parent; p !== undefined; p = byId.get(p)?.parent) {
    const g = byId.get(p);
    if (g) for (const w of hitsOf(g).used) explained.add(w);
  }
  // Naming the page already open is context ("remote jobs" on the Jobs page), not noise.
  for (const w of here) explained.add(w);
  const share = words.length ? words.filter((w) => explained.has(w)).length / words.length : 1;
  return {
    id: top.c.id,
    verb,
    score: top.score,
    confident: !rival && share > 0.5, // more than half: "stop reading" is not "Reading and voice"
    ambiguousWith: rival?.c.id,
  };
}
