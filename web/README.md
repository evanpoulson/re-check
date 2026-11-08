# Recheck web

React, Vite, TypeScript and Tailwind front end for the triage nurse and patient screens. Design: [`docs/design/frontend.md`](../docs/design/frontend.md).

## Develop

```sh
npm install
npm run dev
npm run typecheck && npm run lint && npm test && npm run build
```

## API types come from the backend

`src/api/contract.d.ts` is generated from the Pydantic models in `api/src/recheck/contract`. Do not edit it. After a backend contract change:

```sh
npm run gen:contract
```

This needs [uv](https://docs.astral.sh/uv/) and runs the backend's `contract_json_schema()`. Commit `contract.schema.json` and `contract.d.ts`. Running it again must not change them.

## Routes

Stubs until their feature branches land. They match `docs/recheck-project-plan.md`: `/staff/sign-in`, `/staff/visits/new`, `/staff/triage`, `/staff/visits/:id`, `/v/:token`, `/check-in`.

Punjabi (`pa`) and Tagalog (`tl`) strings are empty and fall back to English until translations are supplied.
