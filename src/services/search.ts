import { Paginated } from '../types';

const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'is', 'we', 'you']);

// "Senior Node.js Developer" -> ["senior", "node.js", "developer"]
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) ?? [])
    .map((t) => t.replace(/\.+$/, ''))
    .filter((t) => t && !STOP_WORDS.has(t));
}

export interface SearchField<T> {
  text: (item: T) => string; // which text of the item to search
  weight: number; // a match in the title should count more than one in the description
}

// Full-text search that works for any type T (jobs, candidates, ...).
// Score = matches x field weight x rarity of the word (words found in fewer items count more).
export function fullTextSearch<T>(items: T[], query: string, fields: SearchField<T>[]): T[] {
  const terms = tokenize(query);
  if (terms.length === 0) return items;

  const docs = items.map((item) => fields.map((f) => tokenize(f.text(item))));

  // how many items each search word appears in
  const docFreq = terms.map(
    (term) => docs.filter((fieldTokens) => fieldTokens.some((tokens) => tokens.some((t) => matches(t, term)))).length
  );

  return items
    .map((item, i) => {
      let score = 0;
      terms.forEach((term, t) => {
        const rarity = Math.log(1 + items.length / (1 + docFreq[t]));
        fields.forEach((field, f) => {
          const count = docs[i][f].filter((token) => matches(token, term)).length;
          score += count * field.weight * rarity;
        });
      });
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

// exact match, or prefix match for longer words ("develop" finds "developer")
function matches(token: string, term: string): boolean {
  return token === term || (term.length >= 3 && token.startsWith(term));
}

export function paginate<T>(list: T[], page: number, limit: number): Paginated<T> {
  return {
    items: list.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: list.length,
    totalPages: Math.ceil(list.length / limit),
  };
}

// "node, React" -> ["node", "react"]
export function parseList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
