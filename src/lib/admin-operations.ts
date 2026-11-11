import { api } from '../../convex/_generated/api';
// Creation/reset/contact sharing retain their dedicated guarded routes.
export const adminQueries = {
 'registrations.getAll': api.registrations.getAll,
 'interests.getAll': api.interests.getAll,
 'matches.workbenchPage': api.matches.workbenchPage,
 'interests.workbenchPage': api.interests.workbenchPage,
 'matches.getAll': api.matches.getAll,
 'profileShares.getAll': api.profileShares.getAll,
 'settings.get': api.settings.get,
 'events.profileFilterCatalog': api.events.profileFilterCatalog,
 'events.profileFilterMembership': api.events.profileFilterMembership,
 'events.getAll': api.events.getAll,
 'events.getDetail': api.events.getDetail,
 'events.getByRegistration': api.events.getByRegistration,
 'interests.getByRegistration': api.interests.getByRegistration,
} as const;
export const adminMutations = {
 'registrations.updateStatus': api.registrations.updateStatus,
 'registrations.deleteRegistration': api.registrations.deleteRegistration,
 'registrations.updateAdminNotes': api.registrations.updateAdminNotes,
 'interests.updateStatus': api.interests.updateStatus,
 'interests.updateAdminStatus': api.interests.updateAdminStatus,
 'interests.updateNotes': api.interests.updateNotes,
 'interests.remove': api.interests.remove,
 'interests.progressFirst': api.interests.progressFirst,
 'interests.convertToMatch': api.interests.convertToMatch,
 'matches.resume': api.matches.resume,
 'matches.updateStatus': api.matches.updateStatus,
 'matches.resetPair': api.matches.resetPair,
 'settings.set': api.settings.set,
} as const;
