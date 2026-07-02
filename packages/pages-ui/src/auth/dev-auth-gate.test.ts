import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "./dev-auth-gate.js";

const SESSION_KEY = "pages-dev-auth-token";

describe("PagesDevAuth custom element", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createValidToken(exp: number): string {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({ sub: "alice", exp, iat: Math.floor(Date.now() / 1000) })
    );
    return `${header}.${payload}.fake-signature`;
  }

  function createExpiredToken(): string {
    return createValidToken(Math.floor(Date.now() / 1000) - 3600);
  }

  function createFutureToken(): string {
    return createValidToken(Math.floor(Date.now() / 1000) + 3600);
  }

  it("renders nothing when sessionStorage has valid JWT", async () => {
    const token = createFutureToken();
    sessionStorage.setItem(SESSION_KEY, token);

    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".overlay")).toBeNull();
  });

  it("renders overlay when no JWT", async () => {
    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlay = el.shadowRoot?.querySelector(".overlay");
    expect(overlay).not.toBeNull();
  });

  it("renders overlay when JWT expired", async () => {
    const token = createExpiredToken();
    sessionStorage.setItem(SESSION_KEY, token);

    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlay = el.shadowRoot?.querySelector(".overlay");
    expect(overlay).not.toBeNull();
  });

  it("base64url decoding works correctly", async () => {
    // Test with base64url-specific chars (- and _)
    const header = btoa(JSON.stringify({ alg: "HS256" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = btoa(
      JSON.stringify({ sub: "test-user_123", exp: Date.now() / 1000 + 3600 })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const token = `${header}.${payload}.sig`;

    sessionStorage.setItem(SESSION_KEY, token);
    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".overlay")).toBeNull();
  });

  it("renders dropdown when identities attribute set", async () => {
    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    el.setAttribute("identities", "alice,bob,charlie");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const select = el.shadowRoot?.querySelector("select");
    expect(select).not.toBeNull();
    const options = Array.from(select?.querySelectorAll("option") ?? []);
    expect(options.map((o) => o.value)).toContain("alice");
    expect(options.map((o) => o.value)).toContain("bob");
    expect(options.map((o) => o.value)).toContain("charlie");
  });

  it("renders text input when no identities", async () => {
    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = el.shadowRoot?.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
  });

  it("on selection: POST to /dev/auth/login", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: createFutureToken() }),
      } as Response)
    );
    global.fetch = mockFetch;

    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    el.setAttribute("identities", "alice,bob");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const button = el.shadowRoot?.querySelector("button");
    expect(button).not.toBeNull();
    button?.click();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/dev/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("on success: stores token in sessionStorage and dismisses overlay", async () => {
    const newToken = createFutureToken();
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: newToken }),
      } as Response)
    );
    global.fetch = mockFetch;

    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".overlay")).not.toBeNull();

    const input = el.shadowRoot?.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    input.value = "alice";

    const button = el.shadowRoot?.querySelector("button");
    button?.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sessionStorage.getItem(SESSION_KEY)).toBe(newToken);
    expect(el.shadowRoot?.querySelector(".overlay")).toBeNull();
  });

  it("pages-auth-expired event triggers re-render", async () => {
    const token = createFutureToken();
    sessionStorage.setItem(SESSION_KEY, token);

    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".overlay")).toBeNull();

    // Dispatch auth-expired event
    document.dispatchEvent(new CustomEvent("pages-auth-expired"));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(el.shadowRoot?.querySelector(".overlay")).not.toBeNull();
  });

  it("disconnectedCallback removes event listener", async () => {
    const el = document.createElement("pages-dev-auth");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const token = createFutureToken();
    sessionStorage.setItem(SESSION_KEY, token);

    // Remove element
    document.body.removeChild(el);

    // Dispatch event — should not affect removed element
    document.dispatchEvent(new CustomEvent("pages-auth-expired"));

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Token should still be in sessionStorage (event listener removed)
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(token);
  });
});
