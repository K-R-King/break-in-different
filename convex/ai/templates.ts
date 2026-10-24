// Fixed templates: the fallback when Claude is unavailable or its output fails validation.
import { ACCOMMODATION_LABELS, type AccommodationCode } from "../../shared/taxonomy";
import { DISCLOSURE_TOKEN, LINK_TOKEN } from "./validators";

export function emailTemplate(opts: {
  jobTitle: string;
  employerName: string;
  codes: AccommodationCode[];
  disclose: boolean;
}): { subject: string; body: string } {
  const n = opts.codes.length;
  const what = n === 1 ? "one workplace accommodation" : `${numberWord(n)} workplace accommodations`;
  const lines = [
    "Hello,",
    "",
    `I'm applying for the ${opts.jobTitle} role at ${opts.employerName} and would like to ask about ${what}:`,
    "",
    ...opts.codes.map((c) => `• ${ACCOMMODATION_LABELS[c]}`),
    "",
  ];
  if (opts.disclose) lines.push(DISCLOSURE_TOKEN, "");
  lines.push(
    "These would help me do my best work. I am happy to discuss the details in writing.",
    "",
    `My application: ${LINK_TOKEN}`,
    "",
    "Thank you,",
    "[Your name]",
  );
  return { subject: `Accommodation request: ${opts.jobTitle} application`, body: lines.join("\n") };
}

// Disclosure text is built from the user's own selection or words; it never passes through Claude.
export function disclosureText(conditionLabels: string[], freeText: string): string {
  const own = freeText.trim();
  if (own) return own;
  if (!conditionLabels.length) return "";
  return `I'd like to share that I have ${joinList(conditionLabels)}.`;
}

// The user's extra request is inserted verbatim by code, never sent to Claude.
export function fillTokens(body: string, applyUrl: string, disclosure: string, extraRequest = ""): string {
  let out = body;
  const extra = extraRequest.trim();
  if (extra) {
    const lines = out.split("\n");
    const i = lines.findIndex((l) => l.includes(LINK_TOKEN));
    lines.splice(i < 0 ? lines.length : i, 0, `I would also like to ask about: ${extra}`, "");
    out = lines.join("\n");
  }
  out = out.split(LINK_TOKEN).join(applyUrl);
  if (disclosure) out = out.split(DISCLOSURE_TOKEN).join(disclosure);
  else out = out.split(`${DISCLOSURE_TOKEN}\n\n`).join("").split(DISCLOSURE_TOKEN).join("");
  return out;
}

// Scripted practice interviewer: the fallback when Claude is unavailable or a line fails validation.
// Moves through fixed questions by counting the candidate's answers.
export function scriptedPracticeQuestions(jobTitle: string, skills: string[], planned?: string[]): { ask: string; rephrase: string }[] {
  // Questions the candidate has already seen are asked as written.
  if (planned?.length) return planned.map((q) => ({ ask: q, rephrase: `Let me ask that again. ${q}` }));
  const skill = skills[0];
  return [
    {
      ask: `Tell me about yourself and what interests you in the ${jobTitle} role.`,
      rephrase: `What would you like me to know about you, and why did you choose this ${jobTitle} role?`,
    },
    skill
      ? { ask: `This role uses ${skill}. Tell me about a project where you used it.`, rephrase: `Describe one time you worked with ${skill}. What did you build?` }
      : { ask: "Tell me about a technical project you are proud of.", rephrase: "Describe one project you built. What was your part in it?" },
    {
      ask: "Tell me about a time something went wrong in a project. What did you do?",
      rephrase: "Think of one problem you had in a project. What happened, and what did you do about it?",
    },
    {
      ask: "How do you like to work with a team, and how do you keep others updated on your progress?",
      rephrase: "When you work with other people, how do you share what you are doing?",
    },
  ];
}

export function scriptedPracticeTurn(opts: {
  jobTitle: string;
  skills: string[];
  answered: number;
  move: "start" | "answer" | "rephrase";
  planned?: string[];
}): { say: string; kind: "question" | "closing" } {
  const qs = scriptedPracticeQuestions(opts.jobTitle, opts.skills, opts.planned);
  if (opts.move === "start") {
    const intro = opts.planned?.length ? "You have already seen the questions, and there is no time limit." : `There are ${qs.length} questions and no time limit.`;
    return { say: `Hello, and thanks for practicing for the ${opts.jobTitle} role. ${intro} ${qs[0].ask}`, kind: "question" };
  }
  if (opts.move === "rephrase") {
    const q = qs[Math.min(opts.answered, qs.length - 1)];
    return { say: opts.planned?.length ? q.rephrase : `Let me ask that another way. ${q.rephrase}`, kind: "question" };
  }
  if (opts.answered >= qs.length) {
    return { say: "Thank you. That is the end of this practice. You can ask for feedback on your answers now.", kind: "closing" };
  }
  return { say: `Thank you. ${qs[opts.answered].ask}`, kind: "question" };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven"][n] ?? String(n);
}
