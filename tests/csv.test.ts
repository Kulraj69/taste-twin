import { describe, expect, it } from "vitest";
import { MAX_CSV_BYTES, parseLetterboxdCsv } from "@/lib/csv";
import { collectFavourites, parseFavourite, validatePlanInput } from "@/lib/input";

const header = "Date,Name,Year,Letterboxd URI";

describe("Letterboxd CSV", () => {
  it("reads a watchlist without ratings", () => {
    expect(parseLetterboxdCsv(`${header}\n2026-01-01,The Amber Elevator,2021,https://example.invalid/film`)).toEqual([{ name: "The Amber Elevator", year: 2021 }]);
  });
  it("reads BOM, CRLF, quoted commas and doubled quotes", () => {
    const csv = `\uFEFF${header}\r\n2026-01-01,"Letters, Lanterns & ""Almosts""",2020,unused\r\n`;
    expect(parseLetterboxdCsv(csv)[0].name).toBe('Letters, Lanterns & "Almosts"');
  });
  it("preserves newlines inside quoted titles", () => {
    expect(parseLetterboxdCsv(`${header}\n2026,"North\nSouth",2022,x`)[0].name).toBe("North\nSouth");
  });
  it("sorts highest ratings first, including a valid zero", () => {
    const films = parseLetterboxdCsv(`${header},Rating\n2026,The First Thimble,2020,x,0\n2026,A Violet Morning,2021,y,4.5\n2026,Blank Moon,2021,z,`);
    expect(films.map((film) => film.rating)).toEqual([4.5, 0, undefined]);
  });
  it("deduplicates films while keeping different release years", () => {
    expect(parseLetterboxdCsv(`${header}\n2026,Quiet Tuesday,2000,x\n2026,Quiet Tuesday,2000,x\n2026,Quiet Tuesday,2020,x`)).toHaveLength(2);
  });
  it("validates required headers", () => {
    expect(() => parseLetterboxdCsv("name,year\nQuiet Tuesday,2020")).toThrow("Letterboxd");
  });
  it("rejects an unclosed quote", () => {
    expect(() => parseLetterboxdCsv(`${header}\n2026,"Quiet Tuesday,2020,x`)).toThrow("unclosed quote");
  });
  it("rejects data after a closing quote", () => {
    expect(() => parseLetterboxdCsv(`${header}\n2026,"Quiet"Tuesday,2020,x`)).toThrow("broken quoted field");
  });
  it("rejects malformed row lengths and empty exports", () => {
    expect(() => parseLetterboxdCsv(`${header}\n2026,Quiet Tuesday,2020`)).toThrow("columns");
    expect(() => parseLetterboxdCsv(`${header}\n`)).toThrow("no films");
  });
  it("caps actual UTF-8 bytes, not character count", () => {
    expect(() => parseLetterboxdCsv("é".repeat(MAX_CSV_BYTES / 2 + 1))).toThrow("200 KB");
  });
});

describe("plan inputs", () => {
  it("supports case-insensitive typed prefixes and untyped titles", () => {
    expect(parseFavourite("Movie: Quiet Tuesday")).toMatchObject({ kind: "movie", query: "Quiet Tuesday" });
    expect(parseFavourite("dish: noodles")).toMatchObject({ kind: "dish", query: "noodles" });
    expect(parseFavourite("Quiet Tuesday").kind).toBe("any");
  });
  it("caps favourites and rejects invalid field types", () => {
    expect(() => validatePlanInput({ favourites: Array(21).fill("film"), city: "Lisbon" })).toThrow("20");
    expect(() => validatePlanInput({ favourites: [2], city: "Lisbon" })).toThrow("list");
    expect(() => validatePlanInput({ favourites: ["film"], city: "" })).toThrow("city");
    expect(() => validatePlanInput({ favourites: [], city: "Lisbon" })).toThrow("at least one");
  });
  it("accepts CSV-only plans and trims input", () => {
    expect(validatePlanInput({ favourites: [], city: " Lisbon ", letterboxdCsv: "a" }).city).toBe("Lisbon");
    expect(validatePlanInput({ favourites: ["  film  "], city: "Lisbon" }).favourites).toEqual(["film"]);
  });
  it("keeps typed entries first and caps the combined CSV seed budget", () => {
    const csv = `${header},Rating\n${Array.from({ length: 25 }, (_, i) => `2026,Imaginary Film ${i},2020,x,${i === 24 ? 5 : 1}`).join("\n")}`;
    const result = collectFavourites({ favourites: ["artist: Velvet Satellites"], city: "Lisbon", letterboxdCsv: csv });
    expect(result.favourites).toHaveLength(20);
    expect(result.favourites[0].kind).toBe("artist");
    expect(result.favourites[1].query).toBe("Imaginary Film 24");
    expect(result.warnings).toHaveLength(1);
  });
});
