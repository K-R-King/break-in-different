// What each page is for, told to the voice assistant so its orientation and suggestions are
// predictable: it describes the page in these terms rather than improvising.
const PAGES: [RegExp, string, string][] = [
  [/^\/$/, "Home", "The home page. From here the person can go to their profile, the job listings, the application tracker, or the accessibility settings."],
  [
    /^\/profile/,
    "Profile",
    "The profile, in sections: 1 resume and skills (upload a PDF, or add skills one at a time in the Add a skill box), 2 accessibility features for this app, 3 workplace accommodations (Required, Preferred or Not needed for each), 4 About you (private details, never shared; you are not told what is inside it, but you can take them there), 5 roles and where they want to work. The optional name box at the top is not a numbered section. Save, or Save and find jobs, is at the bottom.",
  ],
  [
    /^\/jobs\/[^/]+\/email/,
    "Accommodation email",
    "Writing an email to one employer to request accommodations. Steps: choose what to ask for, choose whether to disclose (private), write the draft, check To, Subject and Message, approve it (only the person can decide this), then copy it or open it in their mail app, then apply on the employer's site and mark it as applied.",
  ],
  [
    /^\/jobs\/[^/]+\/practice/,
    "Practice interview",
    "A practice interview for one job. Before starting: spoken or written questions, and whether to see the questions first. During it: answer, send, repeat the question, ask to rephrase, or take a moment; at the end, get feedback.",
  ],
  [
    /^\/jobs/,
    "Jobs",
    "Jobs ranked for the person. Left: filters (work setup, location, experience level) and required accommodations. Middle: the results list; each job card has Save, Read aloud and Request accommodations. Right: the open job, with Request accommodations and apply, Save, Practice an interview, Read aloud, the description, and what the listing says about each accommodation. Choosing a job card (by its name, or the commands 'Top job', 'Second job' … 'Tenth job', 'Last job', 'Next job', 'Previous job') opens it on the right and scrolls the list to it; use those commands for 'the first job', 'the third one' and so on. 'Scroll down the list' scrolls the results; 'read the description' reads the open job aloud.",
  ],
  [
    /^\/tracker/,
    "Application tracker",
    "Saved jobs in a table, one row per job: status (Saved, Applied, Interviewing, Rejected), deadline, follow-up date, interviews, the email draft, and notes. Every change saves by itself; there is no Save button, so never offer to save. Act on the row the person chose (the selection) unless they name another job. Date fields take the date as said ('November 3', 'next Friday'); type it as said.",
  ],
];

export function pageInfo(path: string): { name: string; hint: string } {
  const p = PAGES.find(([re]) => re.test(path));
  return p ? { name: p[1], hint: p[2] } : { name: document.title, hint: "" };
}
