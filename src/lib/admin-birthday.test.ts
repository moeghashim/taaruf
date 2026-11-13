import { afterEach, expect, test, vi } from "vitest";
import { formatAdminBirthday } from "./admin-birthday";
afterEach(()=>vi.unstubAllEnvs());
test.each(["Pacific/Honolulu","America/Chicago","UTC","Pacific/Kiritimati"])("date-only formatting is stable in %s",zone=>{
 vi.stubEnv("TZ",zone);
 expect(formatAdminBirthday("2000-02-29")).toBe("February 29, 2000");
 expect(formatAdminBirthday("1990-01-01")).toBe("January 1, 1990");
});
test.each([undefined,"","bad","2001-02-29","2000-2-29","2000-01-01T00:00:00Z"])("missing or invalid %s hides row",value=>expect(formatAdminBirthday(value)).toBeNull());
