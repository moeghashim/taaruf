const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');

const OPEN_INTEREST_STATUSES = new Set(['new', 'queued', 'active', 'deferred']);

function resolveTargets(submission, registration, registrations) {
  const sorted = [...registrations].sort((a, b) => a._creationTime - b._creationTime);
  const registrationNumberMap = new Map(sorted.map((item, index) => [String(index + 1), item]));
  const targetIds = new Set();

  const numericMatches = submission.match(/#?\d+/g) || [];
  for (const match of numericMatches) {
    const normalized = match.replace('#', '').trim();
    const target = registrationNumberMap.get(normalized);
    if (target) targetIds.add(String(target._id));
  }

  const candidateTokens = submission
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of candidateTokens) {
    if (/^#?\d+$/.test(token)) continue;
    const normalizedToken = token.toLowerCase();
    const byName = sorted.find((candidate) => candidate.name.trim().toLowerCase() === normalizedToken);
    if (byName) targetIds.add(String(byName._id));
  }

  return [...targetIds].filter((targetId) => {
    if (String(registration._id) === targetId) return false;
    const target = registrations.find((candidate) => String(candidate._id) === targetId);
    if (!target) return false;
    if (target.gender === registration.gender) return false;
    return true;
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || 'https://clever-meerkat-940.eu-west-1.convex.cloud';
  const client = new ConvexHttpClient(url);
  const registrations = await client.query(api.registrations.getAll, {});
  const interests = await client.query(api.interests.getAll, {});

  const withSubmissions = registrations.filter((registration) => registration.interestSubmission && registration.interestSubmission.trim());
  const missing = [];

  for (const registration of withSubmissions) {
    const targets = resolveTargets(registration.interestSubmission.trim(), registration, registrations);
    if (!targets.length) {
      missing.push({
        registrationId: String(registration._id),
        name: registration.name,
        submission: registration.interestSubmission.trim(),
        issue: 'No valid participant number or exact name could be resolved',
      });
      continue;
    }

    const outbound = interests.filter((interest) => String(interest.fromRegistrationId) === String(registration._id));
    const unresolvedTargets = targets.filter((targetId) => !outbound.some((interest) => String(interest.toRegistrationId) === targetId && OPEN_INTEREST_STATUSES.has(interest.status)));

    if (unresolvedTargets.length) {
      missing.push({
        registrationId: String(registration._id),
        name: registration.name,
        submission: registration.interestSubmission.trim(),
        unresolvedTargetNumbers: unresolvedTargets.map((targetId) => {
          const sorted = [...registrations].sort((a, b) => a._creationTime - b._creationTime);
          const idx = sorted.findIndex((candidate) => String(candidate._id) === targetId);
          return idx >= 0 ? idx + 1 : null;
        }).filter(Boolean),
      });
    }
  }

  console.log(JSON.stringify({
    totalWithSubmissions: withSubmissions.length,
    missingCount: missing.length,
    missing,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
