import { collectFavourites } from "./input";
import { InputError, QlooError } from "./errors";
import { narrateDays } from "./llm";
import { QlooClient, buildInsightParams, buildSearchParams, buildTagParams } from "./qloo";
import { buildReceipt } from "./receipts";
import type { Favourite, PickKind, PlanInput, QlooEntity, QlooTag, ResolvedSeed, WeekendDay, WeekendPlan } from "./types";

export interface PlanOptions {
  qloo?: QlooClient;
  nebiusApiKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

function chooseSeed(entities: QlooEntity[], favourite: Favourite): QlooEntity | undefined {
  const normalized = favourite.query.toLocaleLowerCase();
  const sameName = entities.filter((entity) => entity.name.toLocaleLowerCase() === normalized);
  if (favourite.year) {
    const sameYear = (sameName.length ? sameName : entities).find((entity) => {
      const year = entity.properties.release_year ?? entity.properties.year ?? String(entity.properties.release_date ?? "").slice(0, 4);
      return String(year) === String(favourite.year);
    });
    if (sameYear) return sameYear;
  }
  return sameName[0] ?? entities[0];
}

function categoryTag(tags: QlooTag[], query: string): QlooTag | undefined {
  // Only use discovered place-category tags as hard place filters.
  const valid = tags.filter((tag) => tag.type.includes("place") || tag.id.includes(":category:place:"));
  const names: Record<string, RegExp> = {
    bar: /\b(bars?|pubs?)\b/,
    restaurant: /\brestaurants?\b/,
    cafe: /\b(cafes?|coffee|coffeehouse)\b/,
  };
  const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // A text match for "bar" can also return "barbershop". It is not a bar.
  return valid.find((tag) => normalize(tag.name) === query)
    ?? valid.find((tag) => names[query]?.test(normalize(tag.name)));
}

function cuisineTag(tags: QlooTag[]): QlooTag | undefined {
  return tags.find((tag) => /cuisine|food|dish|restaurant|genre:place/i.test(`${tag.type} ${tag.id}`));
}

function pickDetail(entity: QlooEntity, kind: PickKind): string {
  if (kind === "artist") return "Your Saturday gig mood. Discover this artist, then check local listings for a show.";
  if (kind === "book") {
    const author = entity.properties.author;
    return typeof author === "string" ? `A Sunday reading pick by ${author}.` : "Your Sunday reading pick. Find a copy and settle into the next chapter.";
  }
  if (kind === "restaurant") {
    const cuisine = entity.tags.find((tag) => /cuisine/.test(tag.type));
    return cuisine ? `Make a lunch of it. Explore ${cuisine.name.toLowerCase()} and check the current menu.` : "Make a lunch of it. Check the current menu for your next favourite dish.";
  }
  return kind === "bar" ? "Your Friday night starting point. Check opening hours before heading out." : "Bring your Sunday book. Check opening hours, find a corner, stay a little longer.";
}

export async function createPlan(input: PlanInput, options: PlanOptions = {}): Promise<WeekendPlan> {
  const qloo = options.qloo ?? new QlooClient({ apiKey: process.env.QLOO_API_KEY, signal: options.signal });
  const collected = collectFavourites(input);
  const warnings = [...collected.warnings];
  const seeds: ResolvedSeed[] = [];
  const cuisineTags: QlooTag[] = [];
  let searchErrors = 0;

  // Stage 1: resolve titles and dishes, with bounded concurrent requests.
  for (let offset = 0; offset < collected.favourites.length; offset += 5) {
    const batch = collected.favourites.slice(offset, offset + 5);
    const resolved = await Promise.allSettled(batch.map(async (favourite) => {
      if (favourite.kind === "dish") {
        const result = await qloo.tags("/v2/tags", buildTagParams(favourite.query), `Resolve dish: ${favourite.query}`);
        return { favourite, tag: cuisineTag(result.items) };
      }
      const result = await qloo.entities("/search", buildSearchParams(favourite), `Resolve favourite: ${favourite.query}`);
      return { favourite, entity: chooseSeed(result.items, favourite), step: result.step };
    }));
    for (let i = 0; i < resolved.length; i++) {
      const result = resolved[i];
      if (result.status === "rejected") {
        searchErrors++;
        warnings.push(`We couldn’t resolve “${batch[i].query}” this time.`);
        continue;
      }
      const value = result.value;
      if ("tag" in value && value.tag) {
        if (!cuisineTags.some((tag) => tag.id === value.tag!.id)) cuisineTags.push(value.tag);
      } else if ("entity" in value && value.entity) {
        if (!seeds.some((seed) => seed.entity.entityId === value.entity!.entityId)) {
          seeds.push({ input: value.favourite.input, entity: value.entity, searchTraceId: value.step.id });
        }
        if (qloo.mode === "live" && value.entity.name.toLocaleLowerCase() !== value.favourite.query.toLocaleLowerCase()) {
          warnings.push(`“${value.favourite.query}” resolved to “${value.entity.name}”. Check your resolved favourites in the receipt.`);
        }
      } else warnings.push(`No match for “${value.favourite.query}”. Try a more specific title or a movie:, artist:, book: or dish: prefix.`);
    }
  }
  if (!seeds.length && !cuisineTags.length) {
    if (searchErrors) throw new QlooError();
    throw new InputError("Your twin couldn’t match those favourites. Try a full title, artist name, or dish: followed by a cuisine.", 422);
  }
  if (qloo.mode === "mock") warnings.push("Demo mode maps favourites to invented stand-ins. Every place, artist, book, tag and score in this plan is synthetic.");

  const seedIds = seeds.map((seed) => seed.entity.entityId);
  const signalTagIds = cuisineTags.map((tag) => tag.id);
  const signal = { seedIds, signalTagIds };

  // Stage 2: taste analysis and category discovery. No taxonomy IDs are guessed.
  const discovery = await Promise.allSettled([
    qloo.tags("/v2/insights", buildInsightParams({ type: "tag", ...signal }), "Read your shared taste tags"),
    ...["bar", "restaurant", "cafe"].map((kind) => qloo.tags("/v2/tags", buildTagParams(kind), `Find valid ${kind} tags`)),
  ]);
  let tasteTags: QlooTag[] = [];
  let tasteTraceId: string | null = null;
  if (discovery[0].status === "fulfilled") {
    tasteTags = discovery[0].value.items;
    tasteTraceId = discovery[0].value.step.id;
  } else warnings.push("The taste-tag analysis was unavailable. Receipts only show tags shared directly with your resolved favourites.");

  const categories = new Map<string, QlooTag>();
  ["bar", "restaurant", "cafe"].forEach((kind, index) => {
    const result = discovery[index + 1];
    const tag = result.status === "fulfilled" ? categoryTag(result.value.items, kind) : undefined;
    if (tag) categories.set(kind, tag);
    else warnings.push(`We couldn’t find a valid ${kind} category tag, so that stop is left open.`);
  });

  const days: WeekendDay[] = [
    { id: "friday", name: "Friday", subtitle: "Ease into the evening", intro: "", picks: [] },
    { id: "saturday", name: "Saturday", subtitle: "Take the scenic route", intro: "", picks: [] },
    { id: "sunday", name: "Sunday", subtitle: "Find your soft landing", intro: "", picks: [] },
  ];
  const slots: { kind: PickKind; type: "place" | "artist" | "book"; day: number; time: string; title: string }[] = [
    { kind: "bar", type: "place", day: 0, time: "Friday evening", title: "The first round" },
    { kind: "restaurant", type: "place", day: 1, time: "Saturday lunch", title: "A delicious detour" },
    { kind: "artist", type: "artist", day: 1, time: "Saturday night", title: "Your gig mood" },
    { kind: "book", type: "book", day: 2, time: "Sunday morning", title: "One more chapter" },
    { kind: "cafe", type: "place", day: 2, time: "Sunday afternoon", title: "Stay for a second cup" },
  ];

  // Stage 3: five cross-domain discoveries. Retry a too-narrow lunch query once,
  // relaxing only the cuisine filter and leaving the category and city in place.
  const recommendations = await Promise.allSettled(slots.map(async (slot) => {
    const category = categories.get(slot.kind);
    if (slot.type === "place" && !category) return null;
    const filterTagIds = category ? [category.id] : [];
    // Multiple cuisine preferences are signal tags. One is a hard lunch filter.
    if (slot.kind === "restaurant" && cuisineTags[0]) filterTagIds.push(cuisineTags[0].id);
    const params = buildInsightParams({ type: slot.type, ...signal, city: input.city, filterTagIds });
    let result = await qloo.entities("/v2/insights", params, `Discover ${slot.kind} for ${days[slot.day].name}`);
    if (!result.items.length && slot.kind === "restaurant" && filterTagIds.length > 1) {
      result = await qloo.entities("/v2/insights", buildInsightParams({ type: "place", ...signal, city: input.city, filterTagIds: [category!.id] }), "Broaden lunch: keep city and restaurant category");
    }
    return result;
  }));
  const chosen = new Set<string>();
  for (let index = 0; index < recommendations.length; index++) {
    const result = recommendations[index];
    const slot = slots[index];
    if (result.status === "rejected") {
      warnings.push(`Qloo couldn’t finish the ${slot.kind} search. That stop is left open.`);
      continue;
    }
    if (!result.value) continue;
    const { items, step } = result.value;
    const candidate = items.find((item) => !chosen.has(item.entityId) && !seedIds.includes(item.entityId));
    if (!candidate) {
      warnings.push(`No new ${slot.kind} matched this taste signal. That stop is left open.`);
      continue;
    }
    chosen.add(candidate.entityId);
    days[slot.day].picks.push({
      id: slot.kind, kind: slot.kind, time: slot.time, title: slot.title, entity: candidate, detail: pickDetail(candidate, slot.kind),
      receipt: buildReceipt({ mode: qloo.mode, seeds, entity: candidate, insight: step, tasteTags, tasteTraceId, signalTags: cuisineTags }),
    });
  }
  if (!days.some((day) => day.picks.length) && recommendations.some((result) => result.status === "rejected")) throw new QlooError();
  if (!days.some((day) => day.picks.length)) throw new InputError("No weekend picks matched this city and taste. Try another city or a few different favourites.", 422);

  const narration = await narrateDays(days, { apiKey: options.nebiusApiKey, fetch: options.fetch, signal: options.signal });
  for (const day of days) day.intro = narration.intros[day.id];
  const rankedTags = [...tasteTags].filter((tag) => !/hotel_rating|:price|rating/i.test(tag.type)).sort((a, b) => (b.affinity ?? -Infinity) - (a.affinity ?? -Infinity)).slice(0, 5);
  return {
    mode: qloo.mode, city: input.city, seeds, cuisineTags,
    persona: { title: rankedTags[0] ? `A little ${rankedTags[0].name.toLowerCase()}, a lot of you.` : "A taste all your own.", tags: rankedTags, traceId: tasteTraceId },
    days, trace: qloo.trace, warnings, narration: narration.source,
  };
}
