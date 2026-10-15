
const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const movies = [];
let nextId = 1;
const genres = ["Action", "Comedy", "Drama", "Thriller", "SciFi"];
const fields = ["title", "director", "genre", "rating", "durationMinutes", "nowShowing"];

function validate(m, partial = false) {
  if (!m || typeof m !== "object" || Array.isArray(m))
    return "Request body must be a JSON object";
  const keys = fields.filter(k => Object.hasOwn(m, k));
  if (partial && !keys.length) return "At least one valid field is required";
  if (!partial && fields.some(k => !Object.hasOwn(m, k)))
    return `${fields.find(k => !Object.hasOwn(m, k))} is required`;
  for (const k of keys) {
    const v = m[k];
    if (["title", "director"].includes(k)) {
      if (typeof v !== "string") return `${k} must be a string`;
      const s = v.trim(), min = k === "title" ? 3 : 2;
      const max = k === "title" ? 60 : 40;
      if (s.length < min || s.length > max)
        return `${k} must be ${min} to ${max} characters`;
      m[k] = s;
    }
    if (k === "genre" && !genres.includes(v)) return "Invalid genre";
    if (k === "rating" && (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 10))
      return "rating must be greater than 0 and at most 10";
    if (k === "durationMinutes" && (!Number.isInteger(v) || v < 1 || v > 600))
      return "durationMinutes must be an integer from 1 to 600";
    if (k === "nowShowing" && typeof v !== "boolean")
      return "nowShowing must be a boolean";
  }
  return null;
}

app.post("/api/movies", (req, res) => {
  const e = validate(req.body);
  if (e) return res.status(400).json({ error: e });
  const movie = { id: nextId++, ...Object.fromEntries(fields.filter(k => Object.hasOwn(req.body, k)).map(k => [k, req.body[k]])) };
  movies.push(movie);
  res.status(201).json(movie);
});

app.get("/api/movies", (req, res) => {
  const allowed = ["page", "limit", "search", "genre", "nowShowing", "minRating", "maxRating", "sort", "order"];
  if (Object.keys(req.query).some(k => !allowed.includes(k) || typeof req.query[k] !== "string" || !req.query[k]))
    return res.status(400).json({ error: "Invalid query parameter" });

  const { page = "1", limit = "10", search, genre, nowShowing, minRating, maxRating, sort, order = "asc" } = req.query;
  if (!/^[1-9]\d*$/.test(page) || !/^[1-9]\d*$/.test(limit) || +limit > 50)
    return res.status(400).json({ error: "Invalid page or limit" });
  if (genre && !genres.includes(genre)) return res.status(400).json({ error: "Invalid genre" });
  if (nowShowing !== undefined && !["true", "false"].includes(nowShowing))
    return res.status(400).json({ error: "nowShowing must be true or false" });
  for (const r of [minRating, maxRating])
    if (r !== undefined && !Number.isFinite(Number(r)))
      return res.status(400).json({ error: "Ratings must be numbers" });
  if (sort && !["title", "rating", "durationMinutes"].includes(sort))
    return res.status(400).json({ error: "Invalid sort field" });
  if (!["asc", "desc"].includes(order)) return res.status(400).json({ error: "Invalid order" });

  let data = movies.filter(m =>
    (!genre || m.genre === genre) &&
    (nowShowing === undefined || m.nowShowing === (nowShowing === "true")) &&
    (minRating === undefined || m.rating >= +minRating) &&
    (maxRating === undefined || m.rating <= +maxRating) &&
    (!search || m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.director.toLowerCase().includes(search.toLowerCase()))
  );
  if (minRating !== undefined && maxRating !== undefined && +minRating > +maxRating) data = [];
  if (sort) data.sort((a, b) => {
    const x = a[sort], y = b[sort];
    const c = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
    return order === "desc" ? -c : c;
  });
  const total = data.length, p = +page, l = +limit;
  res.status(200).json({ data: data.slice((p - 1) * l, p * l), page: p, limit: l, total, totalPages: total ? Math.ceil(total / l) : 0 });
});

app.get("/api/movies/:id", (req, res) => {
  const m = movies.find(x => String(x.id) === req.params.id);
  return m ? res.status(200).json(m) : res.status(404).json({ error: "Record not found" });
});

app.put("/api/movies/:id", (req, res) => {
  const i = movies.findIndex(m => String(m.id) === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Record not found" });
  const e = validate(req.body);
  if (e) return res.status(400).json({ error: e });
  movies[i] = { id: movies[i].id, ...Object.fromEntries(fields.map(k => [k, req.body[k]])) };
  res.status(200).json(movies[i]);
});

app.patch("/api/movies/:id", (req, res) => {
  const i = movies.findIndex(m => String(m.id) === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Record not found" });
  const body = Object.fromEntries(fields.filter(k => Object.hasOwn(req.body || {}, k)).map(k => [k, req.body[k]]));
  const e = validate(body, true);
  if (e) return res.status(400).json({ error: e });
  const updated = { ...movies[i], ...body, id: movies[i].id };
  const fullError = validate(updated);
  if (fullError) return res.status(400).json({ error: fullError });
  movies[i] = updated;
  res.status(200).json(updated);
});

app.delete("/api/movies/:id", (req, res) => {
  const i = movies.findIndex(m => String(m.id) === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Record not found" });
  movies.splice(i, 1);
  res.status(204).end();
});

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(400).json({ error: err instanceof SyntaxError ? "Malformed JSON" : "Invalid request" });
});
app.listen(PORT, () => console.log(`Movie Catalog API running on port ${PORT}`));
