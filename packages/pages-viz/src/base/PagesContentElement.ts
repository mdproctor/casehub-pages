import { LitElement, html, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";

export abstract class PagesContentElement<P extends object> extends LitElement {
  @property({ attribute: false }) props: P | undefined;

  override render(): TemplateResult {
    if (!this.props) return html``;
    return this.renderContent(this.props);
  }

  protected abstract renderContent(props: P): TemplateResult;
}
