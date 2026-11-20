# AGENTS.md

On-the-fly image resizing for t-online. An AWS Lambda (Node 24, TypeScript, [sharp](https://sharp.pixelplumbing.com/)) 
behind CloudFront that reads originals from S3 and serves Thumbor-style URLs. 
Forked from `aws-solutions/serverless-image-handler` and heavily changed. 
See `README.md` for the Ströer-specific behaviour and `docs/Usage.md` for the URL syntax.

## Layout

- `source/image-handler/`: the only package. All npm commands run here.
  - `src/index.ts`: Lambda `handler` (API Gateway v2 / Function URL event), response headers, caching, `Expires` → 410, error responses.
  - `src/image-request.ts`: `ImageRequest` parses the event into request info (key, edits, output format, quality) and fetches the original from S3.
  - `src/thumbor-mapper.ts`: `ThumborMapper` turns Thumbor paths and `filters:` into sharp edits.
  - `src/image-handler.ts`: `ImageHandler.process()` applies the edits with sharp (crop, resize, round crop, animation frame limits, output encoding).
  - `src/lib/`: enums, interfaces, types, thumbhash, `LogstashFormatter`.
  - `test/`: Jest specs, grouped by source file (`image-request/`, `image-handler/`, `thumbor-mapper/`, `lib/`). Fixtures are in `test/image/`.
  - `terraform/`: Lambda, S3, IAM and cross-account infra.
- `docs/`: usage docs.

## Request flow

`handler` (`src/index.ts`) → `ImageRequest.setup()` parses the URL and loads the original from S3 → `ThumborMapper` turns the path into an edits object → `ImageHandler.process()` / `applyEdits()` runs sharp → the response body is base64 (`isBase64Encoded: true`).

## Adding a filter

1. Add a `case` in `ThumborMapper.mapFilter()` (`src/thumbor-mapper.ts`) that sets an edit key.
2. If the key has the same name as a sharp method (`negate`, `grayscale`, `rotate`, …), `applyEdits()` calls `image[key](value)` through its `default` branch. Nothing to change in `image-handler.ts`. Otherwise add a `case` in `applyEdits()`.
3. Add specs in `test/thumbor-mapper/filter.spec.ts` and `test/image-handler/<filter>.spec.ts`.

## Commands

```shell
cd source/image-handler
npm test              # jest --coverage (runs `npm i` first)
npx jest test/thumbor-mapper/crop.spec.ts   # single spec
npm run format        # prettier on src/ and test/
```

From the repo root:

```shell
make npm/test   # tests
make build      # test + tsup bundle + linux-x64 sharp + zip, in Docker when not on linux/x86_64
make tf         # terraform plan (MODE=apply to apply). Needs AWS creds
```

CI (`.github/workflows/deploy.yml`) runs `make build` on every PR and push to `main`. On `main` it also runs `make deploy`, which uploads the zip to S3 and starts the CodePipeline deploy. Merging to main means deploying to production.

## Conventions

- Prettier: single quotes, trailing commas, `arrowParens: avoid`, width 120. Indent is 2 spaces.
- `tsconfig` has `strict: false`, so don't refactor for strictness unless asked.
- Every behaviour change needs a spec next to the matching existing specs. Pick the layer:
  - Mapper: plain path string in, edits object out (`test/thumbor-mapper/`).
  - `ImageHandler`: real sharp on images from `test/image/`. `test/image-handler/negate.spec.ts` is the template.
  - Full handler: `build_event()` from `test/helpers.ts`, S3 mocked with `aws-sdk-client-mock`, stream helpers from `test/mock.ts`.
- Errors: throw `ImageHandlerError(status, code, message)` from `src/lib/types.ts`.
- Config comes from env vars (`SOURCE_BUCKETS`, `AUTO_WEBP`, `CORS_*`, `UNBOUNDED_FIT_IN_MAX_DIMENSION`, `MAX_ANIMATED_*`). Document new ones in the README table.
- Commits follow conventional style: `feat:`, `fix:`, `chore:`, `chore(deps):`.

## Gotchas

- **The sharp version is pinned in two places**: `package.json` and the `sharp@x.y.z` install in `Makefile`. Bump both together.
- `@aws-sdk/client-s3` is external in `tsup.config.ts` because the Lambda runtime provides it. `color` and `color-name` are bundled through `noExternal`.
- Lambda responses are capped at 6 MB. Output size limits (unbounded `fit-in`, animated frame caps) exist for this reason, so keep them in place.
- The S3 key's file name is ignored and every image is stored as `image.<ext>`. Crop syntax is `crop=left,top,width,height`, not Thumbor's `right,bottom`.
- Error responses are cached by the CDN: 400/403/404 for 1 hour, 410/413 for 1 year, 5xx not at all. 4xx are logged only at debug level. A 4xx returned by mistake stays cached, so use 5xx for server-side failures.
- Unknown filters are silently ignored (`mapFilter` has no `default`). A typo in a filter name produces no error.
- Edits are applied in the key order of the edits object, i.e. the order the mapper inserted them. Resize always runs first.
- Features removed from upstream (smart crop, moderation, watermark, URL signing, dynamic buckets) are not coming back unless explicitly requested.
- Terraform files are excluded from the CI workflow. Infra changes go through `make tf` and pre-commit hooks (`terraform_fmt`, `tflint`, `trivy`).
