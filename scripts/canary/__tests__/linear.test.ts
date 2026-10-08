import { execFile } from 'node:child_process';

import { blockedIssueTitle, fileBlockedIssues } from '../linear';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

const mockExecFile = execFile as unknown as jest.Mock;
const mockFetch = jest.fn();

const lookup = (openIssues: string[]) => ({
  data: {
    teams: { nodes: [{ id: 'team' }] },
    projects: { nodes: [{ id: 'project' }] },
    issueLabels: { nodes: [{ id: 'label' }] },
    issues: { nodes: openIssues.map(identifier => ({ identifier })) },
  },
});

const respond = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

const sentBody = (call: number) => JSON.parse(mockFetch.mock.calls[call][1].body);

describe('fileBlockedIssues', () => {
  beforeEach(() => {
    mockExecFile.mockImplementation((_cmd, _args, callback) => callback(null, 'canary-key\n', ''));
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('files an issue with the steps when none is open, sending the Keychain key as is', async () => {
    mockFetch
      .mockResolvedValueOnce(respond(lookup([])))
      .mockResolvedValueOnce(respond({ data: { issueCreate: { success: true, issue: { identifier: 'FUT-1' } } } }));

    await expect(fileBlockedIssues(['perplexity'], 'run-1')).resolves.toEqual([{ page: 'perplexity', status: 'filed', identifier: 'FUT-1' }]);

    expect(mockExecFile).toHaveBeenCalledWith('security', ['find-generic-password', '-s', 'linear-api-fut-canary', '-w'], expect.any(Function));
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('canary-key');
    expect(sentBody(0).variables.title).toBe(blockedIssueTitle('perplexity'));
    const { input } = sentBody(1).variables;
    expect(input).toMatchObject({ teamId: 'team', projectId: 'project', labelIds: ['label'], title: blockedIssueTitle('perplexity') });
    expect(input.description).toContain('pnpm canary:login');
    expect(input.description).toContain('Cmd+Q');
  });

  it('files nothing when an issue for the page is still open', async () => {
    mockFetch.mockResolvedValueOnce(respond(lookup(['FUT-2'])));

    await expect(fileBlockedIssues(['claude'], 'run-1')).resolves.toEqual([{ page: 'claude', status: 'exists', identifier: 'FUT-2' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns failures instead of throwing, and goes on with the next page', async () => {
    mockFetch
      .mockResolvedValueOnce(respond({ errors: [{ message: 'forbidden' }] }, 403))
      .mockResolvedValueOnce(respond(lookup([])))
      .mockResolvedValueOnce(respond({ data: { issueCreate: { success: true, issue: { identifier: 'FUT-3' } } } }));

    await expect(fileBlockedIssues(['claude', 'perplexity'], 'run-1')).resolves.toEqual([
      { page: 'claude', status: 'failed', error: 'Linear answered 403: forbidden' },
      { page: 'perplexity', status: 'filed', identifier: 'FUT-3' },
    ]);
  });

  it('fails every page without calling Linear when the Keychain item cannot be read', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback) => callback(new Error('not found'), '', ''));

    const outcomes = await fileBlockedIssues(['claude', 'perplexity'], 'run-1');

    expect(outcomes.map(outcome => outcome.status)).toEqual(['failed', 'failed']);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
