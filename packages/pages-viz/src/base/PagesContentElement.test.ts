import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {PagesContentElement} from "./PagesContentElement.js";

interface TestProps {
  readonly label?: string;
  readonly count?: number;
}

class TestContentElement extends PagesContentElement<TestProps> {
  renderCalls: Array<{ props: TestProps }> = [];

  protected override render(
    _container: HTMLDivElement,
    props: TestProps,
  ): void {
    this.renderCalls.push({ props });
    _container.textContent = `Rendered: ${props.label || "no label"}`;
  }
}

customElements.define("test-content-element", TestContentElement);

describe("PagesContentElement", () => {
  let el: TestContentElement;

  beforeEach(() => {
    el = document.createElement("test-content-element") as TestContentElement;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("shadow DOM", () => {
    it("creates shadow root with a container div", () => {
      expect(el.shadowRoot).not.toBeNull();
      const container = el.shadowRoot.querySelector("div");
      expect(container).not.toBeNull();
    });

    it("container div is accessible via protected property", () => {
      // Verify the container is created in constructor
      expect(el.shadowRoot).not.toBeNull();
      expect(el.shadowRoot.childNodes.length).toBeGreaterThan(0);
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

    it("renders when props are set and element is connected", () => {
      document.body.appendChild(el);
      el.props = { label: "test" };

      expect(el.renderCalls).toHaveLength(1);
      expect(el.renderCalls[0]!.props).toEqual({ label: "test" });
    });

    it("does not render when props are undefined", () => {
      document.body.appendChild(el);
      el.props = undefined;
      expect(el.renderCalls).toHaveLength(0);
    });

    it("re-renders when props change", () => {
      document.body.appendChild(el);
      el.props = { label: "first" };
      expect(el.renderCalls).toHaveLength(1);

      el.props = { label: "second" };
      expect(el.renderCalls).toHaveLength(2);
      expect(el.renderCalls[1]!.props).toEqual({ label: "second" });
    });

    it("renders to the container div", () => {
      document.body.appendChild(el);
      el.props = { label: "content" };

      const container = el.shadowRoot.querySelector("div");
      expect(container!.textContent).toContain("Rendered: content");
    });
  });

  describe("connected/disconnected callbacks", () => {
    it("renders on connectedCallback if props are set", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);

      expect(el.renderCalls).toHaveLength(1);
    });

    it("does not render on connectedCallback if props are undefined", () => {
      document.body.appendChild(el);
      expect(el.renderCalls).toHaveLength(0);
    });

    it("calls disconnectedCallback without error", () => {
      document.body.appendChild(el);
      el.props = { label: "test" };
      expect(el.renderCalls).toHaveLength(1);

      el.remove();
      // disconnectedCallback should complete without throwing
      expect(el.isConnected).toBe(false);
    });

    it("allows subclasses to override disconnectedCallback", () => {
      class TestSubclass extends PagesContentElement<TestProps> {
        disconnectedCalls = 0;

        protected override render(_container: HTMLDivElement, _props: TestProps): void {
          // no-op
        }

        override disconnectedCallback(): void {
          this.disconnectedCalls++;
          super.disconnectedCallback();
        }
      }

      customElements.define("test-subclass-element", TestSubclass);
      const subclass = document.createElement("test-subclass-element") as TestSubclass;
      document.body.appendChild(subclass);
      subclass.remove();

      expect(subclass.disconnectedCalls).toBe(1);
    });
  });

  describe("no data machinery", () => {
    it("does not have dataSet property", () => {
      // PagesContentElement should not have dataset-related properties
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        "dataSet",
      );
      expect(descriptor).toBeUndefined();
    });

    it("does not have totalRows property", () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        "totalRows",
      );
      expect(descriptor).toBeUndefined();
    });

    it("does not have theme property", () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el),
        "theme",
      );
      expect(descriptor).toBeUndefined();
    });

    it("does not fire data-request events", () => {
      const events: CustomEvent[] = [];
      const handler = (e: Event) => events.push(e as CustomEvent);
      document.body.addEventListener("pages-data-request", handler);

      try {
        document.body.appendChild(el);
        el.props = { label: "test" };

        expect(events).toHaveLength(0);
      } finally {
        document.body.removeEventListener("pages-data-request", handler);
      }
    });
  });

  describe("props setter updates", () => {
    it("triggers update when props change from one value to another", () => {
      document.body.appendChild(el);
      el.props = { label: "first" };
      el.props = { label: "second" };

      expect(el.renderCalls).toHaveLength(2);
    });

    it("triggers update when setting same props object again", () => {
      document.body.appendChild(el);
      const props = { label: "test" };
      el.props = props;
      el.props = props;

      // Both assignments should trigger render
      expect(el.renderCalls).toHaveLength(2);
    });

    it("does not render if element is not connected after props change", () => {
      el.props = { label: "test" };
      // Not connected, so update() should skip render

      expect(el.renderCalls).toHaveLength(0);
    });
  });

  describe("container element access", () => {
    it("has accessible container div for subclasses", () => {
      document.body.appendChild(el);
      el.props = { label: "test" };

      const container = el.shadowRoot.querySelector("div");
      expect(container).not.toBeNull();
      expect(container!.textContent).toContain("Rendered:");
    });
  });
});
