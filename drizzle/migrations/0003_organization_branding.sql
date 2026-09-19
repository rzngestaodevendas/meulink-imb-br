ALTER TABLE organizations ADD COLUMN logoUrl TEXT;
ALTER TABLE organizations ADD COLUMN contactName TEXT;
ALTER TABLE organizations ADD COLUMN contactPhone TEXT;
ALTER TABLE organizations ADD COLUMN tableType TEXT NOT NULL DEFAULT 'third_party';
ALTER TABLE organizations ADD COLUMN developmentName TEXT;
ALTER TABLE organizations ADD COLUMN developmentDescription TEXT;
