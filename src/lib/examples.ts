import { MOCK_EXAMPLES } from "@/mock/qloo";
import type { Mode } from "./types";

// Real titles here are user-input suggestions only, never mock provider data.
const LIVE_FAVOURITES = [
  ["movie: Amélie", "artist: Norah Jones", "book: The Little Prince", "dish: ratatouille"],
  ["movie: The Darjeeling Limited", "artist: Khruangbin", "book: On the Road", "dish: ramen"],
  ["movie: Spirited Away", "artist: Nujabes", "book: Kafka on the Shore", "dish: udon"],
];

export function examplesForMode(mode: Mode) {
  return MOCK_EXAMPLES.map((example, index) => ({ ...example, favourites: mode === "mock" ? example.favourites : LIVE_FAVOURITES[index] }));
}
