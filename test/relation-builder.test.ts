import { describe, expect, it } from "vitest";
import { hostFromWorkerRoutePattern } from "../src/scanner/relation-builder";

describe("relation builder helpers", () => {
  it("extracts hostnames from Worker route patterns", () => {
    expect(hostFromWorkerRoutePattern("example.com/*")).toBe("example.com");
    expect(hostFromWorkerRoutePattern("https://api.example.com/v1/*")).toBe("api.example.com");
    expect(hostFromWorkerRoutePattern("*.example.com/*")).toBe("*.example.com");
    expect(hostFromWorkerRoutePattern("api.example.com:443/*")).toBe("api.example.com");
    expect(hostFromWorkerRoutePattern("")).toBeNull();
  });
});
