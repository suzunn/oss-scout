#!/usr/bin/env node

import {
  buildPlan,
  createGitHubClient,
  parseArgs,
  renderJson,
  renderMarkdown,
  scout,
} from "./oss-scout.js";

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const client = createGitHubClient({
    token: process.env.GITHUB_TOKEN,
    userAgent: "oss-scout/0.1.0",
  });

  const result = await scout(client, buildPlan(options));
  const output = options.format === "json" ? renderJson(result) : renderMarkdown(result);
  process.stdout.write(`${output}\n`);
}

function helpText() {
  return `oss-scout

Find contribution-ready issues in popular GitHub repositories.

Usage:
  oss-scout [options]

Options:
  --language <name>       Filter repositories by language, for example javascript
  --min-stars <number>    Minimum repository stars (default: 5000)
  --repos <number>        Number of repositories to inspect (default: 10)
  --issues <number>       Issues to list per repository (default: 3)
  --labels <list>         Comma-separated labels (default: good first issue,help wanted)
  --pushed-after <date>   Only include repos pushed after YYYY-MM-DD
  --format <name>         markdown or json (default: markdown)
  --help                  Show this help

Examples:
  oss-scout --language typescript --min-stars 10000
  oss-scout --labels "good first issue,bug" --format json

Tip:
  Set GITHUB_TOKEN to increase GitHub API rate limits.
`;
}

main().catch((error) => {
  process.stderr.write(`oss-scout: ${error.message}\n`);
  process.exitCode = 1;
});
