// @vitest-environment node
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {getFunctionName} from "convex/server";
import type {ConvexHttpClient} from "convex/browser";
import type {Id} from "../../convex/_generated/dataModel";
import {deliverMatchmakerPresentation,matchmakerDeliveryConfig} from "./matchmaker-delivery";
const fetchMock=vi.fn();
const claimed=new Set<string>();
const records: unknown[]=[];
const query=vi.fn();
const mutation=vi.fn();
const client={query,mutation} as unknown as ConvexHttpClient;
const run=()=>deliverMatchmakerPresentation(client,"synthetic-service","match" as Id<"matches">);
function config(){vi.stubEnv("MATCHMAKER_EMAIL_MODE","isolated");vi.stubEnv("MATCHMAKER_RESEND_API_KEY","synthetic");vi.stubEnv("MATCHMAKER_EMAIL_FROM","Test <test@example.invalid>");vi.stubEnv("MATCHMAKER_PORTAL_URL","https://preview.example.invalid");vi.stubEnv("MATCHMAKER_EMAIL_ALLOWED_RECIPIENTS","m@example.invalid,f@example.invalid");}
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset().mockResolvedValue({ok:true,status:200});query.mockReset();mutation.mockReset();claimed.clear();records.length=0;for(const key of ["MATCHMAKER_EMAIL_MODE","MATCHMAKER_RESEND_API_KEY","MATCHMAKER_EMAIL_FROM","MATCHMAKER_PORTAL_URL","MATCHMAKER_EMAIL_ALLOWED_RECIPIENTS","MATCHMAKER_PRODUCTION_APPROVED"])vi.stubEnv(key,"");query.mockImplementation(async ref=>getFunctionName(ref)==="matches:getById"?{matchmakerPresentedAt:1,maleRegistrationId:"m",femaleRegistrationId:"f"}:{email:"m@example.invalid"});mutation.mockImplementation(async(ref,args)=>{if(getFunctionName(ref)==="matchmakerMatching:recordNotification"){records.push(args);return null;}if(claimed.has(args.recipientId))return null;claimed.add(args.recipientId);return {deliveryId:args.recipientId,key:"stable:"+args.recipientId,email:args.recipientId+"@example.invalid",name:"PRIVATE NAME"};});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
test("disabled sender does not query, claim or fetch",async()=>{expect(await run()).toEqual({enabled:false,sent:0,failed:0});expect(query).not.toHaveBeenCalled();expect(mutation).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();});
test("production requires dedicated approval and live origin",()=>{config();vi.stubEnv("MATCHMAKER_EMAIL_MODE","production");vi.stubEnv("MATCHMAKER_PORTAL_URL","https://www.1plus1match.com");expect(matchmakerDeliveryConfig()).toBeNull();vi.stubEnv("MATCHMAKER_PRODUCTION_APPROVED","true");expect(matchmakerDeliveryConfig()?.portal).toBe("https://www.1plus1match.com/me#matchmaker-matching");vi.stubEnv("MATCHMAKER_PORTAL_URL","https://preview.example.invalid");expect(matchmakerDeliveryConfig()).toBeNull();});
test.each(["http://preview.invalid","https://u:p@preview.invalid","invalid","https://1plus1match.com","https://www.1plus1match.com","https://sub.1plus1match.com"])("isolated rejects unsafe portal %s",url=>{config();vi.stubEnv("MATCHMAKER_PORTAL_URL",url);expect(matchmakerDeliveryConfig()).toBeNull();});
test("allowlist checked before consuming claims",async()=>{config();vi.stubEnv("MATCHMAKER_EMAIL_ALLOWED_RECIPIENTS","");expect((await run()).failed).toBe(2);expect(mutation).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();});
test("draft rejected without claim or send",async()=>{config();query.mockResolvedValue({maleRegistrationId:"m",femaleRegistrationId:"f"});await expect(run()).rejects.toThrow("Presentation required");expect(mutation).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();});
test("permanent claims deduplicate retries with stable provider keys and generic review copy",async()=>{config();expect((await run()).sent).toBe(2);expect((await run()).sent).toBe(0);expect(fetchMock).toHaveBeenCalledTimes(2);const options=fetchMock.mock.calls[0][1];expect(options.headers["Idempotency-Key"]).toBe("stable:m");const payload=JSON.parse(options.body);expect(payload.text).toContain("/me#matchmaker-matching");expect(payload.text).not.toContain("PRIVATE NAME");expect(records).toHaveLength(2);});
test("transport ambiguity records failure and never repeats consumed recipient",async()=>{config();fetchMock.mockRejectedValue(new Error("timeout"));expect((await run()).failed).toBe(2);await run();expect(fetchMock).toHaveBeenCalledTimes(2);expect(records).toEqual([expect.objectContaining({sent:false}),expect.objectContaining({sent:false})]);});
test("429 stops without attempting next recipient",async()=>{config();fetchMock.mockResolvedValue({ok:false,status:429,headers:new Headers({"retry-after":"3600"})});expect((await run()).failed).toBe(1);expect(fetchMock).toHaveBeenCalledTimes(1);expect([...claimed]).toEqual(["m"]);});
test("changed claimed email is rechecked against isolated allowlist",async()=>{config();mutation.mockResolvedValue({deliveryId:"m",key:"stable:m",email:"not-allowed@example.invalid"});await run();expect(fetchMock).not.toHaveBeenCalled();});
