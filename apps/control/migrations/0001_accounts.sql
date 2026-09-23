-- Better Auth 1.7.5 schema for the configured plugins, compiled by its migration planner.
-- The worker test fails when Better Auth expects tables or columns these migrations lack.
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create table "apikey" ("id" text not null primary key, "configId" text not null, "name" text, "start" text, "referenceId" text not null, "prefix" text, "key" text not null, "refillInterval" integer, "refillAmount" integer, "lastRefillAt" date, "enabled" integer, "rateLimitEnabled" integer, "rateLimitTimeWindow" integer, "rateLimitMax" integer, "requestCount" integer, "remaining" integer, "lastRequest" date, "expiresAt" date, "createdAt" date not null, "updatedAt" date not null, "permissions" text, "metadata" text);
create table "deviceCode" ("id" text not null primary key, "deviceCode" text not null, "userCode" text not null, "userId" text, "expiresAt" date not null, "status" text not null, "lastPolledAt" date, "pollingInterval" integer, "clientId" text, "scope" text);
create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
create index "apikey_configId_idx" on "apikey" ("configId");
create index "apikey_referenceId_idx" on "apikey" ("referenceId");
create index "apikey_key_idx" on "apikey" ("key");
create unique index "deviceCode_deviceCode_uidx" on "deviceCode" ("deviceCode");
create unique index "deviceCode_userCode_uidx" on "deviceCode" ("userCode");
-- One row per linked host. key_id names its current API key; presence is written by its relay.
create table "device" ("id" text not null primary key, "accountId" text not null references "user" ("id") on delete cascade, "name" text not null, "keyId" text not null, "online" integer not null default 0, "lastSeen" integer, "revokedAt" integer);
create index "device_accountId_idx" on "device" ("accountId");
