import { parseLetterboxdCsv, MAX_CSV_BYTES } from "./csv";
import { InputError } from "./errors";
import type { Favourite, FavouriteKind, PlanInput } from "./types";

export const MAX_FAVOURITES = 20;
export const MAX_BODY_BYTES = MAX_CSV_BYTES * 6 + 32_768; // Allow JSON-escaped CSV characters.

export function validatePlanInput(value: unknown): PlanInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Send your favourites and a city.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.favourites) || input.favourites.some((item) => typeof item !== "string")) {
    throw new InputError("Favourites should be a list of titles, artists, books or dishes.");
  }
  if (input.favourites.length > MAX_FAVOURITES) throw new InputError("Pick up to 20 favourites for this trip.");
  const favourites = (input.favourites as string[]).map((item) => item.trim()).filter(Boolean);
  if (favourites.some((item) => item.length > 200)) throw new InputError("Keep each favourite under 200 characters.");
  if (typeof input.city !== "string" || !input.city.trim() || input.city.trim().length > 80 || /[\x00-\x1f]/.test(input.city)) {
    throw new InputError("Choose a city (up to 80 characters).");
  }
  if (input.letterboxdCsv !== undefined && typeof input.letterboxdCsv !== "string") {
    throw new InputError("The Letterboxd upload must be CSV text.");
  }
  const csv = input.letterboxdCsv as string | undefined;
  if (csv && new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
    throw new InputError("That CSV is a little big. Please keep it under 200 KB.", 413);
  }
  if (!favourites.length && !csv?.trim()) throw new InputError("Give your twin at least one favourite or a Letterboxd CSV.");
  return { favourites, city: input.city.trim(), ...(csv ? { letterboxdCsv: csv } : {}) };
}

const prefixes: Record<string, FavouriteKind> = {
  movie: "movie", film: "movie", artist: "artist", music: "artist", book: "book", dish: "dish", food: "dish",
};

export function parseFavourite(input: string): Favourite {
  const match = /^(movie|film|artist|music|book|dish|food)\s*:\s*(.+)$/i.exec(input);
  return { input, query: match ? match[2].trim() : input.trim(), kind: match ? prefixes[match[1].toLowerCase()] : "any" };
}

export function collectFavourites(input: PlanInput): { favourites: Favourite[]; warnings: string[] } {
  const all = input.favourites.map(parseFavourite);
  if (input.letterboxdCsv) {
    for (const film of parseLetterboxdCsv(input.letterboxdCsv)) {
      all.push({ input: `movie: ${film.name}${film.year ? ` (${film.year})` : ""}`, query: film.name, kind: "movie", year: film.year });
    }
  }
  const seen = new Set<string>();
  const unique = all.filter((favourite) => {
    const key = `${favourite.kind}:${favourite.query.toLowerCase()}:${favourite.year ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    favourites: unique.slice(0, MAX_FAVOURITES),
    warnings: unique.length > MAX_FAVOURITES
      ? ["We used your first 20 unique favourites, taking typed entries first and then your highest-rated CSV films."]
      : [],
  };
}
