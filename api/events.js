// Serverless API for family trip events — runs on Vercel.
// GET    /api/events            → list all events (public, read-only)
// POST   /api/events            → add an event   (requires x-edit-pass header)
// DELETE /api/events?id=123     → remove an event (requires x-edit-pass header)
//
// Storage: Vercel Postgres (connect a Postgres store in the Vercel dashboard —
// it injects the POSTGRES_URL env var automatically).
// Auth: set an EDIT_PASSCODE environment variable in Vercel. Anyone with the
// passcode can edit; reading is open to everyone (the page is public).

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  // Basic CORS/no-cache so the family always sees fresh data.
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Create the table on first use — safe to run every time.
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id         SERIAL PRIMARY KEY,
        day        DATE NOT NULL,
        title      TEXT NOT NULL,
        time       TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )`;
    // Optional end date for multi-day events (added after initial launch).
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_day DATE`;
    // Optional free-text notes per event.
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS notes TEXT`;

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, to_char(day, 'YYYY-MM-DD') AS day,
               to_char(end_day, 'YYYY-MM-DD') AS end, title, time, notes
        FROM events
        ORDER BY day ASC, time ASC NULLS FIRST, id ASC`;
      return res.status(200).json({ events: rows });
    }

    // --- everything below requires the edit passcode ---
    const provided = req.headers['x-edit-pass'] || (req.body && req.body.pass) || '';
    const expected = process.env.EDIT_PASSCODE;
    if (!expected) {
      return res.status(500).json({ error: 'EDIT_PASSCODE is not configured on the server.' });
    }
    if (provided !== expected) {
      return res.status(401).json({ error: 'Wrong passcode.' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const day = (body.day || '').trim();
      const title = (body.title || '').trim();
      const time = (body.time || '').trim() || null;
      const notes = (body.notes || '').trim() || null;
      let end = (body.end || '').trim() || null;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return res.status(400).json({ error: 'Invalid or missing date.' });
      }
      if (end !== null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          return res.status(400).json({ error: 'Invalid end date.' });
        }
        if (end < day) return res.status(400).json({ error: 'End date must be on or after the start date.' });
        if (end === day) end = null; // single-day: no need to store an end
      }
      if (!title) return res.status(400).json({ error: 'Event text is required.' });
      if (title.length > 200) return res.status(400).json({ error: 'Event text is too long (max 200 chars).' });
      if (time && time.length > 40) return res.status(400).json({ error: 'Time is too long.' });
      if (notes && notes.length > 1000) return res.status(400).json({ error: 'Notes are too long (max 1000 chars).' });

      const { rows } = await sql`
        INSERT INTO events (day, end_day, title, time, notes)
        VALUES (${day}, ${end}, ${title}, ${time}, ${notes})
        RETURNING id, to_char(day, 'YYYY-MM-DD') AS day,
                  to_char(end_day, 'YYYY-MM-DD') AS end, title, time, notes`;
      return res.status(201).json({ event: rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id || (req.body && req.body.id), 10);
      if (!id) return res.status(400).json({ error: 'Missing event id.' });
      await sql`DELETE FROM events WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error.', detail: String((e && e.message) || e) });
  }
}
