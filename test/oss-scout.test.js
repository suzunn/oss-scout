import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIssueQuery,
  buildPlan,
  buildRepositoryQuery,
  parseArgs,
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
