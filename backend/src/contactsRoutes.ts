import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';

export const contactsRouter = Router();

// ── Schema ────────────────────────────────────────────────────────────────────
const contactSchema = z.object({
  name:  z.string().min(1).max(100),
  phone: z.string().min(7).max(20),
});

const bulkSyncSchema = z.object({
  contacts: z.array(contactSchema),
});

// ── Helper: resolve user by phone ─────────────────────────────────────────────
async function resolveUser(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

// ── GET /api/contacts/:phone  → fetch all contacts for a user ─────────────────
contactsRouter.get('/api/contacts/:phone', async (req, res) => {
  const user = await resolveUser(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const contacts = await prisma.emergencyContact.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select:  { id: true, name: true, phone: true, createdAt: true, updatedAt: true },
  });

  return res.json(contacts);
});

// ── POST /api/contacts/:phone/sync
// Full replace — send the complete list from the app, backend overwrites.
// This is the simplest offline-first strategy: last-write-wins for the whole set.
contactsRouter.post('/api/contacts/:phone/sync', async (req, res) => {
  const parsed = bulkSyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await resolveUser(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Delete all existing → insert new list (atomic-ish via transaction)
  const contacts = await prisma.$transaction(async (tx) => {
    await tx.emergencyContact.deleteMany({ where: { userId: user.id } });
    const created = await Promise.all(
      parsed.data.contacts.map((c) =>
        tx.emergencyContact.create({
          data:   { userId: user.id, name: c.name, phone: c.phone },
          select: { id: true, name: true, phone: true, createdAt: true, updatedAt: true },
        })
      )
    );
    return created;
  });

  return res.json({ contacts });
});

// ── POST /api/contacts/:phone  → add a single contact ─────────────────────────
contactsRouter.post('/api/contacts/:phone', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await resolveUser(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const contact = await prisma.emergencyContact.create({
    data:   { userId: user.id, name: parsed.data.name, phone: parsed.data.phone },
    select: { id: true, name: true, phone: true, createdAt: true, updatedAt: true },
  });

  return res.status(201).json(contact);
});

// ── DELETE /api/contacts/:phone/:contactId  → remove one contact ──────────────
contactsRouter.delete('/api/contacts/:phone/:contactId', async (req, res) => {
  const user = await resolveUser(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const contactId = Number(req.params.contactId);
  if (Number.isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

  // Verify ownership before delete
  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, userId: user.id },
  });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  await prisma.emergencyContact.delete({ where: { id: contactId } });

  return res.json({ deleted: true });
});

// ── PATCH /api/contacts/:phone/:contactId  → update one contact ───────────────
contactsRouter.patch('/api/contacts/:phone/:contactId', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await resolveUser(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const contactId = Number(req.params.contactId);
  if (Number.isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, userId: user.id },
  });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const updated = await prisma.emergencyContact.update({
    where:  { id: contactId },
    data:   { name: parsed.data.name, phone: parsed.data.phone },
    select: { id: true, name: true, phone: true, createdAt: true, updatedAt: true },
  });

  return res.json(updated);
});