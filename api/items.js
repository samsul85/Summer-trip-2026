// Serverless API for simple named lists — wish list, to-do list, packing checklist.
// Runs on Vercel. Reading is public; writing requires the family passcode.
//
// GET    /api/items                 → all items, grouped by list
// GET    /api/items?list=wishlist   → items for one list
// POST   /api/items                 → add    { list, text }            (x-edit-pass)
// PATCH  /api/items                 → update { id, done? , text? }      (x-edit-pass)
// DELETE /api/items?id=123          → remove                            (x-edit-pass)
//
// Storage: Vercel Postgres (POSTGRES_URL). Auth: EDIT_PASSCODE env var.

import { sql } from '@vercel/postgres';

const MAX_LEN = 200;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS list_items (
        id         SERIAL PRIMARY KEY,
        list       TEXT NOT NULL,
        text       TEXT NOT NULL,
        done       BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`;

    if (req.method === 'GET') {
      const list = (req.query.list || '').trim();
      if (list) {
        const { rows } = await sql`
          SELECT id, list, text, done FROM list_items
          WHERE list = ${list}
          ORDER BY id ASC`;
        return res.status(200).json({ items: rows });
      }
      const { rows } = await sql`
        SELECT id, list, text, done FROM list_items
        ORDER BY list ASC, id ASC`;
      const grouped = {};
      rows.forEach(function (r) { (grouped[r.list] = grouped[r.list] || []).push(r); });
      return res.status(200).json({ lists: grouped, items: rows });
    }

    // --- writes require the edit passcode ---
    const provided = req.headers['x-edit-pass'] || (req.body && req.body.pass) || '';
    const expected = process.env.EDIT_PASSCODE;
    if (!expected) return res.status(500).json({ error: 'EDIT_PASSCODE is not configured on the server.' });
    if (provided !== expected) return res.status(401).json({ error: 'Wrong passcode.' });

    if (req.method === 'POST') {
      const body = req.body || {};
      const list = (body.list || '').trim();
      const text = (body.text || '').trim();
      if (!list) return res.status(400).json({ error: 'Missing list name.' });
      if (list.length > 60) return res.status(400).json({ error: 'List name too long.' });
      if (!text) return res.status(400).json({ error: 'Item text is required.' });
      if (text.length > MAX_LEN) return res.status(400).json({ error: 'Item text is too long (max ' + MAX_LEN + ' chars).' });

      const { rows } = await sql`
        INSERT INTO list_items (list, text)
        VALUES (${list}, ${text})
        RETURNING id, list, text, done`;
      return res.status(201).json({ item: rows[0] });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const id = parseInt(body.id, 10);
      if (!id) return res.status(400).json({ error: 'Missing item id.' });

      const hasDone = typeof body.done === 'boolean';
      const hasText = typeof body.text === 'string';
      if (!hasDone && !hasText) return res.status(400).json({ error: 'Nothing to update.' });

      if (hasText) {
        const text = body.text.trim();
        if (!text) return res.status(400).json({ error: 'Item text is required.' });
        if (text.length > MAX_LEN) return res.status(400).json({ error: 'Item text is too long.' });
        await sql`UPDATE list_items SET text = ${text} WHERE id = ${id}`;
      }
      if (hasDone) {
        await sql`UPDATE list_items SET done = ${body.done} WHERE id = ${id}`;
      }
      const { rows } = await sql`SELECT id, list, text, done FROM list_items WHERE id = ${id}`;
      if (!rows.length) return res.status(404).json({ error: 'Item not found.' });
      return res.status(200).json({ item: rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id || (req.body && req.body.id), 10);
      if (!id) return res.status(400).json({ error: 'Missing item id.' });
      await sql`DELETE FROM list_items WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error.', detail: String((e && e.message) || e) });
  }
}
