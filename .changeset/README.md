# Changesets

This directory is managed by the [changesets](https://github.com/changesets/changesets) CLI.

Use the following commands to record changes and manage releases:

## Creating a Change

To record a new change, run the following command:

```bash
npm run changeset
```

This command will ask for the type of change (major, minor, patch) and a description of the change.

## Updating Versions

To update versions based on recorded changes, run the following command:

```bash
npm run version
```

## Releasing

To publish a new version to npm, run the following command:

```bash
npm run release
```

This command will first build the project and then use changeset to publish to npm. 