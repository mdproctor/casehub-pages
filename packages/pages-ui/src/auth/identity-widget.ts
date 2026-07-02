const SESSION_KEY = "pages-dev-auth-token";

export class PagesIdentity extends HTMLElement {
  private pickerVisible = false;

  static get observedAttributes(): string[] {
    return ["backend-url", "identities"];
  }

  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    this.render();
  }

  private getCurrentUser(): string {
    try {
      const token = sessionStorage.getItem(SESSION_KEY);
      if (!token) return "Guest";

      const parts = token.split(".");
      if (parts.length !== 3) return "Guest";

      const payload = JSON.parse(
        atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))
      );

      return typeof payload.sub === "string" ? payload.sub : "Guest";
    } catch {
      return "Guest";
    }
  }

  private render(): void {
    if (!this.shadowRoot) return;

    const currentUser = this.getCurrentUser();

    this.shadowRoot.innerHTML = `
      <style>
        .identity-display {
          display: inline-block;
          padding: 0.5rem 1rem;
          background: #f0f0f0;
          border-radius: 4px;
          cursor: pointer;
          user-select: none;
        }
        .identity-display:hover {
          background: #e0e0e0;
        }
        .picker-popover {
          position: absolute;
          background: white;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          z-index: 1000;
          min-width: 200px;
        }
        .picker-popover select,
        .picker-popover input[type="text"] {
          width: 100%;
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          box-sizing: border-box;
        }
        .picker-popover button {
          width: 100%;
          padding: 0.5rem 1rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .picker-popover button:hover {
          background: #0056b3;
        }
      </style>
      <div class="identity-display" id="identity-display"></div>
      ${this.pickerVisible ? this.renderPicker() : ""}
    `;

    const display = this.shadowRoot.querySelector("#identity-display");
    if (display) {
      display.textContent = currentUser;
      display.addEventListener("click", () => {
        this.pickerVisible = !this.pickerVisible;
        this.render();
      });
    }

    if (this.pickerVisible) {
      this.attachPickerListeners();
    }
  }

  private renderPicker(): string {
    const identitiesAttr = this.getAttribute("identities");
    const identities = identitiesAttr ? identitiesAttr.split(",") : null;

    if (identities) {
      const container = document.createElement("div");
      container.className = "picker-popover";

      const select = document.createElement("select");
      select.id = "identity-select";

      identities.forEach((id) => {
        const option = document.createElement("option");
        option.value = id.trim();
        option.textContent = id.trim();
        select.appendChild(option);
      });

      const button = document.createElement("button");
      button.id = "switch-btn";
      button.textContent = "Switch";

      container.appendChild(select);
      container.appendChild(button);

      return container.outerHTML;
    } else {
      return `
        <div class="picker-popover">
          <input type="text" id="identity-input" placeholder="Enter name" />
          <button id="switch-btn">Switch</button>
        </div>
      `;
    }
  }

  private attachPickerListeners(): void {
    const button = this.shadowRoot?.querySelector("#switch-btn");
    button?.addEventListener("click", () => {
      const identitiesAttr = this.getAttribute("identities");
      const identities = identitiesAttr ? identitiesAttr.split(",") : null;

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
        void this.switchIdentity(name);
      }
    });
  }

  private async switchIdentity(name: string): Promise<void> {
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
        this.pickerVisible = false;
        this.render();
      }
    } catch {
      /* network error — keep picker visible */
    }
  }
}

customElements.define("pages-identity", PagesIdentity);
