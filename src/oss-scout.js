const DEFAULT_LABELS = ["good first issue", "help wanted"];

export function parseArgs(args) {
  const options = {
    format: "markdown",
    help: false,
    issuesPerRepo: 3,
    labels: DEFAULT_LABELS,
    minStars: 5000,
    pushedAfter: oneYearAgo(),
    repoLimit: 10,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} expects a value`);
      }
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--language") {
      options.language = next();
    } else if (arg === "--min-stars") {
      options.minStars = positiveInteger(next(), arg);
    } else if (arg === "--repos") {
      options.repoLimit = positiveInteger(next(), arg);
    } else if (arg === "--issues") {
      options.issuesPerRepo = positiveInteger(next(), arg);
    } else if (arg === "--labels") {
      options.labels = next()
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      if (options.labels.length === 0) {
        throw new Error("--labels expects at least one label");
      }
    } else if (arg === "--pushed-after") {
      options.pushedAfter = isoDate(next(), arg);
    } else if (arg === "--format") {
      options.format = next().toLowerCase();
      if (!["json", "markdown"].includes(options.format)) {
        throw new Error("--format must be markdown or json");
      }
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

export function buildPlan(options) {
  return {
    issueLimit: options.issuesPerRepo,
    labels: options.labels,
    repoLimit: options.repoLimit,
    repositoryQuery: buildRepositoryQuery(options),
  };
}

export function buildRepositoryQuery(options) {
  const parts = [
    `stars:>=${options.minStars}`,
    "archived:false",
    `pushed:>=${options.pushedAfter}`,
  ];

  if (options.language) {
    parts.push(`language:${quoteIfNeeded(options.language)}`);
  }

  return parts.join(" ");
}

export function buildIssueQuery(repo, label) {
  return `repo:${repo.fullName} state:open is:issue label:${quoteIfNeeded(label)}`;
}

export function createGitHubClient({ token, userAgent } = {}) {
  return {
    async searchRepositories(query, limit) {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "stars");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(Math.min(limit, 100)));

      const payload = await requestJson(url, { token, userAgent });
      return payload.items.map((repo) => ({
        description: repo.description,
        fullName: repo.full_name,
        language: repo.language,
        pushedAt: repo.pushed_at,
        stars: repo.stargazers_count,
        url: repo.html_url,
      }));
    },

    async searchIssues(query, limit) {
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "updated");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(Math.min(limit, 100)));

      const payload = await requestJson(url, { token, userAgent });
      return payload.items.map((issue) => ({
        labels: issue.labels.map((label) => label.name),
        number: issue.number,
        title: issue.title,
        updatedAt: issue.updated_at,
        url: issue.html_url,
      }));
    },
  };
}

export async function scout(client, plan) {
  const repositories = await client.searchRepositories(plan.repositoryQuery, plan.repoLimit);
  const results = [];

  for (const repo of repositories) {
    const issuesByUrl = new Map();

    for (const label of plan.labels) {
      const issueQuery = buildIssueQuery(repo, label);
      const issues = await client.searchIssues(issueQuery, plan.issueLimit);
      for (const issue of issues) {
        issuesByUrl.set(issue.url, issue);
      }
    }

    const issues = [...issuesByUrl.values()]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, plan.issueLimit);

    if (issues.length > 0) {
      results.push({ issues, repo });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    plan,
    results,
  };
}

export function renderMarkdown(result) {
  const lines = [
    "# OSS Scout Report",
    "",
    `Generated: ${result.generatedAt}`,
    `Repository query: \`${result.plan.repositoryQuery}\``,
    `Issue labels: ${result.plan.labels.map((label) => `\`${label}\``).join(", ")}`,
    "",
  ];

  if (result.results.length === 0) {
    lines.push("No matching contribution-ready issues were found.");
    return lines.join("\n");
  }

  for (const { repo, issues } of result.results) {
    lines.push(`## ${repo.fullName}`);
    lines.push("");
    lines.push(`Stars: ${repo.stars.toLocaleString("en-US")} | Language: ${repo.language ?? "unknown"} | Updated: ${repo.pushedAt.slice(0, 10)}`);
    if (repo.description) {
      lines.push(repo.description);
    }
    lines.push("");
    for (const issue of issues) {
      lines.push(`- [#${issue.number} ${issue.title}](${issue.url})`);
      lines.push(`  Labels: ${issue.labels.join(", ") || "none"} | Updated: ${issue.updatedAt.slice(0, 10)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

async function requestJson(url, { token, userAgent }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": userAgent ?? "oss-scout",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url.pathname}: ${body.slice(0, 240)}`);
  }

  return response.json();
}

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function isoDate(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${flag} must be YYYY-MM-DD`);
  }
  return value;
}

function quoteIfNeeded(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function oneYearAgo() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}
