import type { VaultFileEntry } from "./vault-contract.js";

export const TOPIC_TEMPLATE_IDS = [
  "general",
  "study-research",
  "work-project",
  "product-builder",
  "writing-content",
  "trip-plan",
  "finance",
  "home-life",
  "medical",
  "legal-admin"
] as const;

export type TopicTemplateId = (typeof TOPIC_TEMPLATE_IDS)[number];
export type TopicSelectionId = TopicTemplateId | "custom";

export interface TopicTemplate {
  id: TopicTemplateId;
  label: string;
  description: string;
  examples: string[];
  directories: TopicTemplateDirectory[];
}

export interface TopicTemplateDirectory {
  relativePath: string;
  purpose: string;
}

export interface ResolvedTopicSelection {
  id: TopicSelectionId;
  scaffoldId: TopicTemplateId;
  label: string;
  customTopic?: string;
}

export const TOPIC_ROUTING_GUIDE_PATH = "docs/llm-wiki-routing.md";

export const TOPIC_TEMPLATES: Record<TopicTemplateId, TopicTemplate> = {
  general: topicTemplate("general", "General wiki", "A PARA-style starting point for mixed sources and broad knowledge work.", [
    "project notes",
    "areas of responsibility",
    "reference resources"
  ], [
    ["wiki/projects", "Active outcomes with a deadline or finish line."],
    ["wiki/areas", "Ongoing responsibilities and standards to maintain."],
    ["wiki/resources", "Reusable reference material that is not tied to one project."],
    ["wiki/archives", "Inactive or superseded material kept for lookup."],
    ["wiki/sources", "Source summaries and evidence notes."],
    ["wiki/questions", "Open questions and durable answers."],
    ["wiki/templates", "Reusable page templates."]
  ]),
  "study-research": topicTemplate("study-research", "Study and research", "Organize literature, atomic notes, methods, data, questions, and outputs.", [
    "literature notes",
    "research questions",
    "datasets"
  ], [
    ["wiki/literature", "Paper, book, article, and lecture notes."],
    ["wiki/notes", "Atomic research notes and reusable observations."],
    ["wiki/concepts", "Definitions, theories, mechanisms, and models."],
    ["wiki/methods", "Methods, protocols, analytical techniques, and study designs."],
    ["wiki/datasets", "Datasets, measurements, cohorts, and data dictionaries."],
    ["wiki/questions", "Research questions, hypotheses, and unresolved gaps."],
    ["wiki/sources", "Source summaries and evidence notes."],
    ["wiki/outputs", "Draft papers, reports, presentations, and study products."]
  ]),
  "work-project": topicTemplate("work-project", "Work project", "Keep project work organized around outcomes, decisions, meetings, people, risks, and requirements.", [
    "decision logs",
    "meeting notes",
    "delivery risks"
  ], [
    ["wiki/projects", "Project briefs, milestones, plans, and current state."],
    ["wiki/decisions", "Decision records, tradeoffs, approvals, and reversals."],
    ["wiki/meetings", "Meeting notes, agendas, action items, and follow-ups."],
    ["wiki/stakeholders", "People, teams, ownership, and communication context."],
    ["wiki/risks", "Risks, blockers, mitigations, and open dependencies."],
    ["wiki/requirements", "Requirements, constraints, acceptance criteria, and specs."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ]),
  "product-builder": topicTemplate("product-builder", "Product builder", "Connect users, feedback, problems, experiments, competitors, decisions, and metrics.", [
    "customer interviews",
    "experiment notes",
    "competitor research"
  ], [
    ["wiki/users", "Segments, personas, interviews, jobs, and user context."],
    ["wiki/feedback", "Feedback, support themes, sales notes, and user quotes."],
    ["wiki/problems", "Problem statements, pain points, demand signals, and status quo."],
    ["wiki/solutions", "Feature ideas, prototypes, product bets, and solution sketches."],
    ["wiki/experiments", "Tests, hypotheses, results, and learning loops."],
    ["wiki/competitors", "Alternatives, competitors, positioning, and market notes."],
    ["wiki/decisions", "Product decisions, tradeoffs, and roadmap rationale."],
    ["wiki/metrics", "Activation, retention, revenue, usage, and quality metrics."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ]),
  "writing-content": topicTemplate("writing-content", "Writing and content", "Move from ideas and research to claims, outlines, drafts, revisions, references, and published work.", [
    "essay outlines",
    "draft research",
    "published pieces"
  ], [
    ["wiki/ideas", "Raw ideas, angles, prompts, and topic seeds."],
    ["wiki/research", "Background research and source-backed notes."],
    ["wiki/claims", "Claims, arguments, evidence, and counterpoints."],
    ["wiki/outlines", "Structures, briefs, storyboards, and article plans."],
    ["wiki/drafts", "Active drafts and works in progress."],
    ["wiki/revisions", "Revision notes, edits, feedback, and version history."],
    ["wiki/references", "Reusable references, citations, examples, and quotes."],
    ["wiki/published", "Published pieces, final assets, and distribution notes."]
  ]),
  "trip-plan": topicTemplate("trip-plan", "Trip plan", "Collect itinerary, places, transport, lodging, bookings, budget, packing, and travel sources.", [
    "itineraries",
    "booking references",
    "destination notes"
  ], [
    ["wiki/itinerary", "Day plans, schedules, constraints, and trip timeline."],
    ["wiki/places", "Destinations, attractions, restaurants, and local notes."],
    ["wiki/transport", "Flights, trains, local transit, car rentals, and routes."],
    ["wiki/lodging", "Hotels, rentals, neighborhoods, and stay options."],
    ["wiki/bookings", "Reservations, confirmations, tickets, and cancellation details."],
    ["wiki/budget", "Costs, currency notes, tradeoffs, and spending plans."],
    ["wiki/packing", "Packing lists, gear, documents, and preparation notes."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ]),
  finance: topicTemplate("finance", "Finance", "Track accounts, cashflow, debts, investments, insurance, taxes, goals, policies, and questions.", [
    "budget notes",
    "tax references",
    "investment research"
  ], [
    ["wiki/accounts", "Bank, brokerage, card, loan, and service account context."],
    ["wiki/budget", "Budget plans, categories, limits, and periodic reviews."],
    ["wiki/cashflow", "Income, expenses, recurring payments, and liquidity notes."],
    ["wiki/debts", "Debt balances, payoff plans, terms, and refinancing notes."],
    ["wiki/investments", "Investment research, allocations, watchlists, and assumptions."],
    ["wiki/insurance", "Insurance policies, coverage, claims, and protection gaps."],
    ["wiki/taxes", "Tax documents, deadlines, references, and filing questions."],
    ["wiki/goals", "Financial goals, plans, milestones, and decision criteria."],
    ["wiki/policies", "Personal finance rules, constraints, checklists, and playbooks."],
    ["wiki/questions", "Open questions for research or professional review."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ]),
  "home-life": topicTemplate("home-life", "Home and life", "Maintain household systems, maintenance, vendors, inventory, purchases, warranties, records, routines, and emergency info.", [
    "home maintenance",
    "important records",
    "recurring routines"
  ], [
    ["wiki/household", "Household overview, rooms, systems, family context, and admin."],
    ["wiki/maintenance", "Maintenance logs, schedules, issues, repairs, and projects."],
    ["wiki/vendors", "Contractors, services, providers, and contact history."],
    ["wiki/inventory", "Important belongings, appliances, serial numbers, and assets."],
    ["wiki/purchases", "Purchase research, receipts, orders, and replacement decisions."],
    ["wiki/warranties", "Warranties, manuals, service plans, and claim details."],
    ["wiki/records", "Important records, IDs, forms, and long-lived documents."],
    ["wiki/routines", "Recurring routines, checklists, chores, and household operations."],
    ["wiki/emergency", "Emergency contacts, instructions, shutoffs, and contingency notes."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ]),
  medical: topicTemplate("medical", "Medical", "Structure medical knowledge around anatomy, physiology, conditions, diagnostics, drugs, procedures, guidelines, cases, questions, and sources.", [
    "clinical references",
    "drug notes",
    "diagnostic criteria"
  ], [
    ["wiki/anatomy", "Anatomical structures, systems, landmarks, and relationships."],
    ["wiki/physiology", "Normal function, mechanisms, pathways, and regulation."],
    ["wiki/conditions", "Diseases, syndromes, presentations, and differential diagnoses."],
    ["wiki/diagnostics", "Tests, criteria, imaging, labs, and diagnostic workflows."],
    ["wiki/drugs", "Medications, mechanisms, indications, contraindications, and adverse effects."],
    ["wiki/procedures", "Procedures, techniques, indications, risks, and aftercare."],
    ["wiki/guidelines", "Guidelines, protocols, recommendations, and evidence grades."],
    ["wiki/cases", "Case notes, vignettes, clinical patterns, and applied examples."],
    ["wiki/questions", "Open clinical questions and topics for professional review."],
    ["wiki/sources", "Source summaries and evidence notes."],
    ["wiki/templates", "Reusable medical page templates."]
  ]),
  "legal-admin": topicTemplate("legal-admin", "Legal and admin", "Organize matters, documents, contracts, parties, evidence, deadlines, correspondence, filings, questions, and sources.", [
    "contracts",
    "evidence files",
    "deadline checklists"
  ], [
    ["wiki/matters", "Cases, administrative matters, projects, and issue overviews."],
    ["wiki/documents", "Important documents, forms, IDs, certificates, and records."],
    ["wiki/contracts", "Contracts, agreements, terms, obligations, and amendments."],
    ["wiki/parties", "People, organizations, roles, counsel, agencies, and contacts."],
    ["wiki/evidence", "Evidence, exhibits, facts, artifacts, and source-backed claims."],
    ["wiki/deadlines", "Deadlines, renewals, statutes, filing dates, and reminders."],
    ["wiki/correspondence", "Emails, letters, notices, calls, and communication history."],
    ["wiki/filings", "Filed forms, submissions, receipts, and official responses."],
    ["wiki/questions", "Open questions for research or professional review."],
    ["wiki/sources", "Source summaries and evidence notes."]
  ])
};

export function getTopicTemplate(id: TopicTemplateId): TopicTemplate {
  return TOPIC_TEMPLATES[id];
}

export function topicTemplateDirectories(selection: ResolvedTopicSelection): string[] {
  return getTopicTemplate(selection.scaffoldId).directories.map((directory) => directory.relativePath);
}

export function topicTemplateFileEntries(selection: ResolvedTopicSelection): VaultFileEntry[] {
  return [
    {
      relativePath: TOPIC_ROUTING_GUIDE_PATH,
      content: renderRoutingGuide(getTopicTemplate(selection.scaffoldId), selection)
    }
  ];
}

export function isTopicSelectionId(value: string): value is TopicSelectionId {
  return value === "custom" || isTopicTemplateId(value);
}

export function isTopicTemplateId(value: string): value is TopicTemplateId {
  return (TOPIC_TEMPLATE_IDS as readonly string[]).includes(value);
}

function topicTemplate(
  id: TopicTemplateId,
  label: string,
  description: string,
  examples: string[],
  directories: Array<[string, string]>
): TopicTemplate {
  return {
    id,
    label,
    description,
    examples,
    directories: directories.map(([relativePath, purpose]) => ({ relativePath, purpose }))
  };
}

function renderRoutingGuide(template: TopicTemplate, selection: ResolvedTopicSelection): string {
  const today = process.env.LLM_WIKI_SKILLS_NOW?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const customLine = selection.customTopic ? `\nCustom topic: ${selection.customTopic}\n` : "";
  return `# LLM Wiki Routing

Generated: ${today}
Topic: ${selection.label} (${selection.id})
Scaffold: ${template.id}${customLine}

Use this guide when ingesting sources, answering from the wiki, or filing durable notes.

## Routing Rules

1. Preserve source evidence under \`raw/\` when needed.
2. Summarize each source unit under \`wiki/sources/\` when the scaffold includes it.
3. Route durable synthesis into the most specific matching \`wiki/\` category below.
4. Search existing category pages before creating a new page.
5. Prefer updating overlapping pages over creating duplicates.
6. Put unresolved or user-facing questions under \`wiki/questions/\` when the scaffold includes it.
7. If no category fits, use the closest general category and note the uncertainty.

## Categories

${template.directories.map((directory) => `- \`${directory.relativePath}/\`: ${directory.purpose}`).join("\n")}
`;
}
