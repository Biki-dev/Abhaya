-- Add a role to each emergency contact while preserving existing contacts.
ALTER TABLE "EmergencyContact"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'family_member';
