# Landing application boundary

`apps/landing` is the separately built static public landing surface. It sources configurable presentation data from `config/product.json`, uses tested/generated snippets, and avoids unsupported claims, fake metrics, testimonials, logos, or endorsements. It does not import local operations internals.

Run it from the workspace root with `pnpm dev:landing`. Its own build and test commands are defined in this application's package manifest.
