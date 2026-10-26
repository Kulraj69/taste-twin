import type { QlooEndpoint } from "@/lib/types";

// Every entity, tag, identifier, score and property below is authored fiction.
// These are NOT recorded, cached, anonymized or transformed Qloo responses.
const tag = (id: string, name: string, type = "urn:tag:genre") => ({ id: `mock-tag-${id}`, name, type });
const vibes = [
  [tag("moonlit", "Moonlit melancholy"), tag("offbeat", "Offbeat romance"), tag("warm", "Warm acoustics")],
  [tag("analog", "Analog soul"), tag("wandering", "Curious wanderers"), tag("groove", "Sun-drenched grooves")],
  [tag("dream", "Dreamlike worlds"), tag("slow", "Slow living"), tag("quiet", "Quiet discoveries")],
];
const categories = {
  bar: tag("bar", "Bar", "urn:tag:category:place"),
  restaurant: tag("restaurant", "Restaurant", "urn:tag:category:place"),
  cafe: tag("cafe", "Cafe", "urn:tag:category:place"),
};
const cuisines = [tag("noodles", "Silky noodles", "urn:tag:cuisine"), tag("fire", "Ember-fired cooking", "urn:tag:cuisine"), tag("garden", "Garden-table cooking", "urn:tag:cuisine")];

const seedNames = [
  ["The Last Tram to Marigold", "Velvet Satellites", "An Atlas of Almosts"],
  ["Postcards from Planet Sunday", "Mango Radio Club", "The Art of Getting Lost Slowly"],
  ["The Museum of Small Tomorrows", "Moss & the Moon", "A Pocketful of Other Worlds"],
];

function hash(value: string): number {
  return Array.from(value).reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function entity(name: string, id: string, type: string, vibe: number, properties: Record<string, unknown> = {}, affinity?: number, extraTags: ReturnType<typeof tag>[] = []) {
  return {
    name, entity_id: `mock-${id}`, type: `urn:entity:${type}`, types: [`urn:entity:${type}`],
    subtype: type === "place" ? "urn:entity:place" : null,
    properties, tags: [...vibes[vibe], ...extraTags], popularity: 0.42,
    ...(affinity === undefined ? {} : { query: { affinity } }),
  };
}

const venues: Record<string, [string, string, string]> = {
  Lisbon: ["Fado & Ferment", "The Saffron Postcard", "Chapter & Custard"],
  Tokyo: ["Neon Persimmon", "The Noodle Observatory", "Paper Lantern Library"],
  "New York": ["The Velvet Turnstile", "Supper on Saturn", "Margin Notes & Maple"],
  Mumbai: ["Monsoon & Marigold", "The Tamarind Telegram", "Banyan & Bookmarks"],
  Berlin: ["The Amber Frequency", "Supper at the Spindle", "The Quiet Umlaut"],
};
const artists = ["The Apricot Hours", "Citrus Cinema Orchestra", "Fernlight Assembly"];
const books = ["The City That Kept Your Letters", "A Field Guide to Side Streets", "When the Windows Grew Gardens"];

export function mockResponse(endpoint: QlooEndpoint, params: Record<string, string>): unknown {
  if (endpoint === "/search") {
    const query = params.query.toLowerCase();
    let vibe = seedNames.findIndex((names) => names.some((name) => name.toLowerCase() === query));
    if (vibe < 0) vibe = hash(query) % 3;
    const matchedIndex = seedNames[vibe].findIndex((name) => name.toLowerCase() === query);
    const requestedType = params.types.split(",")[0]?.replace("urn:entity:", "") ?? "movie";
    const type = matchedIndex >= 0 ? ["movie", "artist", "book"][matchedIndex] : requestedType;
    const index = Math.max(0, ["movie", "artist", "book"].indexOf(type));
    return { success: true, results: [entity(seedNames[vibe][index], `seed-${vibe}-${index}`, type, vibe, { release_year: 2021 })] };
  }
  if (endpoint === "/v2/tags") {
    const query = params["filter.query"].toLowerCase();
    const category = categories[query as keyof typeof categories];
    const cuisine = /noodle|ramen|pasta/.test(query) ? cuisines[0] : /garden|salad|vegetable/.test(query) ? cuisines[2] : cuisines[1];
    return { success: true, results: { tags: [category ?? cuisine] } };
  }
  const seedIds = params["signal.interests.entities"] ?? "";
  const vibeMatch = /mock-seed-(\d)/.exec(seedIds);
  const vibe = vibeMatch ? Number(vibeMatch[1]) % 3 : hash(params["signal.interests.tags"] ?? "") % 3;
  if (params["filter.type"] === "urn:tag") {
    return { success: true, results: { tags: vibes[vibe].map((item, index) => ({ ...item, query: { affinity: [0.9364, 0.8817, 0.8203][index] } })) } };
  }
  const type = params["filter.type"].replace("urn:entity:", "");
  if (type === "artist") return { success: true, results: { entities: [entity(artists[vibe], `artist-${vibe}`, "artist", vibe, { description: "An invented ensemble for your Saturday listening detour." }, 0.8947)] } };
  if (type === "book") return { success: true, results: { entities: [entity(books[vibe], `book-${vibe}`, "book", vibe, { description: "A fictional book about the little lives that make a city.", author: "Rowan Saffron" }, 0.9126)] } };
  const filter = params["filter.tags"] ?? "";
  const kind = filter.includes(categories.bar.id) ? "bar" : filter.includes(categories.cafe.id) ? "cafe" : "restaurant";
  const city = params["filter.location.query"];
  const index = ["bar", "restaurant", "cafe"].indexOf(kind);
  const name = (venues[city] ?? ["The Moonlit Thimble", "The Wandering Ladle", "Footnotes & Fig"])[index];
  const cuisine = cuisines.find((item) => filter.includes(item.id)) ?? cuisines[vibe];
  const description = {
    bar: "A fictional little listening bar, with amber light and room for one more story.",
    restaurant: "An invented neighbourhood kitchen for a long lunch and a delicious detour.",
    cafe: "An imaginary, unhurried corner for a good book and a second cup.",
  }[kind];
  return { success: true, results: { entities: [entity(name, `place-${hash(city)}-${kind}-${vibe}`, "place", vibe,
    { description, address: `Imaginary Lantern Lane, ${city}`, cuisine: kind === "restaurant" ? cuisine.name : undefined },
    [0.9238, 0.9071, 0.8812][index], [categories[kind], ...(kind === "restaurant" ? [cuisine] : [])]) ] } };
}

export const MOCK_EXAMPLES = [
  { id: "romantic", title: "Midnight romantic", hint: "Soft films. Warm records. Late nights.", city: "Lisbon", favourites: [`movie: ${seedNames[0][0]}`, `artist: ${seedNames[0][1]}`, `book: ${seedNames[0][2]}`, "dish: ember-roasted aubergine"] },
  { id: "wanderer", title: "Analog wanderer", hint: "Deep grooves. Side streets. Something spicy.", city: "Mumbai", favourites: [`movie: ${seedNames[1][0]}`, `artist: ${seedNames[1][1]}`, `book: ${seedNames[1][2]}`, "dish: silky noodles"] },
  { id: "dreamer", title: "Curious daydreamer", hint: "Strange worlds. Quiet corners. Slow Sundays.", city: "Tokyo", favourites: [`movie: ${seedNames[2][0]}`, `artist: ${seedNames[2][1]}`, `book: ${seedNames[2][2]}`, "dish: garden vegetables"] },
];
