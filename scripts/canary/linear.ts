import { execFile } from 'node:child_process';

const API_URL = 'https://api.linear.app/graphql';
/*
 * The canary's own key, limited to reading and creating issues in team Futamura. It lives in the
 * login Keychain only, never in the repository, the runs directory or the logs
 */
const KEYCHAIN_SERVICE = 'linear-api-fut-canary';
const TEAM_KEY = 'FUT';
const PROJECT_NAME = 'AISummarizer';
const LABEL_NAME = 'chore';

export type FileOutcome = { page: string; status: 'filed' | 'exists'; identifier: string } | { page: string; status: 'failed'; error: string };

/* The title is how a later run finds the issue still open, so it must stay the same for a page */
export const blockedIssueTitle = (page: string): string => `Pass the Cloudflare check for the canary on ${page}`;

const blockedIssueDescription = (page: string, runId: string): string =>
  [
    '## Why',
    '',
    `The canary run ${runId} got Cloudflare's check instead of the ${page} page, so its selectors go unchecked until a person passes the check. The screenshot is in that run's directory.`,
    '',
    '## Done when',
    '',
    `- [ ] Run \`pnpm canary:login\` and pass the "Verify you are human" check on the ${page} tab`,
    '- [ ] Quit the browser with Cmd+Q',
    `- [ ] The next canary run reports ${page} as ok`,
  ].join('\n');

const readApiKey = (): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], (error, stdout) => {
      if (error) reject(new Error(`Could not read the Keychain item ${KEYCHAIN_SERVICE}`));
      else resolve(stdout.trim());
    });
  });

/**
 * Send one GraphQL request to Linear
 * @param apiKey - A personal API key, sent as is (Linear takes no Bearer prefix for these)
 * @param query - The query or mutation
 * @param variables - Its variables
 * @returns The data of the response
 */
const request = async <T>(apiKey: string, query: string, variables: Record<string, unknown>): Promise<T> => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors || !body.data) {
    throw new Error(`Linear answered ${response.status}: ${body.errors?.map(error => error.message).join('; ') ?? 'no data'}`);
  }
  return body.data;
};

interface LookupData {
  teams: { nodes: { id: string }[] };
  projects: { nodes: { id: string }[] };
  issueLabels: { nodes: { id: string }[] };
  issues: { nodes: { identifier: string }[] };
}

const LOOKUP_QUERY = `query ($team: String!, $project: String!, $label: String!, $title: String!) {
  teams(filter: { key: { eq: $team } }) { nodes { id } }
  projects(filter: { name: { eq: $project } }) { nodes { id } }
  issueLabels(filter: { name: { eq: $label } }) { nodes { id } }
  issues(filter: { team: { key: { eq: $team } }, title: { eq: $title }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { identifier } }
}`;

const CREATE_MUTATION = `mutation ($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { identifier } }
}`;

const fileOne = async (apiKey: string, page: string, runId: string): Promise<FileOutcome> => {
  const title = blockedIssueTitle(page);
  const found = await request<LookupData>(apiKey, LOOKUP_QUERY, { team: TEAM_KEY, project: PROJECT_NAME, label: LABEL_NAME, title });
  const open = found.issues.nodes[0];
  if (open) return { page, status: 'exists', identifier: open.identifier };

  const [team] = found.teams.nodes;
  const [project] = found.projects.nodes;
  const [label] = found.issueLabels.nodes;
  if (!team || !project || !label) throw new Error(`Could not find team ${TEAM_KEY}, project ${PROJECT_NAME} or label ${LABEL_NAME}`);
  const created = await request<{ issueCreate: { success: boolean; issue: { identifier: string } | null } }>(apiKey, CREATE_MUTATION, {
    input: { teamId: team.id, projectId: project.id, labelIds: [label.id], title, description: blockedIssueDescription(page, runId) },
  });
  if (!created.issueCreate.success || !created.issueCreate.issue) throw new Error('Linear did not create the issue');
  return { page, status: 'filed', identifier: created.issueCreate.issue.identifier };
};

/**
 * File a Linear issue with the steps to pass the Cloudflare check, for each blocked page that has no
 * open one yet. A failure is returned rather than thrown, so that it never changes the canary's result
 * @param pages - The names of the blocked pages
 * @param runId - The run's directory name, quoted in the issue
 * @returns What happened for each page
 */
export const fileBlockedIssues = async (pages: string[], runId: string): Promise<FileOutcome[]> => {
  if (pages.length === 0) return [];
  let apiKey: string;
  try {
    apiKey = await readApiKey();
  } catch (error: unknown) {
    return pages.map(page => ({ page, status: 'failed', error: error instanceof Error ? error.message : String(error) }));
  }
  const outcomes: FileOutcome[] = [];
  for (const page of pages) {
    outcomes.push(
      await fileOne(apiKey, page, runId).catch((error: unknown) => ({
        page,
        status: 'failed' as const,
        error: error instanceof Error ? error.message : String(error),
      }))
    );
  }
  return outcomes;
};
