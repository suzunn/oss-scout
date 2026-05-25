# OSS Scout

OSS Scout is a Node.js CLI for finding contribution-ready issues in popular open source repositories.

It searches GitHub for active repositories above a star threshold, then checks each repository for open issues with labels such as `good first issue` and `help wanted`.

## Features

- Search repositories by star count, language, and recent activity.
- Find open issues by contribution-friendly labels.
- Render reports as Markdown or JSON.
- Run without third-party runtime dependencies.

## Requirements

- Node.js 18 or newer
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits

## Installation

```bash
npm install
```

## Usage

```bash
npm start -- --language typescript --min-stars 10000
```

```bash
npm start -- --labels "good first issue,bug" --repos 20 --issues 5
```

JSON output:

```bash
npm start -- --format json
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--language` | none | Filter repositories by language. |
| `--min-stars` | `5000` | Minimum repository star count. |
| `--repos` | `10` | Number of repositories to inspect. |
| `--issues` | `3` | Issues to list per repository. |
| `--labels` | `good first issue,help wanted` | Comma-separated issue labels. |
| `--pushed-after` | one year ago | Only include recently active repositories. |
| `--format` | `markdown` | Output as `markdown` or `json`. |

## Example Output

```markdown
# OSS Scout Report

Repository query: `stars:>=5000 archived:false pushed:>=2025-05-25 language:javascript`
Issue labels: `good first issue`, `help wanted`

## facebook/react

- [#17355 "Should not already be working" in Firefox after a breakpoint/alert](https://github.com/facebook/react/issues/17355)
```

## License

MIT
