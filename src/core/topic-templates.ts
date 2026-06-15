import type { VaultFileEntry } from "./vault-contract.js";

export const TOPIC_TEMPLATE_IDS = [
  "general",
  "study-research",
  "work-project",
  "product-builder",
  "writing-content",
  "trip-plan",
  "investment",
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
    ["wiki/concepts", "Definitions, theories, mechanisms, and models."],
    ["wiki/papers", "Paper summaries, findings, citations, and evidence notes."],
    ["wiki/authors", "Researcher, institution, and author context."],
    ["wiki/methods", "Methods, protocols, analytical techniques, and study designs."],
    ["wiki/datasets", "Datasets, measurements, cohorts, and data dictionaries."],
    ["wiki/experiments", "Experiment notes, setups, results, and reproducibility details."],
    ["wiki/comparisons", "Comparisons between papers, methods, models, and findings."],
    ["wiki/claims-and-evidence", "Claims mapped to supporting and conflicting evidence."],
    ["wiki/templates", "Reusable study and research page templates."]
  ]),
  "work-project": topicTemplate("work-project", "Work project", "Keep project work organized around outcomes, decisions, meetings, people, risks, and requirements.", [
    "decision logs",
    "meeting notes",
    "delivery risks"
  ], [
    ["wiki/architecture", "System design, diagrams, components, and technical context."],
    ["wiki/features", "Feature specs, user flows, requirements, and implementation notes."],
    ["wiki/services", "Service ownership, behavior, dependencies, and runbooks."],
    ["wiki/projects", "Project briefs, plans, current state, and delivery context."],
    ["wiki/decisions", "Decision records, tradeoffs, approvals, and reversals."],
    ["wiki/meetings", "Meeting notes, agendas, action items, and follow-ups."],
    ["wiki/requirements", "Requirements, constraints, acceptance criteria, and specs."],
    ["wiki/stakeholders", "People, teams, ownership, and communication context."],
    ["wiki/milestones", "Milestones, delivery checkpoints, and launch plans."],
    ["wiki/incidents", "Incident reports, impact, causes, and remediation."],
    ["wiki/risks", "Risks, blockers, mitigations, and open dependencies."],
    ["wiki/retrospectives", "Retrospectives, lessons learned, and process changes."],
    ["wiki/templates", "Reusable work project page templates."]
  ]),
  "product-builder": topicTemplate("product-builder", "Product builder", "Connect users, feedback, problems, experiments, competitors, decisions, and metrics.", [
    "customer interviews",
    "experiment notes",
    "competitor research"
  ], [
    ["wiki/personas", "Segments, personas, interviews, jobs, and user context."],
    ["wiki/problems", "Problem statements, pain points, demand signals, and status quo."],
    ["wiki/use-cases", "Use cases, workflows, jobs, and user scenarios."],
    ["wiki/features", "Feature ideas, prototypes, product bets, and solution sketches."],
    ["wiki/user-journeys", "User journeys, funnels, touchpoints, and experience maps."],
    ["wiki/competitors", "Alternatives, competitors, positioning, and market notes."],
    ["wiki/pricing", "Pricing research, packaging, willingness to pay, and monetization."],
    ["wiki/metrics", "Activation, retention, revenue, usage, and quality metrics."],
    ["wiki/growth", "Growth channels, loops, experiments, and distribution ideas."],
    ["wiki/experiments", "Tests, hypotheses, results, and learning loops."],
    ["wiki/templates", "Reusable product builder page templates."]
  ]),
  "writing-content": topicTemplate("writing-content", "Writing and content", "Move from ideas and research to claims, outlines, drafts, revisions, references, and published work.", [
    "essay outlines",
    "draft research",
    "published pieces"
  ], [
    ["wiki/audience", "Audience profiles, reader needs, objections, and vocabulary."],
    ["wiki/topics", "Topic clusters, angles, prompts, and content seeds."],
    ["wiki/series", "Series plans, recurring formats, and connected content arcs."],
    ["wiki/claims-and-sources", "Claims, arguments, evidence, and source mappings."],
    ["wiki/examples", "Reusable examples, anecdotes, snippets, and references."],
    ["wiki/outlines", "Structures, briefs, storyboards, and article plans."],
    ["wiki/templates", "Reusable writing and content page templates."]
  ]),
  "trip-plan": topicTemplate("trip-plan", "Trip plan", "Collect itinerary, places, transport, lodging, bookings, budget, packing, and travel sources.", [
    "itineraries",
    "booking references",
    "destination notes"
  ], [
    ["wiki/destinations", "Destination overviews, constraints, and decision context."],
    ["wiki/cities", "City notes, neighborhoods, logistics, and local context."],
    ["wiki/attractions", "Attractions, activities, hours, costs, and visit notes."],
    ["wiki/restaurants", "Restaurants, food options, reservations, and reviews."],
    ["wiki/hotels", "Hotels, rentals, neighborhoods, and stay options."],
    ["wiki/transport", "Flights, trains, local transit, car rentals, and routes."],
    ["wiki/budget", "Costs, currency notes, tradeoffs, and spending plans."],
    ["wiki/itinerary", "Day plans, schedules, constraints, and trip timeline."],
    ["wiki/templates", "Reusable trip planning page templates."]
  ]),
  investment: topicTemplate("investment", "Investment", "Track policy, watchlists, portfolio, companies, theses, valuation, risks, catalysts, macro, and decisions.", [
    "company notes",
    "valuation notes",
    "investment research"
  ], [
    ["wiki/portfolio", "Portfolio holdings, allocation, exposure, and review notes."],
    ["wiki/companies", "Company pages, business models, filings, and operating context."],
    ["wiki/industries", "Industry structure, market maps, and sector trends."],
    ["wiki/theses", "Investment theses, assumptions, evidence, and counterarguments."],
    ["wiki/valuation", "Valuation models, multiples, assumptions, and scenarios."],
    ["wiki/risks", "Business, financial, market, execution, and thesis risks."],
    ["wiki/catalysts", "Catalysts, events, timelines, and monitoring notes."],
    ["wiki/competitors", "Competitor pages, comparisons, and positioning."],
    ["wiki/macro", "Macro context, rates, currencies, cycles, and policy notes."],
    ["wiki/postmortems", "Decision reviews, postmortems, and lessons learned."],
    ["wiki/templates", "Reusable investment page templates."]
  ]),
  "home-life": topicTemplate("home-life", "Home and life", "Maintain household systems, maintenance, vendors, inventory, purchases, warranties, records, routines, and emergency info.", [
    "home maintenance",
    "important records",
    "recurring routines"
  ], [
    ["wiki/routines", "Recurring routines, checklists, chores, and household operations."],
    ["wiki/appliances", "Appliances, manuals, serial numbers, maintenance, and issues."],
    ["wiki/maintenance", "Maintenance logs, schedules, issues, repairs, and projects."],
    ["wiki/repairs", "Repair notes, vendors, estimates, parts, and outcomes."],
    ["wiki/purchases", "Purchase research, receipts, orders, and replacement decisions."],
    ["wiki/subscriptions", "Subscriptions, renewals, plans, and cancellation notes."],
    ["wiki/utilities", "Utility providers, bills, usage, and account context."],
    ["wiki/inventory", "Important belongings, appliances, serial numbers, and assets."],
    ["wiki/documents", "Important records, IDs, forms, and long-lived documents."],
    ["wiki/templates", "Reusable home and life page templates."]
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
    "applications",
    "deadline checklists"
  ], [
    ["wiki/legal-matters", "Legal matters, issues, facts, status, and next actions."],
    ["wiki/contracts", "Contracts, agreements, terms, obligations, and amendments."],
    ["wiki/obligations", "Obligations, responsibilities, compliance needs, and renewals."],
    ["wiki/deadlines", "Deadlines, renewals, statutes, filing dates, and reminders."],
    ["wiki/applications", "Applications, submissions, requirements, and status notes."],
    ["wiki/agencies", "Government agencies, offices, portals, and procedures."],
    ["wiki/contacts", "Contacts, counsel, agencies, organizations, and communication context."],
    ["wiki/decision-records", "Decision records, tradeoffs, approvals, and reversals."],
    ["wiki/templates", "Reusable legal and admin page templates."]
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
