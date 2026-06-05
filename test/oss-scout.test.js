import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIssueQuery,
  buildPlan,
  buildRepositoryQuery,
  createGitHubClient,
  parseArgs,
  renderJson,
  renderMarkdown,
  scout,
} from "../src/oss-scout.js";

test("parseArgs keeps contribution-focused defaults", () => {
  const options = parseArgs([]);

  assert.equal(options.minStars, 5000);
  assert.equal(options.repoLimit, 10);
  assert.equal(options.issuesPerRepo, 3);
  assert.deepEqual(options.labels, ["good first issue", "help wanted"]);
  assert.match(options.pushedAfter, /^\d{4}-\d{2}-\d{2}$/);
});

test("buildRepositoryQuery includes popularity and freshness filters", () => {
  const query = buildRepositoryQuery({
    language: "typescript",
    minStars: 10000,
    pushedAfter: "2026-01-01",
  });

  assert.equal(query, "stars:>=10000 archived:false pushed:>=2026-01-01 language:typescript");
});

test("parseArgs normalizes comma-separated labels", () => {
  const options = parseArgs(["--labels", " good first issue,bug, ,help wanted "]);

  assert.deepEqual(options.labels, ["good first issue", "bug", "help wanted"]);
});

test("parseArgs rejects invalid numeric and format options", () => {
  assert.throws(() => parseArgs(["--repos", "0"]), /--repos must be a positive integer/);
  assert.throws(() => parseArgs(["--min-stars", "popular"]), /--min-stars must be a positive integer/);
  assert.throws(() => parseArgs(["--format", "xml"]), /--format must be markdown or json/);
});

test("parseArgs rejects missing values and empty labels", () => {
  assert.throws(() => parseArgs(["--language"]), /--language expects a value/);
  assert.throws(() => parseArgs(["--labels", " , "]), /--labels expects at least one label/);
  assert.throws(() => parseArgs(["--pushed-after", "2026/01/01"]), /--pushed-after must be YYYY-MM-DD/);
});

test("buildIssueQuery quotes a label with spaces", () => {
  const query = buildIssueQuery({ fullName: "owner/repo" }, "good first issue");

  assert.equal(query, 'repo:owner/repo state:open is:issue label:"good first issue"');
});

test("scout returns only repositories with matching issues", async () => {
  const client = {
    async searchRepositories() {
      return [
        { fullName: "a/with-issues", stars: 9000 },
        { fullName: "b/empty", stars: 7000 },
      ];
    },
    async searchIssues(query) {
      if (query === 'repo:a/with-issues state:open is:issue label:"good first issue"') {
        return [{ number: 1, title: "Fix docs", labels: ["good first issue"], updatedAt: "2026-05-01T00:00:00Z", url: "https://github.com/a/with-issues/issues/1" }];
      }
      return [];
    },
  };

  const result = await scout(client, buildPlan(parseArgs(["--repos", "2"])));

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].repo.fullName, "a/with-issues");
});

test("scout deduplicates issues across labels and keeps newest matches", async () => {
  const client = {
    async searchRepositories() {
      return [{ fullName: "owner/repo", stars: 9000 }];
    },
    async searchIssues(query) {
      if (query.endsWith("label:bug")) {
        return [
          { number: 1, title: "Older duplicate", labels: ["bug"], updatedAt: "2026-01-01T00:00:00Z", url: "https://github.com/owner/repo/issues/1" },
          { number: 2, title: "Newest", labels: ["bug"], updatedAt: "2026-03-01T00:00:00Z", url: "https://github.com/owner/repo/issues/2" },
        ];
      }

      return [
        { number: 1, title: "Newer duplicate", labels: ["help wanted"], updatedAt: "2026-02-01T00:00:00Z", url: "https://github.com/owner/repo/issues/1" },
      ];
    },
  };

  const result = await scout(client, {
    issueLimit: 2,
    labels: ["bug", "help wanted"],
    repoLimit: 1,
    repositoryQuery: "stars:>=5000",
  });

  assert.deepEqual(
    result.results[0].issues.map((issue) => issue.number),
    [2, 1],
  );
  assert.equal(result.results[0].issues[1].title, "Newer duplicate");
});

test("createGitHubClient maps repository and issue API payloads", async (t) => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) => {
    requests.push({ options, url: url.toString() });

    if (url.pathname === "/search/repositories") {
      return Response.json({
        items: [
          {
            description: "A test repository",
            full_name: "owner/repo",
            html_url: "https://github.com/owner/repo",
            language: "JavaScript",
            pushed_at: "2026-01-01T00:00:00Z",
            stargazers_count: 1234,
          },
        ],
      });
    }

    return Response.json({
      items: [
        {
          html_url: "https://github.com/owner/repo/issues/7",
          labels: [{ name: "good first issue" }],
          number: 7,
          title: "Improve setup",
          updated_at: "2026-01-02T00:00:00Z",
        },
      ],
    });
  };

  const client = createGitHubClient({ token: "test-token", userAgent: "oss-scout-test" });

  const repositories = await client.searchRepositories("stars:>=5000", 150);
  const issues = await client.searchIssues("repo:owner/repo is:issue", 5);

  assert.deepEqual(repositories, [
    {
      description: "A test repository",
      fullName: "owner/repo",
      language: "JavaScript",
      pushedAt: "2026-01-01T00:00:00Z",
      stars: 1234,
      url: "https://github.com/owner/repo",
    },
  ]);
  assert.deepEqual(issues, [
    {
      labels: ["good first issue"],
      number: 7,
      title: "Improve setup",
      updatedAt: "2026-01-02T00:00:00Z",
      url: "https://github.com/owner/repo/issues/7",
    },
  ]);
  assert.match(requests[0].url, /per_page=100/);
  assert.match(requests[1].url, /per_page=5/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(requests[0].options.headers["User-Agent"], "oss-scout-test");
});

test("renderMarkdown includes repo and issue links", () => {
  const markdown = renderMarkdown({
    generatedAt: "2026-05-25T00:00:00Z",
    plan: {
      labels: ["good first issue"],
      repositoryQuery: "stars:>=5000",
    },
    results: [
      {
        repo: {
          description: "A useful project",
          fullName: "owner/repo",
          language: "JavaScript",
          pushedAt: "2026-05-24T00:00:00Z",
          stars: 12345,
        },
        issues: [
          {
            labels: ["good first issue"],
            number: 42,
            title: "Improve onboarding",
            updatedAt: "2026-05-24T00:00:00Z",
            url: "https://github.com/owner/repo/issues/42",
          },
        ],
      },
    ],
  });

  assert.match(markdown, /## owner\/repo/);
  assert.match(markdown, /\[#42 Improve onboarding\]/);
});

test("renderJson pretty-prints the result payload", () => {
  const json = renderJson({ results: [], generatedAt: "2026-01-01T00:00:00Z" });

  assert.equal(json, '{\n  "results": [],\n  "generatedAt": "2026-01-01T00:00:00Z"\n}');
});
