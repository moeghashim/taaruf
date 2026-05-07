import type { Doc } from "./_generated/dataModel";

type RegistrationNumberDoc = Pick<Doc<"registrations">, "_id" | "_creationTime" | "applicantNumber">;

export function buildRegistrationNumberMaps<T extends RegistrationNumberDoc>(registrations: T[]) {
  const sorted = [...registrations].sort((a, b) => {
    const applicantNumberDelta =
      (a.applicantNumber ?? Number.MAX_SAFE_INTEGER) - (b.applicantNumber ?? Number.MAX_SAFE_INTEGER);
    return applicantNumberDelta || a._creationTime - b._creationTime;
  });

  const usedNumbers = new Set(
    sorted
      .map((registration) => registration.applicantNumber)
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0)
  );
  let nextFallbackNumber = 1;

  const numbered = sorted.map((registration) => {
    let number =
      typeof registration.applicantNumber === "number" &&
      Number.isInteger(registration.applicantNumber) &&
      registration.applicantNumber > 0
        ? registration.applicantNumber
        : null;
    if (number === null) {
      while (usedNumbers.has(nextFallbackNumber)) {
        nextFallbackNumber += 1;
      }
      number = nextFallbackNumber;
      usedNumbers.add(number);
      nextFallbackNumber += 1;
    }
    return { registration, number };
  });

  const byNumber = new Map<number, T>();
  for (const { registration, number } of numbered) {
    if (!byNumber.has(number)) {
      byNumber.set(number, registration);
    }
  }

  return {
    registrations: numbered.map(({ registration }) => registration),
    byId: new Map(numbered.map(({ registration, number }) => [registration._id, number] as const)),
    byNumber,
  };
}
