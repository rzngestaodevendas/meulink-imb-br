PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  activeOrganizationId INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSignedIn TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  publicName TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizationMembers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizationId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'broker' CHECK (role IN ('company_admin', 'broker')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizationId) REFERENCES organizations(id),
  FOREIGN KEY (userId) REFERENCES users(id),
  UNIQUE (organizationId, userId)
);
CREATE INDEX IF NOT EXISTS organization_member_user_idx ON organizationMembers(userId);

CREATE TABLE IF NOT EXISTS organizationInvites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizationId INTEGER NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'broker' CHECK (role IN ('company_admin', 'broker')),
  token TEXT NOT NULL UNIQUE,
  invitedBy INTEGER NOT NULL,
  expiresAt TEXT NOT NULL,
  acceptedAt TEXT,
  revokedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizationId) REFERENCES organizations(id),
  FOREIGN KEY (invitedBy) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS organization_invite_organization_idx ON organizationInvites(organizationId);
CREATE INDEX IF NOT EXISTS organization_invite_email_idx ON organizationInvites(email);

CREATE TABLE IF NOT EXISTS auditLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizationId INTEGER NOT NULL,
  actorUserId INTEGER NOT NULL,
  action TEXT NOT NULL,
  entityType TEXT NOT NULL,
  entityId INTEGER,
  metadata TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizationId) REFERENCES organizations(id),
  FOREIGN KEY (actorUserId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS audit_log_organization_idx ON auditLogs(organizationId);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON auditLogs(createdAt);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizationId INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  address TEXT,
  responsibleName TEXT,
  responsiblePhone TEXT,
  details TEXT NOT NULL,
  price TEXT,
  notes TEXT,
  photos TEXT NOT NULL,
  sourceDriveUrl TEXT,
  sourcePage INTEGER,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'unavailable', 'updating', 'hidden')),
  publicEnabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organizationId) REFERENCES organizations(id),
  UNIQUE (organizationId, slug)
);
CREATE INDEX IF NOT EXISTS property_organization_idx ON properties(organizationId);

CREATE TABLE IF NOT EXISTS shareLinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizationId INTEGER NOT NULL,
  propertyId INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  brokerName TEXT NOT NULL,
  brokerPhone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  clickCount INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabledAt TEXT,
  FOREIGN KEY (organizationId) REFERENCES organizations(id),
  FOREIGN KEY (propertyId) REFERENCES properties(id),
  FOREIGN KEY (createdBy) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS share_link_organization_idx ON shareLinks(organizationId);
CREATE INDEX IF NOT EXISTS share_link_property_idx ON shareLinks(propertyId);
