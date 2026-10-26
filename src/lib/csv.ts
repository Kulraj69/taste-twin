import { InputError } from "./errors";

export const MAX_CSV_BYTES = 200 * 1024;

export interface LetterboxdFilm {
  name: string;
  year?: number;
  rating?: number;
}

// Small RFC 4180 reader: quoted commas, escaped quotes, CRLF and multiline titles.
// Fields are treated only as text. Nothing is evaluated or fetched from the CSV.
function rowsFromCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const text = csv.replace(/^\uFEFF/, "");

  const endField = () => {
    row.push(field.trim());
    field = "";
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else field += char;
    } else if (char === ",") endField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (char === '"' && !field && !afterQuote) quoted = true;
    else if (char === '"' || (afterQuote && char.trim())) {
      throw new InputError("This CSV has a broken quoted field. Try a fresh Letterboxd export.");
    } else if (!afterQuote) field += char;
  }
  if (quoted) throw new InputError("This CSV has an unclosed quote. Try a fresh Letterboxd export.");
  endRow();
  return rows;
}

export function parseLetterboxdCsv(csv: string): LetterboxdFilm[] {
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
    throw new InputError("That CSV is a little big. Please keep it under 200 KB.", 413);
  }
  const [header, ...rows] = rowsFromCsv(csv);
  const columns = header?.map((cell) => cell.toLowerCase());
  if (!columns || !["date", "name", "year", "letterboxd uri"].every((name) => columns.includes(name))) {
    throw new InputError("Use a Letterboxd CSV with Date, Name, Year and Letterboxd URI columns.");
  }
  const films: LetterboxdFilm[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new InputError("One CSV row has the wrong number of columns. Try a fresh export.");
    }
    const name = row[columns.indexOf("name")];
    if (!name) continue;
    if (name.length > 200) throw new InputError("Film titles must be 200 characters or fewer.");
    const yearText = row[columns.indexOf("year")];
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : undefined;
    const ratingText = row[columns.indexOf("rating")];
    const rating = ratingText?.trim() ? Number(ratingText) : NaN;
    const key = `${name.toLowerCase()}:${year ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    films.push({
      name,
      ...(year ? { year } : {}),
      ...(Number.isFinite(rating) && rating >= 0 && rating <= 5 ? { rating } : {}),
    });
  }
  if (!films.length) throw new InputError("This export has no films yet. Add a favourite or try another CSV.");
  // Highest rated first, preserving export order for ties or an unrated watchlist.
  return films.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
}
