CREATE TABLE `organizationInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('company_admin','broker') NOT NULL DEFAULT 'broker',
	`token` varchar(80) NOT NULL,
	`invitedBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizationInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizationInvites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `organization_invite_organization_idx` ON `organizationInvites` (`organizationId`);--> statement-breakpoint
CREATE INDEX `organization_invite_email_idx` ON `organizationInvites` (`email`);