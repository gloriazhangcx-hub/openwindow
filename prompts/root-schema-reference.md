# Move the schema reference to the repository root

## Goal

Make the existing schema guide immediately visible from the GitHub repository homepage without changing its contents.

## Workflow

- GitHub Issue: #33
- Branch: `docs/root-schema-reference`
- Base: GitHub `main` at `cbc5939545085f72c2cd1997de846673648d2521`
- Open a documentation-only PR against `main` and merge after checks pass.

## Requested changes

- Move the existing schema reference from the documentation subdirectory to root-level `schema.md`.
- Preserve its full content byte-for-byte and remove the previous copy.
- Update all repository references to use the root-level path.
- Do not modify application code, database schema, production settings, or deployment. Do not republish.
