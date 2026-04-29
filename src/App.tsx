import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Menu,
  MoreVertical,
  RefreshCcw,
  ShieldCheck
} from "lucide-react";
import { defaultInputs } from "./defaults";
import { calculateLadder } from "./model";
import type {
  CalculatorInputs,
  CalculatorResult,
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

function SectionTitle({
  index,
  children,
  icon
}: {
  index?: number;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <h2>
      {typeof index === "number" ? <span className="stepBadge">{index}</span> : icon}
      {children}
    </h2>
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
    { term: 30, color: "rgba(21, 94, 76, 0.08)" },
    { term: 20, color: "rgba(37, 99, 235, 0.07)" },
    { term: 15, color: "rgba(183, 121, 31, 0.08)" },
    { term: 10, color: "rgba(21, 94, 76, 0.12)" }
  ];

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Coverage chart">
        <rect width={width} height={height} rx="8" fill="#fff" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(maxValue * tick)}
              y2={y(maxValue * tick)}
              stroke="#e5e7eb"
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
              stroke="#eef2f7"
            />
            <text x={x(tick)} y={height - 16} textAnchor="middle" className="axisText">
              Y{tick}
            </text>
          </g>
        ))}
        <path d={pathFor((row) => row.incomePvNeed)} fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray="7 6" />
        <path d={pathFor((row) => row.spendingPvNeed)} fill="none" stroke="#155e4c" strokeWidth="3" />
        <path d={pathFor((row) => row.grossNeed)} fill="none" stroke="#b7791f" strokeWidth="3" />
        <path
          d={pathFor((row) => row.totalCoverage)}
          fill="none"
          stroke="#0f4f42"
          strokeWidth="4"
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
  const capitalSufficiencyPercent = Math.max(
    0,
    Math.min(1, (firstRow?.capitalSupply ?? 0) / Math.max(1, firstRow?.capitalDemand ?? 1))
  );

  const summaryItems = [
    {
      label: "Income PV",
      value: money(firstRow?.incomePvNeed ?? 0),
      note: "In today's dollars",
      tone: "success"
    },
    {
      label: "Spending PV",
      value: money(firstRow?.spendingPvNeed ?? 0),
      note: "In today's dollars"
    },
    {
      label: "Capital gap",
      value: money(Math.max(0, result.capitalSufficiency.worstGap)),
      note: `Year ${result.capitalSufficiency.worstGapYear}`,
      tone: "blue"
    },
    {
      label: "Recommended coverage",
      value: money(totalPersonalCoverage),
      note: "Total initial face amount",
      tone: "success"
    },
    {
      label: "Years of coverage",
      value: "30",
      note: `Through age ${inputs.insuredAge + 30}`
    },
    {
      label: "Capital sufficiency",
      value: percentFormatter.format(capitalSufficiencyPercent),
      note: "At target confidence",
      tone: "success"
    }
  ];

  return (
    <main>
      <header className="topbar">
        <div className="brandCluster">
          <div className="brandMark"><ShieldCheck size={18} /></div>
          <h1>Life Insurance Ladder</h1>
        </div>
        <nav className="mainNav" aria-label="Primary navigation">
          <a className="active" href="#dashboard">Dashboard</a>
          <a href="#assumptions">Assumptions</a>
          <a href="#report">Reports</a>
          <a href="#help">Help</a>
        </nav>
        <div className="headerActions">
          <button type="button" className="iconButton" aria-label="Menu">
            <MoreVertical size={18} />
          </button>
          <button type="button" className="secondaryButton" onClick={() => setInputs(defaultInputs)}>
            <RefreshCcw size={17} /> Reset
          </button>
          <button type="button" className="primaryButton" onClick={() => window.print()}>
            <FileText size={17} /> Print report
          </button>
        </div>
      </header>

      <section className="mobileTopbar">
        <button type="button" className="iconButton" aria-label="Open menu">
          <Menu size={18} />
        </button>
        <div className="brandCluster">
          <div className="brandMark"><ShieldCheck size={16} /></div>
          <strong>Life Insurance Ladder</strong>
        </div>
        <button type="button" className="linkButton">Edit</button>
      </section>

      <section className="summaryGrid" id="dashboard">
        {summaryItems.map((item) => (
          <article key={item.label} className={item.tone ? `tone-${item.tone}` : undefined}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="controls">
          <section className="panel" id="assumptions">
            <SectionTitle index={1}>Select target</SectionTitle>
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
            <SectionTitle index={2}>Income & Spending</SectionTitle>
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
            <Field
              label="Dependent drop-off year"
              value={inputs.dependentDropOffYear}
              onChange={(v) => setInput("dependentDropOffYear", v)}
              help="Model year when dependent-related spending drops."
            />
            <Field
              label="Dependent drop-off amount"
              value={inputs.dependentDropOffAmount}
              onChange={(v) => setInput("dependentDropOffAmount", v)}
              prefix="$"
              step={5000}
              help="Annual reduction to spending need after the drop-off year."
            />
            <RateField label="Inflation rate" value={inputs.inflationRate} onChange={(v) => setInput("inflationRate", v)} />
            <RateField label="Nominal discount rate" value={inputs.nominalDiscountRate} onChange={(v) => setInput("nominalDiscountRate", v)} help="Editable field initialized from the asset growth default." />
          </section>

          <section className="panel">
            <SectionTitle index={3}>Assets</SectionTitle>
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
            <SectionTitle index={4}>Survivor Pension</SectionTitle>
            <Toggle
              checked={inputs.includeSurvivorPension}
              onChange={(checked) => setInput("includeSurvivorPension", checked)}
              label="Include survivor pension capital offset"
            />
            <Field
              label="Current service years"
              value={inputs.pensionCurrentServiceYears}
              onChange={(v) => setInput("pensionCurrentServiceYears", v)}
              step={0.25}
              help="Defaults to 0 for a July 2026 model start."
            />
            <Field
              label="HAC / compensation cap"
              value={inputs.pensionHac}
              onChange={(v) => setInput("pensionHac", v)}
              prefix="$"
              step={10000}
              help="Treated as a real-dollar value because the cap is assumed to rise with inflation."
            />
            <RateField
              label="Survivor factor"
              value={inputs.pensionSurvivorFactor}
              onChange={(v) => setInput("pensionSurvivorFactor", Math.min(1, Math.max(0, v)))}
            />
            <RateField
              label="Tax adjustment factor"
              value={inputs.pensionTaxAdjustmentFactor}
              onChange={(v) => setInput("pensionTaxAdjustmentFactor", Math.min(1, Math.max(0, v)))}
            />
            <Field
              label="Vesting years"
              value={inputs.pensionVestingYears}
              onChange={(v) => setInput("pensionVestingYears", v)}
            />
            <Field
              label="Normal retirement age"
              value={inputs.pensionNormalRetirementAge}
              onChange={(v) => setInput("pensionNormalRetirementAge", v)}
            />
            <Field
              label="Minimum commencement age"
              value={inputs.pensionMinimumCommencementAge}
              onChange={(v) => setInput("pensionMinimumCommencementAge", v)}
            />
            <RateField
              label="Early reduction rate"
              value={inputs.pensionEarlyReductionRate}
              onChange={(v) => setInput("pensionEarlyReductionRate", Math.min(1, Math.max(0, v)))}
            />
          </section>

          <section className="panel">
            <SectionTitle index={5}>Mortgage & Employer</SectionTitle>
            <Field label="Mortgage balance" value={inputs.mortgageBalance} onChange={(v) => setInput("mortgageBalance", v)} prefix="$" step={50000} />
            <RateField label="Mortgage rate" value={inputs.mortgageAnnualRate} onChange={(v) => setInput("mortgageAnnualRate", v)} />
            <Field label="Mortgage years remaining" value={inputs.mortgageYearsRemaining} onChange={(v) => setInput("mortgageYearsRemaining", v)} />
            <Field
              label="TPMG/employer coverage"
              value={inputs.employerCoverageAmount}
              onChange={(v) => setInput("employerCoverageAmount", v)}
              prefix="$"
              step={100000}
              help="Static coverage amount included while employer coverage is enabled."
            />
            <Field
              label="Employer coverage end year"
              value={inputs.employerCoverageEndYear}
              onChange={(v) => setInput("employerCoverageEndYear", v)}
              help="Coverage applies through this model year, then drops to zero."
            />
          </section>

          <section className="panel">
            <SectionTitle index={6}>Premium Cost Weights</SectionTitle>
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
              <h2>Recommended ladder</h2>
              <p>
                Coverage matched against {inputs.selectedNeedBasis === "income" ? "income replacement" : "household spending"} need.
                Real discount rate: {percentFormatter.format(result.realDiscountRate)}.
                Real asset growth: {percentFormatter.format(result.realAssetGrowthRate)}.
                Real retirement growth: {percentFormatter.format(result.realRetirementGrowthRate)}.
                Effective retirement haircut: {percentFormatter.format(result.effectiveRetirementTaxHaircut)}.
              </p>
            </div>
            <div className="policyGrid" aria-label="Policy summary cards">
              {result.policies.map((policy) => (
                <article key={policy.termYears}>
                  <span>{policy.termYears}-year</span>
                  <strong>{money(policy.amount)}</strong>
                  <small>Weight {policy.costWeight.toFixed(1)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel ladderPanel">
            <div className="panelHeader">
              <h2>Recommended ladder</h2>
              <button type="button" className="secondaryButton">Edit ladder</button>
            </div>
            <div className="tableWrap ladderTable">
              <table>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Face amount</th>
                    <th>Type</th>
                    <th>Term</th>
                    <th>Years covered</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.policies.map((policy, index) => (
                    <tr key={policy.termYears}>
                      <td><span className="rowBadge">{index + 1}</span></td>
                      <td>{money(policy.amount)}</td>
                      <td>Level Term</td>
                      <td>{policy.termYears} years</td>
                      <td>
                        {index === 0
                          ? `1 - ${policy.termYears}`
                          : `${result.policies[index - 1].termYears + 1} - ${policy.termYears}`}
                      </td>
                      <td>{policy.costWeight.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total initial face amount</td>
                    <td>{money(totalPersonalCoverage)}</td>
                    <td colSpan={3}>Max undercoverage, years 0-30</td>
                    <td>{money(maxUndercoverage)}</td>
                  </tr>
                </tfoot>
              </table>
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
              <div className="chartActions">
                <Segmented<"chart" | "table">
                  value="chart"
                  onChange={() => undefined}
                  options={[
                    { value: "chart", label: "Chart" },
                    { value: "table", label: "Table" }
                  ]}
                />
                <span>Real (after inflation)</span>
              </div>
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
                <small>Assets + pension + coverage</small>
              </article>
              <article>
                <span>Pension PV</span>
                <strong>{money(firstRow?.pensionTaxAdjustedValue ?? 0)}</strong>
                <small>Year 0 tax-adjusted survivor pension PV</small>
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
              <span>Survivor pension: {inputs.includeSurvivorPension ? "included" : "excluded"}</span>
              <span>Weighted face amount: {money(result.weightedFaceAmount)}</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Gross need</th>
                    <th>Pension PV</th>
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
                      <td>{money(row.pensionTaxAdjustedValue)}</td>
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
