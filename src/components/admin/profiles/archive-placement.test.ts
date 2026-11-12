import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('admin archive stays after profile content and actions with admin callbacks intact', () => {
  const source = readFileSync(new URL('./profile-detail.tsx', import.meta.url), 'utf8');
  expect(source.match(/<ArchiveParticipant /g)).toHaveLength(1);
  expect(source.indexOf('<ArchiveParticipant ')).toBeGreaterThan(source.indexOf('Delete profile'));
  expect(source).toContain('registrationId={profile._id}');
  expect(source).toContain('onArchived={at => { setLocalArchive({ id: profile._id, at }); refreshAdminData(); }}');
  expect(source).toContain('onRestored={() => { setLocalArchive({ id: profile._id, at: null }); refreshAdminData(); }}');
});

test('portalled modal layers sit above admin drawer and mobile navigation', () => {
  const dialog = readFileSync(new URL('../../ui/dialog.tsx', import.meta.url), 'utf8');
  expect(dialog).toContain('fixed inset-0 z-[300]');
  expect(dialog).toContain('top-[50%] z-[301]');
});
