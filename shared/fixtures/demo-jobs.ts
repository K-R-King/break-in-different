// DEMO set: 12 fictional postings, always shown with a DEMO badge. Written by the team so the
// demo is deterministic and covers every label: stated, verified, unverified, unavailable,
// plus one explicit on-site conflict. Every "stated" quote appears verbatim in descriptionText.
import type { AccommodationInfo, JobSkill, WorkplaceType } from "../types";
import type { ExperienceLevel, RoleFamily } from "../taxonomy";

export interface DemoEmployer {
  slug: string;
  name: string;
  description: string;
}

export interface DemoJob {
  key: string;
  employer: string; // slug
  title: string;
  roleFamily: RoleFamily;
  experienceLevel: ExperienceLevel;
  experienceEvidence?: string;
  location: string;
  workplaceType: WorkplaceType;
  summary: string;
  descriptionText: string;
  skills: JobSkill[];
  accommodations: AccommodationInfo[];
}

const DEMO_PAGE = "https://example.com/demo";

export const DEMO_EMPLOYERS: DemoEmployer[] = [
  { slug: "demo-lumen", name: "Lumen Health Tech", description: "A 120-person team making clinic scheduling software." },
  { slug: "demo-tidewater", name: "Tidewater Analytics", description: "Builds dashboards that help city transit agencies plan routes." },
  { slug: "demo-fernway", name: "Fernway", description: "Makes a design-to-code platform for small product teams." },
  { slug: "demo-harbor", name: "Harbor & Pine Software", description: "Builds bookkeeping tools for independent shops." },
  { slug: "demo-corvid", name: "Corvid Robotics", description: "Builds warehouse robots and the fleet software that runs them." },
  { slug: "demo-quillmark", name: "Quillmark AI", description: "Builds document search and summarization for legal teams." },
];

const s = (name: string, level: "required" | "preferred" = "required"): JobSkill => ({ name, level });

export const DEMO_JOBS: DemoJob[] = [
  {
    key: "lumen-fullstack",
    employer: "demo-lumen",
    title: "Full Stack Developer",
    roleFamily: "full_stack_developer",
    experienceLevel: "new_grad",
    experienceEvidence: "This role is a great fit for new grads and people early in their careers.",
    location: "Remote (US)",
    workplaceType: "remote",
    summary: "Build patient-facing scheduling tools with React and TypeScript, and the Node.js services behind them.",
    descriptionText: `You will build patient-facing scheduling tools with React and TypeScript, and the Node.js services behind them. You will pair with a designer and ship small changes every week.
This role is fully remote for candidates anywhere in the US.
Core hours are 11am-3pm ET. Plan the rest of your day around your life.
This role is a great fit for new grads and people early in their careers.
What you'll use: TypeScript, React, Node.js, PostgreSQL, REST APIs, GraphQL, Git, Docker. Nice to have: Kubernetes.`,
    skills: [s("TypeScript"), s("React"), s("Node.js"), s("PostgreSQL"), s("REST APIs"), s("GraphQL"), s("Git"), s("Docker"), s("Kubernetes", "preferred")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "This role is fully remote for candidates anywhere in the US.", evidenceSource: "listing" },
      { code: "flexible_hours", label: "stated", evidence: "Core hours are 11am-3pm ET. Plan the rest of your day around your life.", evidenceSource: "listing" },
      { code: "written_alternatives", label: "verified", evidenceSource: "curated", sourceUrl: `${DEMO_PAGE}/lumen-health-tech/accessibility`, checkedAt: "2026-10-20" },
      { code: "assistive_software", label: "unverified", evidenceSource: "curated", note: "Not confirmed. Ask the employer.", sourceUrl: `${DEMO_PAGE}/lumen-health-tech/equal-opportunity` },
    ],
  },
  {
    key: "tidewater-fullstack",
    employer: "demo-tidewater",
    title: "Software Engineer, Full Stack",
    roleFamily: "full_stack_developer",
    experienceLevel: "entry_level",
    experienceEvidence: "We are looking for 0-2 years of experience, including internships.",
    location: "Hybrid · Chicago, IL",
    workplaceType: "hybrid",
    summary: "Build route-planning dashboards for transit agencies using React, Python and PostgreSQL.",
    descriptionText: `Join the team that builds route-planning dashboards for city transit agencies. You will work across our React front end and Python services.
We are looking for 0-2 years of experience, including internships.
We work hybrid: two days a week in our Chicago office.
We offer flexible working hours around a shared afternoon block.
Skills: React, TypeScript, Python, PostgreSQL, REST APIs, Docker. Nice to have: AWS.`,
    skills: [s("React"), s("TypeScript"), s("Python"), s("PostgreSQL"), s("REST APIs"), s("Docker"), s("AWS", "preferred")],
    accommodations: [
      { code: "flexible_hours", label: "stated", evidence: "We offer flexible working hours around a shared afternoon block.", evidenceSource: "listing" },
    ],
  },
  {
    key: "fernway-frontend",
    employer: "demo-fernway",
    title: "Frontend Engineer, Platform",
    roleFamily: "frontend_engineer",
    experienceLevel: "not_stated",
    location: "Remote (US, Canada)",
    workplaceType: "remote",
    summary: "Build the editor that turns designs into production React components.",
    descriptionText: `Build the editor that turns designs into production React components. You will own performance, accessibility and the component library.
Tools we use: React, TypeScript, CSS, Vite, Jest, Playwright, Accessibility.`,
    skills: [s("React"), s("TypeScript"), s("CSS"), s("Vite"), s("Jest"), s("Playwright"), s("Accessibility")],
    accommodations: [],
  },
  {
    key: "harbor-junior",
    employer: "demo-harbor",
    title: "Junior Full Stack Engineer",
    roleFamily: "full_stack_developer",
    experienceLevel: "entry_level",
    experienceEvidence: "Junior Full Stack Engineer",
    location: "Remote (Canada)",
    workplaceType: "remote",
    summary: "Help small shops keep their books with a friendly web app.",
    descriptionText: `Help small shops keep their books with a friendly web app. You will learn from senior engineers and ship features end to end.
We are an equal opportunity employer and provide reasonable accommodations on request.`,
    skills: [],
    accommodations: [
      { code: "assistive_software", label: "unverified", evidence: "We are an equal opportunity employer and provide reasonable accommodations on request.", evidenceSource: "listing", note: "Not confirmed. Ask the employer." },
    ],
  },
  {
    key: "corvid-backend",
    employer: "demo-corvid",
    title: "Backend Engineer, Fleet Software",
    roleFamily: "backend_engineer",
    experienceLevel: "new_grad",
    experienceEvidence: "New graduates are welcome to apply.",
    location: "On-site · Austin, TX",
    workplaceType: "onsite",
    summary: "Write the services that route warehouse robots in real time.",
    descriptionText: `Write the services that route warehouse robots in real time, in Go and Python.
This position is on-site five days a week at our Austin facility.
New graduates are welcome to apply.
Skills: Go, Python, PostgreSQL, Kafka, Docker, Kubernetes, Linux.`,
    skills: [s("Go"), s("Python"), s("PostgreSQL"), s("Kafka"), s("Docker"), s("Kubernetes"), s("Linux")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "This position is on-site five days a week at our Austin facility.", evidenceSource: "listing", contradicts: true },
    ],
  },
  {
    key: "lumen-frontend-intern",
    employer: "demo-lumen",
    title: "Frontend Developer Intern",
    roleFamily: "frontend_engineer",
    experienceLevel: "internship",
    experienceEvidence: "This is a 12-week paid internship for students.",
    location: "Remote (US)",
    workplaceType: "remote",
    summary: "Improve the accessibility of our patient booking pages.",
    descriptionText: `Improve the accessibility of our patient booking pages with React and TypeScript.
This is a 12-week paid internship for students.
This role is fully remote for candidates anywhere in the US.
We provide screen readers and other assistive technology on request.`,
    skills: [s("React"), s("TypeScript"), s("HTML"), s("CSS"), s("Accessibility")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "This role is fully remote for candidates anywhere in the US.", evidenceSource: "listing" },
      { code: "assistive_software", label: "stated", evidence: "We provide screen readers and other assistive technology on request.", evidenceSource: "listing" },
    ],
  },
  {
    key: "tidewater-backend",
    employer: "demo-tidewater",
    title: "Backend Engineer, Data Platform",
    roleFamily: "backend_engineer",
    experienceLevel: "experienced",
    experienceEvidence: "You have 3+ years building data services.",
    location: "Chicago, IL",
    workplaceType: "onsite",
    summary: "Run the pipelines that turn transit data into route plans.",
    descriptionText: `Run the pipelines that turn raw transit data into route plans.
You have 3+ years building data services.
Our office has quiet focus rooms you can book any time.
Skills: Python, SQL, Airflow, Spark, AWS.`,
    skills: [s("Python"), s("SQL"), s("Airflow"), s("Spark"), s("AWS")],
    accommodations: [
      { code: "quiet_workspace", label: "stated", evidence: "Our office has quiet focus rooms you can book any time.", evidenceSource: "listing" },
    ],
  },
  {
    key: "fernway-fullstack",
    employer: "demo-fernway",
    title: "Full Stack Engineer, Collaboration",
    roleFamily: "full_stack_developer",
    experienceLevel: "new_grad",
    experienceEvidence: "We hire new grads into this team every year.",
    location: "Remote (US)",
    workplaceType: "remote",
    summary: "Build real-time commenting and presence features.",
    descriptionText: `Build real-time commenting and presence features with React, Node.js and Redis.
We hire new grads into this team every year.
We are a remote-first company with teammates across many time zones.
Interviews include a take-home exercise instead of live coding.
Skills: React, TypeScript, Node.js, Redis, PostgreSQL, Git.`,
    skills: [s("React"), s("TypeScript"), s("Node.js"), s("Redis"), s("PostgreSQL"), s("Git")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "We are a remote-first company with teammates across many time zones.", evidenceSource: "listing" },
      { code: "written_alternatives", label: "stated", evidence: "Interviews include a take-home exercise instead of live coding.", evidenceSource: "listing" },
    ],
  },
  {
    key: "quillmark-ml",
    employer: "demo-quillmark",
    title: "Machine Learning Engineer",
    roleFamily: "ml_engineer",
    experienceLevel: "new_grad",
    experienceEvidence: "Recent graduates with ML project experience are encouraged to apply.",
    location: "Remote (US)",
    workplaceType: "remote",
    summary: "Train and ship ranking models for legal document search.",
    descriptionText: `Train and ship ranking models for legal document search.
Recent graduates with ML project experience are encouraged to apply.
This is a fully remote role.
We offer a flexible schedule; most of our collaboration is written.
Skills: Python, PyTorch, NLP, SQL, Docker. Nice to have: LLMs.`,
    skills: [s("Python"), s("PyTorch"), s("NLP"), s("SQL"), s("Docker"), s("LLMs", "preferred")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "This is a fully remote role.", evidenceSource: "listing" },
      { code: "flexible_hours", label: "stated", evidence: "We offer a flexible schedule; most of our collaboration is written.", evidenceSource: "listing" },
    ],
  },
  {
    key: "quillmark-applied",
    employer: "demo-quillmark",
    title: "Applied Scientist, Search",
    roleFamily: "applied_scientist",
    experienceLevel: "experienced",
    experienceEvidence: "You have 4+ years of applied research experience.",
    location: "New York, NY",
    workplaceType: "hybrid",
    summary: "Research retrieval methods for long legal documents.",
    descriptionText: `Research retrieval methods for long legal documents and turn them into product features.
You have 4+ years of applied research experience.
We work hybrid from our New York office.
Skills: Python, PyTorch, NLP, Statistics, Machine Learning.`,
    skills: [s("Python"), s("PyTorch"), s("NLP"), s("Statistics"), s("Machine Learning")],
    accommodations: [],
  },
  {
    key: "corvid-ml",
    employer: "demo-corvid",
    title: "ML Engineer, Perception",
    roleFamily: "ml_engineer",
    experienceLevel: "entry_level",
    experienceEvidence: "Entry-level candidates with robotics projects are welcome.",
    location: "Austin, TX",
    workplaceType: "onsite",
    summary: "Build vision models that help robots find items on shelves.",
    descriptionText: `Build vision models that help robots find items on shelves.
Entry-level candidates with robotics projects are welcome.
Our Austin facility is wheelchair-accessible, including the robot test floor.
Skills: Python, PyTorch, Computer Vision, C++, Linux.`,
    skills: [s("Python"), s("PyTorch"), s("Computer Vision"), s("C++"), s("Linux")],
    accommodations: [
      { code: "wheelchair_accessible", label: "stated", evidence: "Our Austin facility is wheelchair-accessible, including the robot test floor.", evidenceSource: "listing" },
    ],
  },
  {
    key: "harbor-data",
    employer: "demo-harbor",
    title: "Data Scientist",
    roleFamily: "data_scientist",
    experienceLevel: "new_grad",
    experienceEvidence: "This role suits new grads who enjoy statistics.",
    location: "Remote (Canada)",
    workplaceType: "remote",
    summary: "Help shop owners understand their cash flow.",
    descriptionText: `Help shop owners understand their cash flow with clear forecasts.
This role suits new grads who enjoy statistics.
You can work remotely from anywhere in Canada.
Skills: Python, Pandas, SQL, Statistics, scikit-learn.`,
    skills: [s("Python"), s("Pandas"), s("SQL"), s("Statistics"), s("scikit-learn")],
    accommodations: [
      { code: "remote_work", label: "stated", evidence: "You can work remotely from anywhere in Canada.", evidenceSource: "listing" },
    ],
  },
];

export const demoApplyUrl = (key: string) => `${DEMO_PAGE}/apply/${key}`;
