// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ data: {} as Record<string, unknown>, stateIndex: 0 }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    // Seed only the dashboard first state; retain other component defaults.
    if (fixture.stateIndex++ === 0) return [fixture.data, vi.fn()];
    return actual.useState(initial);
  } };
});
vi.mock('@/components/applicant/support-ribbon', () => ({ SupportRibbon: () => null }));
import ApplicantDashboardPage from './page';
const reassurance = 'May Allah bring whatever is best for you.';
beforeEach(() => { fixture.stateIndex = 0; });
function dashboard(gender: string, count: number, ownDecline = false) {
  return {
    applicant: { name: 'Synthetic Applicant', gender, status: 'approved', applicantNumber: 99001, profileCompletionStatus: 'complete', hasPhotos: false },
    inbound: [], outbound: [], privateDocumented: [],
    history: ownDecline ? [{ interestId: 'synthetic-own', status: 'declined', ownDecision: 'declined', ownInitialDecision: 'declined', ownFinalApproval: 'declined' }] : [],
    outboundDeclineCount: count, canSubmitInterest: false,
    interestSubmissionLimit: 3, interestSubmissionEventId: null, interestSubmissions: [],
  };
}
for (const gender of ['male', 'female']) {
  for (const count of [0, 1, 2, 7]) {
    test(gender + ' recipient count ' + count + ' has exact anonymous notice', () => {
      fixture.data = dashboard(gender, count);
      const html = renderToStaticMarkup(createElement(ApplicantDashboardPage));
      if (count === 0) {
        expect(html).not.toContain(reassurance);
        expect(html).not.toContain('Closed connections');
      } else {
        const message = count === 1 ? 'Your outbound interest has been declined.' : count + ' of your outbound interests have been declined.';
        expect(html).toContain('<p>' + message + ' ' + reassurance + '</p>');
        expect(html.split(reassurance)).toHaveLength(2);
      }
    });
  }
  test(gender + ' own decline does not receive reassurance', () => {
    fixture.data = dashboard(gender, 0, true);
    const html = renderToStaticMarkup(createElement(ApplicantDashboardPage));
    expect(html).toContain('This connection is closed. No further response is needed.');
    expect(html).toContain('Your decision: Declined.');
    expect(html).toContain('Your initial response: Declined.');
    expect(html).toContain('Your final approval: Declined.');
    expect(html).not.toContain(reassurance);
  });
}
