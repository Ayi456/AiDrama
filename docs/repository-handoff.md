# Repository Handoff Notes

This project was imported from another repository. Use this checklist before publishing, sharing, or deploying a cleaned fork.

## Current Remotes

Current configured remotes observed during cleanup:

```text
cnb     https://cnb.cool/zha-ji/AiDrama
origin  https://github.com/Ayi456/AiDrama.git
```

Decide whether this working tree should continue pushing to those upstream remotes. For a maintained fork, replace `origin` with the new repository URL and keep the upstream URL under a separate name such as `upstream`.

Example:

```bash
git remote rename origin upstream
git remote add origin <your-repository-url>
```

## License Status

No local `LICENSE`, `COPYING`, or `NOTICE` file is currently present.

Before public redistribution or commercial use:

- Check the upstream repository license and attribution requirements.
- Add the correct license file to this repository.
- Update `README.md` to match the actual license instead of relying on a badge or old upstream wording.
- If the upstream license is not compatible with the intended use, do not publish or commercialize this code without permission.

## Secrets Status

The root `.env` file is ignored by Git and must remain local.

Before production use:

- Rotate any database, COS, AI provider, or deployment credentials copied from the imported repository.
- Keep real values only in `.env`, cloud environment variables, or a secrets manager.
- Commit only `.env.example` with placeholders.
- Re-run a tracked-file scan before committing.

Useful checks:

```bash
git ls-files | rg "(^|/)(\\.env|config\\.yaml|.*\\.pem|.*\\.key|.*\\.crt|deploy/scf|data/)"
rg -n "AKID|SECRET|PASSWORD|DATABASE_URL|mysql://|api[_-]?key|token|Bearer|TENCENT_SECRET|DB_PASSWORD" --glob '!node_modules/**' --glob '!backend/dist/**' --glob '!frontend/dist-vite/**' --glob '!deploy/scf/**' --glob '!.env' --glob '!package-lock.json'
```

Expected result:

- `git ls-files` may include `data/.gitkeep`.
- It must not include `.env`, `configs/config.yaml`, private keys, generated deployment bundles, or real credentials.
- Secret scans should only show placeholder/example values.

## Source Versus Generated Files

Track:

- `README.md`, `CLAUDE.md`, and docs under `docs/`.
- Source deployment templates such as `serverless.yml` and `deploy/scf_bootstrap.template`.
- Source scripts under `scripts/` and `backend/src/scripts/`.

Ignore:

- `.env` and local config files.
- `data/*` except `data/.gitkeep`.
- `backend/dist/`, `frontend/dist-vite/`, and other build outputs.
- `deploy/scf/` and `deploy/*.zip`.

## Next Cleanup Batch

The first frontend type cleanup and Chapter Studio page-boundary cleanup have been
completed. The remaining handoff-critical work is owner controlled:

- Confirm and add the correct license before public redistribution.
- Replace or rename upstream remotes if this repository should stand on its own.
- Rotate any credentials copied from imported or local development history.
- Continue the slower identity pass across UI appearance, product language,
  component names, API naming, and public docs after ownership is settled.
