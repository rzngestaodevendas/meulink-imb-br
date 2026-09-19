# MeuLink on Cloudflare

This directory contains the Cloudflare Worker migration branch.

## Provisioned resources

- D1 database: `meulink-db`
- R2 bucket: `meulink-fotos`
- Zone: `meulink.imb.br`

## Remaining implementation work

1. Convert the Drizzle schema from MySQL to SQLite/D1.
2. Inject the D1 binding into the tRPC context per request.
3. Replace Express cookie/response helpers with Fetch `Request`/`Response` handling.
4. Implement R2 photo upload and signed/private delivery routes.
5. Add the Worker entrypoint and static asset routing.
6. Import the existing catalog data only after the schema passes local and remote tests.

The stable application remains unchanged on `main` while this branch is being validated.
