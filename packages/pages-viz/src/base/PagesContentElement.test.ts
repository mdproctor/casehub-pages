import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { PagesContentElement } from "./PagesContentElement.js";

interface TestProps {
  readonly label?: string;
  readonly count?: number;
}

@customElement("test-content-element-lit")
class TestContentElement extends PagesContentElement<TestProps> {
  renderCalls: Array<{ props: TestProps }> = [];

  protected override renderContent(props: TestProps): TemplateResult {
    this.renderCalls.push({ props });
    return html`<div>Rendered: ${props.label ?? "no label"}</div>`;
  }
}

describe("PagesContentElement", () => {
  let el: TestContentElement;

  beforeEach(() => {
    el = document.createElement("test-content-element-lit") as TestContentElement;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("shadow DOM", () => {
    it("creates shadow root when connected", async () => {
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.shadowRoot).not.toBeNull();
    });
  });

  describe("props management", () => {
    it("returns undefined props initially", () => {
      expect(el.props).toBeUndefined();
    });

    it("stores and retrieves props", () => {
      const props: TestProps = { label: "test", count: 42 };
      el.props = props;
      expect(el.props).toBe(props);
    });

    it("allows setting props to undefined", () => {
      el.props = { label: "test" };
      expect(el.props).not.toBeUndefined();
      el.props = undefined;
      expect(el.props).toBeUndefined();
    });
  });

  describe("render lifecycle", () => {
    it("does not render when not connected", () => {
      el.props = { label: "test" };
      expect(el.renderCalls).toHaveLength(0);
    });

    it("renders when props are set and element is connected", async () => {
      document.body.appendChild(el);
      el.props = { label: "test" };
      await el.updateComplete;

      expect(el.renderCalls.length).toBeGreaterThanOrEqual(1);
      expect(el.renderCalls[el.renderCalls.length - 1]!.props).toEqual({ label: "test" });
    });

    it("does not render content when props are undefined", async () => {
      document.body.appendChild(el);
      await el.updateComplete;

      const div = el.shadowRoot!.querySelector("div");
      expect(div).toBeNull();
    });

    it("re-renders when props change", async () => {
      document.body.appendChild(el);
      el.props = { label: "first" };
      await el.updateComplete;
      const callsAfterFirst = el.renderCalls.length;

      el.props = { label: "second" };
      await el.updateComplete;

      expect(el.renderCalls.length).toBeGreaterThan(callsAfterFirst);
      expect(el.renderCalls[el.renderCalls.length - 1]!.props).toEqual({ label: "second" });
    });

    it("renders content to shadow DOM", async () => {
      document.body.appendChild(el);
      el.props = { label: "content" };
      await el.updateComplete;

      const div = el.shadowRoot!.querySelector("div");
      expect(div).not.toBeNull();
      expect(div!.textContent).toContain("Rendered: content");
    });
  });

  describe("connected/disconnected callbacks", () => {
    it("renders on connectedCallback if props are set", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;

      expect(el.renderCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("calls disconnectedCallback without error", async () => {
      document.body.appendChild(el);
      el.props = { label: "test" };
      await el.updateComplete;

      el.remove();
      expect(el.isConnected).toBe(false);
    });

    it("allows subclasses to override disconnectedCallback", async () => {
      @customElement("test-subclass-element-lit")
      class TestSubclass extends PagesContentElement<TestProps> {
        disconnectedCalls = 0;

        protected override renderContent(_props: TestProps): TemplateResult {
          return html`<div>subclass</div>`;
        }

        override disconnectedCallback(): void {
          this.disconnectedCalls++;
          super.disconnectedCallback();
        }
      }

      const subclass = document.createElement("test-subclass-element-lit") as TestSubclass;
      document.body.appendChild(subclass);
      await subclass.updateComplete;
      subclass.remove();

      expect(subclass.disconnectedCalls).toBe(1);
    });
  });

  describe("no data machinery", () => {
    it("does not have dataSet property", () => {
      expect("dataSet" in el).toBe(false);
    });

    it("does not have totalRows property", () => {
      expect("totalRows" in el).toBe(false);
    });

    it("does not have theme property", () => {
      expect("theme" in el).toBe(false);
    });

    it("does not fire data-request events", async () => {
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      document.body.addEventListener("pages-data-request", handler);

      try {
        document.body.appendChild(el);
        el.props = { label: "test" };
        await el.updateComplete;

        expect(events).toHaveLength(0);
      } finally {
        document.body.removeEventListener("pages-data-request", handler);
      }
    });
  });

  describe("props setter updates", () => {
    it("triggers update when props change from one value to another", async () => {
      document.body.appendChild(el);
      el.props = { label: "first" };
      await el.updateComplete;
      const callsAfterFirst = el.renderCalls.length;

      el.props = { label: "second" };
      await el.updateComplete;

      expect(el.renderCalls.length).toBeGreaterThan(callsAfterFirst);
    });

    it("does not render if element is not connected after props change", () => {
      el.props = { label: "test" };
      expect(el.renderCalls).toHaveLength(0);
    });
  });
});
