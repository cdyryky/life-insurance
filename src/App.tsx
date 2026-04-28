import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  Download,
  FileText,
  RefreshCcw,
  ShieldCheck
} from "lucide-react";
import { defaultInputs } from "./defaults";
import { calculateLadder } from "./model";
import type {
  CalculatorInputs,
  CalculatorResult,
  ChildInput,
  NeedBasis,
  TermLength,
  YearlyRow
} from "./types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2
});

const TERMS: TermLength[] = [10, 15, 20, 30];

function money(value: number) {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return currencyFormatter.format(value);
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1,
  help
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  help?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inputShell">
        {prefix ? <b>{prefix}</b> : null}
        <input
          type="number"
          min={min}
          step={step}
          value={Number.isInteger(value) ? value : Number(value.toFixed(4))}
          onChange={(event) => onChange(parseNumber(event.target.value))}
        />
        {suffix ? <b>{suffix}</b> : null}
      </div>
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function RateField({
  label,
  value,
  onChange,
  help
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <Field
      label={label}
      value={Number((value * 100).toFixed(2))}
      onChange={(next) => onChange(next / 100)}
      suffix="%"
      step={0.1}
      help={help}
    />
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "active" : ""}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span />
      {label}
    </label>
  );
}

function Chart({ rows }: { rows: YearlyRow[] }) {
  const width = 900;
  const height = 360;
  const padding = { top: 24, right: 24, bottom: 42, left: 62 };
  const chartRows = rows.slice(0, 31);
  const maxValue = Math.max(
    1,
    ...chartRows.flatMap((row) => [
      row.incomePvNeed,
      row.spendingPvNeed,
      row.grossNeed,
      row.totalCoverage
    ])
  );
  const x = (year: number) =>
    padding.left +
    (year / 30) * (width - padding.left - padding.right);
  const y = (value: number) =>
    padding.top +
    (1 - value / maxValue) * (height - padding.top - padding.bottom);
  const pathFor = (selector: (row: YearlyRow) => number) =>
    chartRows
      .map((row, index) => `${index === 0 ? "M" : "L"} ${x(row.year)} ${y(selector(row))}`)
      .join(" ");

  const policyBands = [
    { term: 30, color: "rgba(24, 79, 139, 0.16)" },
    { term: 20, color: "rgba(35, 132, 118, 0.18)" },
    { term: 15, color: "rgba(219, 132, 61, 0.18)" },
    { term: 10, color: "rgba(107, 83, 170, 0.18)" }
  ];

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Coverage chart">
        <rect width={width} height={height} rx="10" fill="#fff" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(maxValue * tick)}
              y2={y(maxValue * tick)}
              stroke="#e4e8ef"
            />
            <text x={16} y={y(maxValue * tick) + 4} className="axisText">
              {money(maxValue * tick)}
            </text>
          </g>
        ))}
        {policyBands.map((band) => (
          <rect
            key={band.term}
            x={padding.left}
            y={padding.top}
            width={x(band.term) - padding.left}
            height={height - padding.top - padding.bottom}
            fill={band.color}
          />
        ))}
        {[0, 5, 10, 15, 20, 25, 30].map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="#edf0f5"
            />
            <text x={x(tick)} y={height - 16} textAnchor="middle" className="axisText">
              Y{tick}
            </text>
          </g>
        ))}
        <path d={pathFor((row) => row.incomePvNeed)} fill="none" stroke="#184f8b" strokeWidth="3" />
        <path d={pathFor((row) => row.spendingPvNeed)} fill="none" stroke="#238476" strokeWidth="3" />
        <path d={pathFor((row) => row.grossNeed)} fill="none" stroke="#c34a36" strokeWidth="3" />
        <path
          d={pathFor((row) => row.totalCoverage)}
          fill="none"
          stroke="#14171f"
          strokeWidth="4"
          strokeDasharray="8 7"
        />
      </svg>
      <div className="legend">
        <span><i className="blue" />Income PV</span>
        <span><i className="green" />Spending PV</span>
        <span><i className="red" />Gross need</span>
        <span><i className="black" />Total coverage</span>
      </div>
    </div>
  );
}

function updateChild(children: ChildInput[], index: number, patch: Partial<ChildInput>) {
  return children.map((child, childIndex) =>
    childIndex === index ? { ...child, ...patch } : child
  );
}

function useWorkerCalculation(inputs: CalculatorInputs) {
  const [result, setResult] = useState<CalculatorResult>(() => calculateLadder(inputs));
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<CalculatorResult>) => {
      setResult(event.data);
    };
    worker.postMessage(inputs);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    workerRef.current?.postMessage(inputs);
  }, [inputs]);

  return result;
}

export function App() {
  const [inputs, setInputs] = useState<CalculatorInputs>(defaultInputs);
  const result = useWorkerCalculation(inputs);
  const rowsToPrint = result.rows.slice(0, 31);
  const firstRow = result.rows[0];
  const maxUndercoverage = Math.max(...result.rows.slice(0, 30).map((row) => row.undercoverage));
  const totalPersonalCoverage = result.policies.reduce(
    (sum, policy) => sum + policy.amount,
    0
  );

  const setInput = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const reportRows = useMemo(() => rowsToPrint.filter((row) => row.year % 5 === 0), [rowsToPrint]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Life Insurance Ladder Calculator</h1>
          <p>
            Model real-dollar obligations, assets, employer coverage, and a 10/15/20/30-year
            ladder without using premium quotes.
          </p>
        </div>
        <div className="headerActions">
          <button type="button" className="secondaryButton" onClick={() => setInputs(defaultInputs)}>
            <RefreshCcw size={17} /> Reset
          </button>
          <button type="button" className="primaryButton" onClick={() => window.print()}>
            <FileText size={17} /> Print report
          </button>
        </div>
      </header>

      <section className="summaryGrid">
        <article>
          <span>Recommended personal ladder</span>
          <strong>{money(totalPersonalCoverage)}</strong>
        </article>
        <article>
          <span>Year 0 gross need</span>
          <strong>{money(firstRow?.grossNeed ?? 0)}</strong>
        </article>
        <article>
          <span>Year 0 employer coverage</span>
          <strong>{money(firstRow?.employerCoverage ?? 0)}</strong>
        </article>
        <article>
          <span>Max undercoverage, years 0-30</span>
          <strong>{money(maxUndercoverage)}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="controls">
          <section className="panel">
            <h2><Calculator size={19} /> Target</h2>
            <Segmented<NeedBasis>
              value={inputs.selectedNeedBasis}
              onChange={(value) => setInput("selectedNeedBasis", value)}
              options={[
                { value: "income", label: "Income PV" },
                { value: "spending", label: "Spending PV" }
              ]}
            />
            <Toggle
              checked={inputs.includeEmployerCoverage}
              onChange={(checked) => setInput("includeEmployerCoverage", checked)}
              label="Include static TPMG/employer coverage"
            />
          </section>

          <section className="panel">
            <h2>Income & Spending</h2>
            <Field label="Insured age" value={inputs.insuredAge} onChange={(v) => setInput("insuredAge", v)} />
            <Field label="Spouse age" value={inputs.spouseAge} onChange={(v) => setInput("spouseAge", v)} />
            <Field label="Retirement age" value={inputs.retirementAge} onChange={(v) => setInput("retirementAge", v)} />
            <Field
              label="Surviving spouse longevity age"
              value={inputs.survivingSpouseLongevityAge}
              onChange={(v) => setInput("survivingSpouseLongevityAge", v)}
              help="Spending PV runs to this age for the surviving spouse."
            />
            <Field label="Gross annual income" value={inputs.annualIncome} onChange={(v) => setInput("annualIncome", v)} prefix="$" step={10000} />
            <Field
              label="Monthly household need"
              value={inputs.monthlyHouseholdNeedExcludingMortgage}
              onChange={(v) => setInput("monthlyHouseholdNeedExcludingMortgage", v)}
              prefix="$"
              step={500}
              help="Exclude mortgage principal and interest. Property tax and insurance can remain."
            />
            <Field label="Surviving spouse income" value={inputs.survivingSpouseIncome} onChange={(v) => setInput("survivingSpouseIncome", v)} prefix="$" step={10000} />
            <RateField label="Inflation rate" value={inputs.inflationRate} onChange={(v) => setInput("inflationRate", v)} />
            <RateField label="Nominal discount rate" value={inputs.nominalDiscountRate} onChange={(v) => setInput("nominalDiscountRate", v)} help="Editable field initialized from the asset growth default." />
          </section>

          <section className="panel">
            <h2>Assets</h2>
            <Field label="Liquid/investment assets" value={inputs.currentLiquidAssets} onChange={(v) => setInput("currentLiquidAssets", v)} prefix="$" step={25000} />
            <Field label="Annual non-retirement savings" value={inputs.annualNonRetirementSavings} onChange={(v) => setInput("annualNonRetirementSavings", v)} prefix="$" step={5000} />
            <RateField label="Nominal asset growth" value={inputs.nominalAssetGrowthRate} onChange={(v) => setInput("nominalAssetGrowthRate", v)} />
            <Field label="Retirement assets" value={inputs.currentRetirementAssets} onChange={(v) => setInput("currentRetirementAssets", v)} prefix="$" step={25000} />
            <Field label="Annual retirement savings" value={inputs.annualRetirementSavings} onChange={(v) => setInput("annualRetirementSavings", v)} prefix="$" step={5000} />
            <RateField label="Nominal retirement growth" value={inputs.nominalRetirementGrowthRate} onChange={(v) => setInput("nominalRetirementGrowthRate", v)} />
            <RateField
              label="Pre-tax retirement share"
              value={inputs.preTaxRetirementShare}
              onChange={(v) => setInput("preTaxRetirementShare", Math.min(1, Math.max(0, v)))}
              help={`Effective haircut: ${percentFormatter.format(result.effectiveRetirementTaxHaircut)}`}
            />
            <RateField
              label="Pre-tax beneficiary haircut"
              value={inputs.preTaxRetirementHaircut}
              onChange={(v) => setInput("preTaxRetirementHaircut", Math.min(0.95, Math.max(0, v)))}
            />
            <RateField
              label="Post-tax beneficiary haircut"
              value={inputs.postTaxRetirementHaircut}
              onChange={(v) => setInput("postTaxRetirementHaircut", Math.min(0.95, Math.max(0, v)))}
            />
          </section>

          <section className="panel">
            <h2>Mortgage & Employer</h2>
            <Field label="Mortgage balance" value={inputs.mortgageBalance} onChange={(v) => setInput("mortgageBalance", v)} prefix="$" step={50000} />
            <RateField label="Mortgage rate" value={inputs.mortgageAnnualRate} onChange={(v) => setInput("mortgageAnnualRate", v)} />
            <Field label="Mortgage years remaining" value={inputs.mortgageYearsRemaining} onChange={(v) => setInput("mortgageYearsRemaining", v)} />
            <Field
              label="Employer salary multiplier"
              value={inputs.employerSalaryMultiplier}
              onChange={(v) => setInput("employerSalaryMultiplier", v)}
              suffix="x"
              step={0.1}
              help="Static multiplier of current base salary; future income scaling is out of scope."
            />
            <Field
              label="Employer coverage end year"
              value={inputs.employerCoverageEndYear}
              onChange={(v) => setInput("employerCoverageEndYear", v)}
              help="Coverage applies through this model year, then drops to zero."
            />
          </section>

          <section className="panel">
            <h2>Children</h2>
            {inputs.children.map((child, index) => (
              <div className="childRow" key={child.id}>
                <strong>{child.label}</strong>
                {"ageToday" in child ? (
                  <Field
                    label="Age today"
                    value={child.ageToday ?? 0}
                    onChange={(value) =>
                      setInput("children", updateChild(inputs.children, index, { ageToday: value }))
                    }
                  />
                ) : (
                  <Field
                    label="Birth year offset"
                    value={child.birthYearOffset ?? 0}
                    onChange={(value) =>
                      setInput("children", updateChild(inputs.children, index, { birthYearOffset: value }))
                    }
                    help="Offset is relative to today."
                  />
                )}
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>Illustrative Premium Cost Weights</h2>
            {TERMS.map((term) => (
              <Field
                key={term}
                label={`${term}-year weight`}
                value={inputs.costWeights[term]}
                onChange={(value) =>
                  setInput("costWeights", { ...inputs.costWeights, [term]: value })
                }
                step={0.1}
              />
            ))}
          </section>
        </aside>

        <section className="results">
          <section className="panel heroPanel">
            <div>
              <span className="eyeline"><ShieldCheck size={16} /> Solver result</span>
              <h2>Coverage matched against {inputs.selectedNeedBasis === "income" ? "income replacement" : "household spending"} need</h2>
              <p>
                Real discount rate: {percentFormatter.format(result.realDiscountRate)}.
                Real asset growth: {percentFormatter.format(result.realAssetGrowthRate)}.
                Real retirement growth: {percentFormatter.format(result.realRetirementGrowthRate)}.
                Effective retirement haircut: {percentFormatter.format(result.effectiveRetirementTaxHaircut)}.
              </p>
            </div>
            <div className="policyGrid">
              {result.policies.map((policy) => (
                <article key={policy.termYears}>
                  <span>{policy.termYears}-year</span>
                  <strong>{money(policy.amount)}</strong>
                  <small>Weight {policy.costWeight.toFixed(1)}</small>
                </article>
              ))}
            </div>
          </section>

          {result.warnings.length > 0 ? (
            <section className="warnings">
              {result.warnings.map((warning) => (
                <article key={warning.kind}>
                  <AlertTriangle size={18} />
                  <span>{warning.message}</span>
                </article>
              ))}
            </section>
          ) : null}

          <section className="panel">
            <div className="panelHeader">
              <h2>Need and Coverage by Year</h2>
              <span>Years 0-30</span>
            </div>
            <Chart rows={result.rows} />
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Capital Sufficiency</h2>
              <span>Spending demand view</span>
            </div>
            <div className="capitalGrid">
              <article>
                <span>Worst gap</span>
                <strong>{money(result.capitalSufficiency.worstGap)}</strong>
                <small>Year {result.capitalSufficiency.worstGapYear}</small>
              </article>
              <article>
                <span>First deficit</span>
                <strong>
                  {result.capitalSufficiency.firstDeficitYear === null
                    ? "None"
                    : `Year ${result.capitalSufficiency.firstDeficitYear}`}
                </strong>
                <small>Years 0-30</small>
              </article>
              <article>
                <span>Year 0 supply</span>
                <strong>{money(firstRow?.capitalSupply ?? 0)}</strong>
                <small>Assets + coverage</small>
              </article>
              <article>
                <span>Year 0 demand</span>
                <strong>{money(firstRow?.capitalDemand ?? 0)}</strong>
                <small>Spending PV + mortgage</small>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <h2>Printable Report Preview</h2>
              <button type="button" className="secondaryButton" onClick={() => window.print()}>
                <Download size={16} /> Print
              </button>
            </div>
            <div className="reportMeta">
              <span>Selected target: {inputs.selectedNeedBasis}</span>
              <span>Employer coverage: {inputs.includeEmployerCoverage ? "included" : "excluded"}</span>
              <span>Weighted face amount: {money(result.weightedFaceAmount)}</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Gross need</th>
                    <th>Employer</th>
                    <th>Personal ladder</th>
                    <th>Under</th>
                    <th>Over</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td>{money(row.grossNeed)}</td>
                      <td>{money(row.employerCoverage)}</td>
                      <td>{money(row.personalLadderCoverage)}</td>
                      <td>{money(row.undercoverage)}</td>
                      <td>{money(row.overcoverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
