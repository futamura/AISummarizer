/* Throwaway test that must fail, to confirm CI turns red. Do not merge. */
describe('CI red check', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
