const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');

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
  const created = [];
  const skipped = [];

  for (const registration of withSubmissions) {
    const submission = registration.interestSubmission.trim();
    const targets = resolveTargets(submission, registration, registrations);
    if (!targets.length) {
      skipped.push({ name: registration.name, submission, reason: 'No resolvable participant number or exact name' });
      continue;
    }

    const outbound = interests.filter((interest) => String(interest.fromRegistrationId) === String(registration._id));
    const missingTargets = targets.filter((targetId) => !outbound.some((interest) => String(interest.toRegistrationId) === targetId && ['new', 'queued', 'active', 'deferred'].includes(interest.status)));

    for (const targetId of missingTargets) {
      const target = registrations.find((candidate) => String(candidate._id) === targetId);
      if (!target) continue;
      try {
        await client.mutation(api.interests.create, {
          fromRegistrationId: registration._id,
          toRegistrationId: target._id,
          source: 'platform_submission',
          notes: `Backfilled from saved profile submission: ${submission}`,
        });
        created.push({ from: registration.name, to: target.name, submission });
      } catch (error) {
        skipped.push({ name: registration.name, submission, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  console.log(JSON.stringify({ createdCount: created.length, created, skippedCount: skipped.length, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
