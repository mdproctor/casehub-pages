const SESSION_KEY = "pages-dev-auth-token";

export class PagesDevAuth extends HTMLElement {
  private overlayVisible = false;

  static get observedAttributes(): string[] {
    return ["backend-url", "identities"];
  }

  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    document.addEventListener("pages-auth-expired", this.handleAuthExpired);
    this.checkAuth();
  }

  disconnectedCallback(): void {
    document.removeEventListener("pages-auth-expired", this.handleAuthExpired);
  }

  private handleAuthExpired = (): void => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* sessionStorage may be unavailable */
    }
    this.renderOverlay();
  };

  private checkAuth(): void {
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(SESSION_KEY);
    } catch {
      /* sessionStorage may be unavailable */
    }

    if (!token || this.isExpired(token)) {
      this.renderOverlay();
    } else {
      this.dismissOverlay();
    }
  }

  private isExpired(token: string): boolean {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return true;

      const payload = JSON.parse(
        atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))
      );

      if (typeof payload.exp !== "number") return true;

      return payload.exp < Date.now() / 1000;
    } catch {
      return true;
    }
  }

  private async login(name: string): Promise<void> {
    const backendUrl = this.getAttribute("backend-url") ?? "";

    try {
      const resp = await fetch(`${backendUrl}/dev/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as { token: string };
        sessionStorage.setItem(SESSION_KEY, data.token);
        this.dismissOverlay();
      }
    } catch {
      /* network error — keep overlay visible */
    }
  }

  private renderOverlay(): void {
    if (!this.shadowRoot) return;

    this.overlayVisible = true;

    const identitiesAttr = this.getAttribute("identities");
    const identities = identitiesAttr ? identitiesAttr.split(",") : null;

    this.shadowRoot.innerHTML = `
      <style>
        .overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        .dialog {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          min-width: 300px;
        }
        .dialog h2 {
          margin-top: 0;
        }
        .dialog select,
        .dialog input[type="text"] {
          width: 100%;
          padding: 0.5rem;
          margin-bottom: 1rem;
          box-sizing: border-box;
        }
        .dialog button {
          width: 100%;
          padding: 0.5rem 1rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .dialog button:hover {
          background: #0056b3;
        }
      </style>
      <div class="overlay">
        <div class="dialog">
          <h2>Login Required</h2>
          <div id="identity-container"></div>
          <button id="login-btn">Login</button>
        </div>
      </div>
    `;

    const container = this.shadowRoot.querySelector("#identity-container");
    if (container) {
      if (identities) {
        const select = document.createElement("select");
        select.id = "identity-select";

        identities.forEach((id) => {
          const option = document.createElement("option");
          option.value = id.trim();
          option.textContent = id.trim();
          select.appendChild(option);
        });

        container.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.id = "identity-input";
        input.placeholder = "Enter name";
        container.appendChild(input);
      }
    }

    const button = this.shadowRoot.querySelector("#login-btn");
    button?.addEventListener("click", () => {
      let name = "";

      if (identities) {
        const select = this.shadowRoot?.querySelector(
          "#identity-select"
        ) as HTMLSelectElement;
        name = select.value;
      } else {
        const input = this.shadowRoot?.querySelector(
          "#identity-input"
        ) as HTMLInputElement;
        name = input.value;
      }

      if (name) {
        void this.login(name);
      }
    });
  }

  private dismissOverlay(): void {
    if (!this.shadowRoot) return;
    this.overlayVisible = false;
    this.shadowRoot.innerHTML = "";
  }
}

customElements.define("pages-dev-auth", PagesDevAuth);
