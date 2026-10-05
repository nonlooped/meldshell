-- When a device was renamed on the devices page, so signing in again from it keeps that name
-- instead of its hostname.
alter table "device" add column "renamedAt" integer;
