import type { Format, Topic } from "../types";

const topicRules: Array<[Topic, RegExp]> = [
  ["AI & Tech", /\b(ai|artificial intelligence|machine learning|ml|agent|software|technology|tech|data|robotics)\b/i],
  ["Consumer & Retail", /\b(consumer|retail|commerce|shopping|brand|customer|product design|e-?commerce)\b/i],
  ["Social Impact", /\b(social impact|climate|community (?:impact|resilience|development|needs|health)|nonprofit|non-profit|public interest|sustainability|civic|accessibility)\b/i],
  ["Career & Industry", /\b(career|industry|leadership|professional|workforce|hiring|operator|product leader)\b/i],
  ["Startups", /\b(startup|founder|venture|fundrais|early.stage|entrepreneur|accelerator)\b/i],
];

const formatRules: Array<[Format, RegExp]> = [
  ["Hackathon", /\b(hackathon|hack day|build weekend)\b/i],
  ["Workshop", /\b(workshop|hands.on|lab|tutorial|training)\b/i],
  ["Speaker / Panel", /\b(panel|fireside|talk|speaker|conversation|keynote|discussion)\b/i],
  ["Demo", /\b(demo|showcase|product launch|prototype)\b/i],
  ["Networking", /\b(networking|meetup|mixer|community gathering|happy hour)\b/i],
  ["Conference", /\b(conference|summit|symposium|forum)\b/i],
];

function nativeMatches<T extends string>(nativeLabels: string[] | undefined, labels: readonly T[]): T[] {
  if (!nativeLabels?.length) return [];
  const normalized = new Set(nativeLabels.map((label) => label.trim().toLowerCase()));
  return labels.filter((label) => normalized.has(label.toLowerCase()));
}

export function classifyEvent(
  title: string,
  description: string,
  nativeLabels?: string[],
): { topics: Topic[]; formats: Format[] } {
  const nativeTopics = nativeMatches(nativeLabels, topicRules.map(([label]) => label));
  const nativeFormats = nativeMatches(nativeLabels, formatRules.map(([label]) => label));
  const text = `${title} ${description}`;
  return {
    topics: nativeTopics.length ? nativeTopics : topicRules.filter(([, rule]) => rule.test(text)).map(([label]) => label),
    formats: nativeFormats.length ? nativeFormats : formatRules.filter(([, rule]) => rule.test(text)).map(([label]) => label),
  };
}
