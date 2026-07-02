import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "./identity-widget.js";

const SESSION_KEY = "pages-dev-auth-token";

describe("PagesIdentity custom element", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createToken(sub: string, exp: number): string {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({ sub, exp, iat: Math.floor(Date.now() / 1000) })
    );
    return `${header}.${payload}.fake-signature`;
  }

  function createFutureToken(sub: string): string {
    return createToken(sub, Math.floor(Date.now() / 1000) + 3600);
  }

  it("shows current user name from JWT sub", async () => {
    const token = createFutureToken("alice");
    sessionStorage.setItem(SESSION_KEY, token);

    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const display = el.shadowRoot?.querySelector(".identity-display");
    expect(display?.textContent).toContain("alice");
  });

  it("shows fallback when no token", async () => {
    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const display = el.shadowRoot?.querySelector(".identity-display");
    expect(display?.textContent).toBeTruthy();
  });

  it("click opens picker popover", async () => {
    const token = createFutureToken("alice");
    sessionStorage.setItem(SESSION_KEY, token);

    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    el.setAttribute("identities", "alice,bob,charlie");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const display = el.shadowRoot?.querySelector(
      ".identity-display"
    ) as HTMLElement;
    expect(el.shadowRoot?.querySelector(".picker-popover")).toBeNull();

    display.click();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const popover = el.shadowRoot?.querySelector(".picker-popover");
    expect(popover).not.toBeNull();
  });

  it("identity switch: POST + update sessionStorage", async () => {
    const initialToken = createFutureToken("alice");
    sessionStorage.setItem(SESSION_KEY, initialToken);

    const newToken = createFutureToken("bob");
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: newToken }),
      } as Response)
    );
    global.fetch = mockFetch;

    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    el.setAttribute("identities", "alice,bob,charlie");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Open picker
    const display = el.shadowRoot?.querySelector(
      ".identity-display"
    ) as HTMLElement;
    display.click();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Select new identity
    const select = el.shadowRoot?.querySelector("select") as HTMLSelectElement;
    select.value = "bob";

    const button = el.shadowRoot?.querySelector("button");
    button?.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/dev/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "bob" }),
      })
    );

    expect(sessionStorage.getItem(SESSION_KEY)).toBe(newToken);
  });

  it("popover closes after identity switch", async () => {
    const initialToken = createFutureToken("alice");
    sessionStorage.setItem(SESSION_KEY, initialToken);

    const newToken = createFutureToken("bob");
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: newToken }),
      } as Response)
    );
    global.fetch = mockFetch;

    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    el.setAttribute("identities", "alice,bob");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Open picker
    const display = el.shadowRoot?.querySelector(
      ".identity-display"
    ) as HTMLElement;
    display.click();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".picker-popover")).not.toBeNull();

    // Switch identity
    const button = el.shadowRoot?.querySelector("button");
    button?.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(el.shadowRoot?.querySelector(".picker-popover")).toBeNull();
  });

  it("supports free-text input when no identities attribute", async () => {
    const initialToken = createFutureToken("alice");
    sessionStorage.setItem(SESSION_KEY, initialToken);

    const newToken = createFutureToken("charlie");
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: newToken }),
      } as Response)
    );
    global.fetch = mockFetch;

    const el = document.createElement("pages-identity");
    el.setAttribute("backend-url", "http://localhost:8080");
    document.body.appendChild(el);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Open picker
    const display = el.shadowRoot?.querySelector(
      ".identity-display"
    ) as HTMLElement;
    display.click();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Enter free text
    const input = el.shadowRoot?.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "charlie";

    const button = el.shadowRoot?.querySelector("button");
    button?.click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/dev/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "charlie" }),
      })
    );
  });
});
