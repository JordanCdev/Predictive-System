import { GLOSSARY, HOW_TO_READ } from "../engine/index.ts";

/** A plain "how to read this + what the terms mean" reference, collapsed by default. */
export function HowItWorks() {
  return (
    <details className="card howto">
      <summary>How to read this · what the terms mean</summary>
      <div className="howto-body">
        <h4>How to read this</h4>
        <ul className="howto-list">
          {HOW_TO_READ.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <h4>Glossary</h4>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div className="gloss-row" key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.plain}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
