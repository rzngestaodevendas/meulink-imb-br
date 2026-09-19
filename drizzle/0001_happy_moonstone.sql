CREATE TABLE `organizationMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('company_admin','broker') NOT NULL DEFAULT 'broker',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizationMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(180) NOT NULL,
	`publicName` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`slug` varchar(180) NOT NULL,
	`title` varchar(240) NOT NULL,
	`address` text,
	`details` text NOT NULL,
	`price` varchar(80),
	`notes` text,
	`photos` text NOT NULL,
	`sourceDriveUrl` text,
	`sourcePage` int,
	`status` enum('available','reserved','sold','unavailable','updating','hidden') NOT NULL DEFAULT 'available',
	`publicEnabled` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_property_slug_unique` UNIQUE(`organizationId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `shareLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`propertyId` int NOT NULL,
	`token` varchar(80) NOT NULL,
	`brokerName` varchar(180) NOT NULL,
	`brokerPhone` varchar(32) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`clickCount` int NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`disabledAt` timestamp,
	CONSTRAINT `shareLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `shareLinks_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `organization_member_user_idx` ON `organizationMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `property_organization_idx` ON `properties` (`organizationId`);--> statement-breakpoint
CREATE INDEX `share_link_organization_idx` ON `shareLinks` (`organizationId`);--> statement-breakpoint
CREATE INDEX `share_link_property_idx` ON `shareLinks` (`propertyId`);