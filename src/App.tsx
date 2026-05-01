import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  Info,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Target
} from "lucide-react";
import { defaultInputs } from "./defaults";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { activeYearsLabel } from "./format";
import { calculateLadder } from "./model";
import type {
  CalculatorInputs,
  CalculatorResult,
  CollegeFundingMode,
  MortgageStrategy,
  NeedBasis,
  PremiumWeightMode,
  ScenarioSummary,
  SocialSecurityBenefitMode,
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

function mortgageStrategyLabel(strategy: MortgageStrategy) {
  if (strategy === "payoff_at_death") return "Pay off mortgage";
  if (strategy === "partial_paydown") return "Pay down mortgage";
  return "Keep payments";
}

export function employerScenarioCreditText(scenario: Pick<
  ScenarioSummary,
  "employerCoverageCreditFactor" | "creditedEmployerGroupCoverage"
>) {
  if (
    scenario.employerCoverageCreditFactor === 0 ||
    scenario.creditedEmployerGroupCoverage === 0
  ) {
    return "Excluded / 0% credited";
  }
  return `${percentFormatter.format(scenario.employerCoverageCreditFactor)} credited`;
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
    <div
      className="segmented"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
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
  label,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span />
      <strong>{label}</strong>
      {description ? <small>{description}</small> : null}
    </label>
  );
}

function PendingBadge({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span className="pendingBadge" role="status" aria-live="polite">
      <LoaderCircle size={15} aria-hidden="true" />
      Updating...
    </span>
  );
}

function AccordionPanel({
  title,
  id,
  children
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details className="accordionPanel" id={id}>
      <summary>
        <span>{title}</span>
        <ChevronDown size={16} />
      </summary>
      <div className="accordionContent">{children}</div>
    </details>
  );
}

function ScenarioBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="scenarioBadge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
      row.spendingNetNeedReal,
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
        <path d={pathFor((row) => row.spendingNetNeedReal)} fill="none" stroke="#b7791f" strokeWidth="3" />
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
        <span><i className="red" />Net need after offsets</span>
        <span><i className="black" />Real coverage</span>
      </div>
    </div>
  );
}

function scenarioTermAmount(scenario: ScenarioSummary, term: TermLength) {
  if (term === 10) return scenario.recommended10YearTerm;
  if (term === 15) return scenario.recommended15YearTerm;
  if (term === 20) return scenario.recommended20YearTerm;
  return scenario.recommended30YearTerm;
}

function ScenarioRangeDashboard({
  scenarios,
  isPending
}: {
  scenarios: ScenarioSummary[];
  isPending: boolean;
}) {
  const lowerNeed = scenarios.find((scenario) => scenario.id === "optimistic");
  const conservative = scenarios.find((scenario) => scenario.id === "conservative");
  const coverageValues = scenarios.map((scenario) => scenario.personallyOwnedTermCoverage);
  const lowCoverage = coverageValues.length ? Math.min(...coverageValues) : 0;
  const highCoverage = coverageValues.length ? Math.max(...coverageValues) : 0;

  return (
    <section
      className={`decisionSummary rangeSummary${isPending ? " pendingSurface" : ""}`}
      id="dashboard"
      aria-busy={isPending}
    >
      <div className="rangeHeader">
        <span className="eyeline"><ShieldCheck size={16} /> Modeled coverage range</span>
        <PendingBadge active={isPending} />
        <h2>Lower-need scenario to conservative stress scenario</h2>
        <strong>{money(lowCoverage)} - {money(highCoverage)}</strong>
        <p>
          These are scenario outputs, not one precise answer. The base case uses your
          selected mortgage strategy and configured offset credits.
        </p>
      </div>
      <div className="scenarioCardGrid" aria-label="Coverage range scenarios">
        {scenarios.map((scenario) => (
          <article key={scenario.id} className={`scenarioCard ${scenario.id}`}>
            <div className="scenarioCardHeader">
              <span>{scenario.label}</span>
              <strong>{money(scenario.personallyOwnedTermCoverage)}</strong>
            </div>
            <div className="scenarioMeta">
              <span>Return {percentFormatter.format(scenario.realReturn)}</span>
              <span>{employerScenarioCreditText(scenario)}</span>
              <span>SS {percentFormatter.format(scenario.socialSecurityCreditFactor)} credited</span>
            </div>
            <div className="scenarioTermGrid">
              {TERMS.map((term) => (
                <div key={term}>
                  <span>{term}yr</span>
                  <strong>{money(scenarioTermAmount(scenario, term))}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="rangeFootnote">
        <span>Lower bound shown: {lowerNeed?.label ?? "lower-need scenario"}</span>
        <span>Stress bound shown: {conservative?.label ?? "conservative scenario"}</span>
      </div>
    </section>
  );
}

function NeedCoverageTable({ rows }: { rows: YearlyRow[] }) {
  const displayRows = rows.slice(0, 31);

  return (
    <div className="tableWrap needCoverageTable">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Income PV</th>
            <th>Spending PV</th>
            <th>Childcare/support</th>
            <th>College</th>
            <th>SS credit</th>
            <th>Mortgage</th>
            <th>Durable assets</th>
            <th>Retirement offset</th>
            <th>Pension PV</th>
            <th>Employer credit</th>
            <th>Net need</th>
            <th>Personal ladder</th>
            <th>Total coverage</th>
            <th>Under</th>
            <th>Over</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr key={row.year}>
              <td>{row.year}</td>
              <td>{money(row.incomePvNeed)}</td>
              <td>{money(row.spendingPvNeed)}</td>
              <td>{money(row.childcareHouseholdSupportPv)}</td>
              <td>{money(row.collegeFundingPv)}</td>
              <td>{money(row.creditedSocialSecuritySurvivorPv)}</td>
              <td>{money(row.realMortgageDemand)}</td>
              <td>{money(row.liquidAssets)}</td>
              <td>{money(row.retirementAssetsAfterHaircut)}</td>
              <td>{money(row.pensionTaxAdjustedValue)}</td>
              <td>{money(row.creditedEmployerCoverage)}</td>
              <td>{money(row.spendingNetNeedReal)}</td>
              <td>{money(row.realPersonalCoverage)}</td>
              <td>{money(row.totalCoverage)}</td>
              <td>{money(row.undercoverage)}</td>
              <td>{money(row.overcoverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfidenceStrip() {
  const items = [
    {
      icon: <CheckCircle2 size={17} />,
      label: "Source-backed assumptions",
      note: "SSA metadata and formula details live in Methodology.",
      tone: "verified"
    },
    {
      icon: <Info size={17} />,
      label: "Quote weights are directional",
      note: "Validate final term mix against actual carrier quotes.",
      tone: "caution"
    },
    {
      icon: <AlertTriangle size={17} />,
      label: "Not financial advice",
      note: "Use as a planning model and confirm final quotes and eligibility.",
      tone: "neutral"
    }
  ];

  return (
    <div className="confidenceStrip" aria-label="Accuracy notes">
      {items.map((item) => (
        <article key={item.label} className={`confidenceItem ${item.tone}`}>
          {item.icon}
          <div>
            <strong>{item.label}</strong>
            <span>{item.note}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function MiniTrace({ row, isPending }: { row?: YearlyRow; isPending: boolean }) {
  const traceRows = [
    ["Spending need", row?.spendingPvNeed ?? 0],
    ["Childcare/support", row?.childcareHouseholdSupportPv ?? 0],
    ["College funding", row?.collegeFundingPv ?? 0],
    ["Mortgage demand", row?.realMortgageDemand ?? 0],
    ["Social Security credit", -(row?.creditedSocialSecuritySurvivorPv ?? 0)],
    ["Durable assets", -(row?.liquidAssets ?? 0)],
    ["Retirement after haircut", -(row?.retirementAssetsAfterHaircut ?? 0)],
    ["Pension value", -(row?.pensionTaxAdjustedValue ?? 0)],
    ["Employer credit", -(row?.creditedEmployerCoverage ?? 0)],
    ["Net personal need", row?.spendingNetNeedReal ?? 0]
  ] as const;

  return (
    <section className={`railPanel tracePanel${isPending ? " pendingSurface" : ""}`} aria-busy={isPending}>
      <div className="railHeader">
        <span className="railIcon"><Target size={16} /></span>
        <div>
          <h2>Year 0 offset trace</h2>
          <p>Separated by reliability.</p>
        </div>
        <PendingBadge active={isPending} />
      </div>
      <div className="miniTraceList">
        {traceRows.map(([label, value]) => (
          <div key={label} className={value < 0 ? "offset" : undefined}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AssumptionChecklist({
  inputs,
  result,
  isPending
}: {
  inputs: CalculatorInputs;
  result: CalculatorResult;
  isPending: boolean;
}) {
  const items = [
    {
      label: "Spending need",
      detail: `${money(inputs.monthlyHouseholdNeedExcludingMortgage * 12)} annual household need before mortgage.`,
      done: inputs.monthlyHouseholdNeedExcludingMortgage > 0
    },
    {
      label: "Employer portability",
      detail: inputs.includeEmployerCoverage
        ? `${percentFormatter.format(inputs.employerCoverageCreditFactor)} of employer coverage credited.`
        : "Employer coverage excluded.",
      done: !inputs.includeEmployerCoverage || inputs.employerCoverageCreditFactor <= 0.5
    },
    {
      label: "Social Security estimate",
      detail:
        inputs.socialSecurityBenefitMode === "manual"
          ? `${money(inputs.manualAnnualSocialSecuritySurvivorBenefit)} manual annual benefit.`
          : "Using simplified SSA 2026 proxy.",
      done:
        inputs.socialSecurityBenefitMode === "proxy" ||
        inputs.manualAnnualSocialSecuritySurvivorBenefit > 0
    },
    {
      label: "College assumption",
      detail:
        inputs.collegeFundingMode === "included"
          ? `${money(inputs.annualCollegeFunding)} annual college funding included.`
          : "College funding excluded from the primary ladder.",
      done: inputs.collegeFundingMode === "excluded"
    },
    {
      label: "Post-30 residual need",
      detail: result.warnings.some((warning) => warning.kind === "residual-after-30")
        ? "Need remains after the 30-year term window."
        : "No residual warning in the current model.",
      done: !result.warnings.some((warning) => warning.kind === "residual-after-30")
    }
  ];
  const doneCount = items.filter((item) => item.done).length;

  return (
    <section className={`railPanel checklistPanel${isPending ? " pendingSurface" : ""}`} aria-busy={isPending}>
      <div className="railHeader">
        <span className="railIcon"><ClipboardCheck size={16} /></span>
        <div>
          <h2>Assumption checklist</h2>
          <p>{doneCount} / {items.length} resolved</p>
        </div>
        <PendingBadge active={isPending} />
      </div>
      <div className="checkList">
        {items.map((item) => (
          <article key={item.label} className={item.done ? "done" : undefined}>
            <span aria-hidden="true">{item.done ? "OK" : ""}</span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function useWorkerCalculation(inputs: CalculatorInputs) {
  const [state, setState] = useState<{
    result: CalculatorResult;
    isCalculating: boolean;
  }>(() => ({
    result: calculateLadder(inputs),
    isCalculating: false
  }));
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef(0);
  const didMountRef = useRef(false);

  useEffect(() => {
    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<{ requestId: number; result: CalculatorResult }>
    ) => {
      if (event.data.requestId !== latestRequestIdRef.current) return;
      setState({ result: event.data.result, isCalculating: false });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setState((current) => ({ ...current, isCalculating: true }));

    if (workerRef.current) {
      workerRef.current.postMessage({ requestId, inputs });
      return;
    }

    setState({ result: calculateLadder(inputs), isCalculating: false });
  }, [inputs]);

  return state;
}

export function App() {
  const [inputs, setInputs] = useState<CalculatorInputs>(defaultInputs);
  const [needCoverageView, setNeedCoverageView] = useState<"chart" | "table">("chart");
  const { result, isCalculating } = useWorkerCalculation(inputs);
  const rowsToPrint = result.rows.slice(0, 31);
  const firstRow = result.rows[0];
  const maxUndercoverage = Math.max(...result.rows.slice(0, 30).map((row) => row.undercoverage));
  const totalPersonalCoverage = result.totalInitialCoverage;
  const employerCreditPercent = percentFormatter.format(
    inputs.includeEmployerCoverage ? inputs.employerCoverageCreditFactor : 0
  );

  const setInput = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const setPremiumWeight = (term: TermLength, value: number) => {
    setInputs((current) => ({
      ...current,
      premiumWeightMode: "manual",
      costWeights: {
        ...(current.premiumWeightMode === "manual"
          ? current.costWeights
          : result.effectiveCostWeights),
        [term]: value
      }
    }));
  };

  const reportRows = useMemo(() => rowsToPrint.filter((row) => row.year % 5 === 0), [rowsToPrint]);
  const residualAfter30 = result.warnings.some(
    (warning) => warning.kind === "residual-after-30"
  );

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
          <a href="#methodology">Methodology</a>
          <a href="#report">Reports</a>
        </nav>
        <div className="headerActions">
          <button type="button" className="secondaryButton" onClick={() => setInputs(defaultInputs)}>
            <RefreshCcw size={17} /> Reset
          </button>
          <button type="button" className="primaryButton" onClick={() => window.print()}>
            <FileText size={17} /> Print report
          </button>
        </div>
      </header>

      <section className="mobileTopbar">
        <div className="brandCluster">
          <div className="brandMark"><ShieldCheck size={16} /></div>
          <strong>Life Insurance Ladder</strong>
        </div>
        <PendingBadge active={isCalculating} />
      </section>

      <ScenarioRangeDashboard scenarios={result.scenarioMatrix} isPending={isCalculating} />
      <ConfidenceStrip />

      <section className="workspace">
        <aside className="controls">
          <section className="panel quickPanel" id="assumptions">
            <SectionTitle index={1}>Core assumptions</SectionTitle>

            <div className="controlBlock">
              <span className="controlLabel">Target basis</span>
              <Segmented<NeedBasis>
                value={inputs.selectedNeedBasis}
                onChange={(value) => setInput("selectedNeedBasis", value)}
                options={[
                  { value: "spending", label: "Spending need" },
                  { value: "income", label: "Income replacement" }
                ]}
              />
            </div>

            <div className="controlBlock">
              <span className="controlLabel">College funding</span>
              <Segmented<CollegeFundingMode>
                value={inputs.collegeFundingMode}
                onChange={(value) => setInput("collegeFundingMode", value)}
                options={[
                  { value: "excluded", label: "Excluded" },
                  { value: "included", label: "Included" }
                ]}
              />
            </div>

            <div className="controlBlock">
              <span className="controlLabel">Mortgage strategy</span>
              <Segmented<MortgageStrategy>
                value={inputs.mortgageStrategy}
                onChange={(value) => setInput("mortgageStrategy", value)}
                options={[
                  { value: "payoff_at_death", label: "Pay off mortgage" },
                  { value: "partial_paydown", label: "Pay down mortgage" },
                  { value: "continue_monthly_payments", label: "Keep payments" }
                ]}
              />
              {inputs.mortgageStrategy === "partial_paydown" ? (
                <RateField
                  label="Mortgage paid off for survivor"
                  value={inputs.mortgagePaydownPercent}
                  onChange={(v) =>
                    setInput("mortgagePaydownPercent", Math.min(1, Math.max(0, v)))
                  }
                  help="Pays down this share of the remaining principal and models payments on the unpaid balance."
                />
              ) : null}
            </div>

            <div className="featureToggles" aria-label="Feature toggles">
              <Toggle
                checked={inputs.includeEmployerCoverage}
                onChange={(checked) => setInput("includeEmployerCoverage", checked)}
                label="Employer coverage"
                description={`Credit ${employerCreditPercent} of current TPMG/employer group coverage in modeled supply.`}
              />
              <Toggle
                checked={inputs.includeSurvivorPension}
                onChange={(checked) => setInput("includeSurvivorPension", checked)}
                label="Survivor pension"
                description="Use the tax-adjusted survivor pension as a capital offset."
              />
              <Toggle
                checked={inputs.socialSecurityChildSecondarySchoolToAge19}
                onChange={(checked) => setInput("socialSecurityChildSecondarySchoolToAge19", checked)}
                label="SS child benefit to age 19"
                description="Extend child survivor benefits through secondary school eligibility."
              />
            </div>

            <div className="stressPanel" aria-label="Stress-test assumptions">
              <div className="stressHeader">
                <h3>Stress-test assumptions</h3>
                <p>These drive the existing scenario matrix; no preset is applied to the base inputs.</p>
              </div>

              <article className="stressScenario">
                <h4>Conservative / Max Safety</h4>
                <RateField
                  label="Real return"
                  value={inputs.realReturnConservative}
                  onChange={(v) => setInput("realReturnConservative", v)}
                />
                <div className="scenarioBadges">
                  <ScenarioBadge label="Employer credit" value={percentFormatter.format(0)} />
                  <ScenarioBadge label="SS credit" value={percentFormatter.format(0)} />
                </div>
              </article>

              <article className="stressScenario">
                <h4>Balanced Base</h4>
                <RateField
                  label="Real return"
                  value={inputs.realReturnBaseCase}
                  onChange={(v) => setInput("realReturnBaseCase", v)}
                />
                <RateField
                  label="Employer credit"
                  value={inputs.employerCoverageCreditFactor}
                  onChange={(v) => setInput("employerCoverageCreditFactor", Math.min(1, Math.max(0, v)))}
                />
                <RateField
                  label="SS credit"
                  value={inputs.socialSecurityCreditFactor}
                  onChange={(v) => setInput("socialSecurityCreditFactor", Math.min(1, Math.max(0, v)))}
                />
              </article>

              <article className="stressScenario">
                <h4>Lower-Need Scenario</h4>
                <RateField
                  label="Real return"
                  value={inputs.realReturnOptimistic}
                  onChange={(v) => setInput("realReturnOptimistic", v)}
                />
                <div className="scenarioBadges">
                  <ScenarioBadge label="Employer credit" value={percentFormatter.format(1)} />
                  <ScenarioBadge label="SS credit" value={percentFormatter.format(1)} />
                </div>
              </article>
            </div>
          </section>

          <AccordionPanel title="Household & spending">
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
            <Field
              label="Childcare/household support"
              value={inputs.childcareHouseholdSupportAnnual}
              onChange={(v) => setInput("childcareHouseholdSupportAnnual", v)}
              prefix="$"
              step={5000}
              help="Separate temporary annual support liability."
            />
            <Field
              label="Support end age"
              value={inputs.childcareSupportEndAge}
              onChange={(v) => setInput("childcareSupportEndAge", v)}
              help="Support ends when the youngest child reaches this age."
            />
            <Field
              label="Annual college funding"
              value={inputs.annualCollegeFunding}
              onChange={(v) => setInput("annualCollegeFunding", v)}
              prefix="$"
              step={5000}
              help={`Currently ${inputs.collegeFundingMode === "included" ? "included" : "excluded"} from the primary ladder.`}
            />
            <Field
              label="College start year"
              value={inputs.collegeStartYear}
              onChange={(v) => setInput("collegeStartYear", v)}
            />
            <Field
              label="College end year"
              value={inputs.collegeEndYear}
              onChange={(v) => setInput("collegeEndYear", v)}
            />
            <RateField label="Nominal discount rate" value={inputs.nominalDiscountRate} onChange={(v) => setInput("nominalDiscountRate", v)} help="Used outside the scenario real-return matrix." />
          </AccordionPanel>

          <AccordionPanel title="Assets & retirement taxes">
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
          </AccordionPanel>

          <AccordionPanel title="Survivor pension details">
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
              help="Survivor pension is approximate and modeled as a fixed nominal annuity using the entered HAC value."
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
          </AccordionPanel>

          <AccordionPanel title="Mortgage, employer, and Social Security">
            <Field label="Mortgage balance" value={inputs.mortgageBalance} onChange={(v) => setInput("mortgageBalance", v)} prefix="$" step={50000} />
            <RateField label="Mortgage rate" value={inputs.mortgageAnnualRate} onChange={(v) => setInput("mortgageAnnualRate", v)} />
            <Field label="Mortgage years remaining" value={inputs.mortgageYearsRemaining} onChange={(v) => setInput("mortgageYearsRemaining", v)} />
            <Field
              label="TPMG/employer coverage"
              value={inputs.employerCoverageAmount}
              onChange={(v) => setInput("employerCoverageAmount", v)}
              prefix="$"
              step={100000}
              help="Nominal coverage amount deflated by death year for real-dollar sufficiency."
            />
            <Field
              label="Employer coverage end year"
              value={inputs.employerCoverageEndYear}
              onChange={(v) => setInput("employerCoverageEndYear", v)}
              help="Coverage applies through this model year, then drops to zero."
            />
            <Field
              label="SS covered earnings"
              value={inputs.socialSecurityCoveredAnnualEarnings}
              onChange={(v) => setInput("socialSecurityCoveredAnnualEarnings", v)}
              prefix="$"
              step={10000}
              help="Capped at the 2026 taxable maximum inside the model."
            />
            <div className="controlBlock">
              <span className="controlLabel">Social Security benefit</span>
              <Segmented<SocialSecurityBenefitMode>
                value={inputs.socialSecurityBenefitMode}
                onChange={(value) => setInput("socialSecurityBenefitMode", value)}
                options={[
                  { value: "proxy", label: "SSA proxy" },
                  { value: "manual", label: "Manual" }
                ]}
              />
            </div>
            {inputs.socialSecurityBenefitMode === "manual" ? (
              <Field
                label="Manual annual SS survivor benefit"
                value={inputs.manualAnnualSocialSecuritySurvivorBenefit}
                onChange={(v) =>
                  setInput("manualAnnualSocialSecuritySurvivorBenefit", Math.max(0, v))
                }
                prefix="$"
                step={1000}
                help="Annual total benefit while a child/caregiver beneficiary is eligible."
              />
            ) : null}
            <Field
              label="SS eligible children"
              value={inputs.socialSecurityEligibleChildren}
              onChange={(v) => setInput("socialSecurityEligibleChildren", v)}
            />
            <Field
              label="Youngest child age"
              value={inputs.youngestChildAge}
              onChange={(v) => setInput("youngestChildAge", v)}
            />
          </AccordionPanel>

          <AccordionPanel title="Premium pricing & solver weights" id="premium-pricing">
            <Segmented<PremiumWeightMode>
              value={inputs.premiumWeightMode}
              onChange={(value) => setInput("premiumWeightMode", value)}
              options={[
                { value: "quote-derived", label: "Quote-derived" },
                { value: "manual", label: "Manual" }
              ]}
            />
            {inputs.premiumWeightMode === "quote-derived" && (
              <div className="quoteWeightSummary">
                <span>Pricing anchor</span>
                <strong>{money(result.premiumPricingAnchor)}</strong>
                <small>
                  Relative weights from sample term quotes; validate with actual carrier quotes.
                </small>
              </div>
            )}
            {TERMS.map((term) => (
              <Field
                key={term}
                label={`${term}-year weight`}
                value={result.effectiveCostWeights[term]}
                onChange={(value) => setPremiumWeight(term, value)}
                step={0.1}
              />
            ))}
            <button
              type="button"
              className="secondaryButton fullWidthButton"
              onClick={() => setInput("premiumWeightMode", "quote-derived")}
            >
              <RefreshCcw size={16} /> Reset to quotes
            </button>
          </AccordionPanel>
        </aside>

        <section className="results">
          <section
            className={`panel${isCalculating ? " pendingSurface" : ""}`}
            id="report"
            aria-busy={isCalculating}
          >
            <div className="panelHeader">
              <div>
                <h2>Need and Coverage by Year</h2>
                <span>Real present-year dollars; graph reflects the selected base-case mortgage strategy.</span>
              </div>
              <div className="chartActions">
                <PendingBadge active={isCalculating} />
                <Segmented<"chart" | "table">
                  value={needCoverageView}
                  onChange={setNeedCoverageView}
                  options={[
                    { value: "chart", label: "Chart" },
                    { value: "table", label: "Table" }
                  ]}
                />
              </div>
            </div>
            {needCoverageView === "chart" ? (
              <Chart rows={result.rows} />
            ) : (
              <NeedCoverageTable rows={result.rows} />
            )}
          </section>

          <section className={`panel${isCalculating ? " pendingSurface" : ""}`} aria-busy={isCalculating}>
            <div className="panelHeader">
              <div>
                <h2>Scenario Matrix</h2>
                <span>Primary quote estimate uses the selected mortgage strategy; comparison shows payoff, paydown plus remaining payments, and continuing payments.</span>
              </div>
              <PendingBadge active={isCalculating} />
            </div>
            <div className="tableWrap scenarioTable">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Return</th>
                    <th>Employer credit</th>
                    <th>SS credit</th>
                    <th>Current group</th>
                    <th>Credited group</th>
                    <th>Personal term</th>
                    <th>Total modeled</th>
                    <th>Shortfall/surplus</th>
                    <th>Mortgage strategy</th>
                    <th>Payoff / paydown / keep payments</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarioMatrix.map((scenario) => {
                    const payoff = scenario.mortgageStrategyComparison.find(
                      (item) => item.strategy === "payoff_at_death"
                    );
                    const partial = scenario.mortgageStrategyComparison.find(
                      (item) => item.strategy === "partial_paydown"
                    );
                    const continuePayments = scenario.mortgageStrategyComparison.find(
                      (item) => item.strategy === "continue_monthly_payments"
                    );
                    return (
                      <tr key={scenario.id}>
                        <td>{scenario.label}</td>
                        <td>{percentFormatter.format(scenario.realReturn)}</td>
                        <td>{employerScenarioCreditText(scenario)}</td>
                        <td>{percentFormatter.format(scenario.socialSecurityCreditFactor)}</td>
                        <td>{money(scenario.currentEmployerGroupCoverage)}</td>
                        <td>{money(scenario.creditedEmployerGroupCoverage)}</td>
                        <td>{money(scenario.personallyOwnedTermCoverage)}</td>
                        <td>{money(scenario.totalModeledCoverage)}</td>
                        <td>
                          {scenario.estimatedShortfall > 0
                            ? `${money(scenario.estimatedShortfall)} short`
                            : `${money(scenario.estimatedSurplus)} surplus`}
                        </td>
                        <td>{mortgageStrategyLabel(scenario.mortgageStrategy)}</td>
                        <td>
                          {money(payoff?.totalInitialCoverage ?? 0)} /{" "}
                          {money(partial?.totalInitialCoverage ?? 0)} /{" "}
                          {money(continuePayments?.totalInitialCoverage ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`panel ladderPanel${isCalculating ? " pendingSurface" : ""}`} aria-busy={isCalculating}>
            <div className="panelHeader">
              <h2>Suggested quote ladder</h2>
              <a className="secondaryButton" href="#premium-pricing">Edit weights</a>
            </div>
            <div className="tableWrap ladderTable">
              <table>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Nominal face amount</th>
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
                      <td>{activeYearsLabel(policy.termYears)}</td>
                      <td>{policy.costWeight.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total initial face amount</td>
                    <td>{money(totalPersonalCoverage)}</td>
                    <td colSpan={3}>Max real undercoverage, years 0-29</td>
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

          <section className={`panel${isCalculating ? " pendingSurface" : ""}`} aria-busy={isCalculating}>
            <div className="panelHeader">
              <h2>Capital Sufficiency</h2>
              <div className="headerStatus">
                <span>Real present-year dollars</span>
                <PendingBadge active={isCalculating} />
              </div>
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
                <small>Term-covered years 0-29</small>
              </article>
              <article>
                <span>Year 0 supply</span>
                <strong>{money(firstRow?.capitalSupply ?? 0)}</strong>
                <small>Grouped offsets + credited employer + personal coverage</small>
              </article>
              <article>
                <span>Durable assets</span>
                <strong>{money(firstRow?.liquidAssets ?? 0)}</strong>
                <small>Cash and taxable investments</small>
              </article>
              <article>
                <span>Retirement after haircut</span>
                <strong>{money(firstRow?.retirementAssetsAfterHaircut ?? 0)}</strong>
                <small>Beneficiary-accessible estimate</small>
              </article>
              <article>
                <span>Employer credit</span>
                <strong>{money(firstRow?.creditedEmployerCoverage ?? 0)}</strong>
                <small>{inputs.includeEmployerCoverage ? `${employerCreditPercent} of group coverage` : "Excluded"}</small>
              </article>
              <article>
                <span>Pension / survivor benefits</span>
                <strong>{money((firstRow?.pensionTaxAdjustedValue ?? 0) + (firstRow?.creditedSocialSecuritySurvivorPv ?? 0))}</strong>
                <small>Pension PV plus credited Social Security</small>
              </article>
              <article>
                <span>Year 0 demand</span>
                <strong>{money(firstRow?.capitalDemand ?? 0)}</strong>
                <small>Spending, support, mortgage, less SS credit</small>
              </article>
            </div>
          </section>

          <div className={isCalculating ? "pendingSurface" : undefined} aria-busy={isCalculating}>
            <MethodologyPanel inputs={inputs} result={result} isPending={isCalculating} />
          </div>

          <section className={`panel${isCalculating ? " pendingSurface" : ""}`} aria-busy={isCalculating}>
            <div className="panelHeader">
              <h2>Printable Report Preview</h2>
              <div className="headerStatus">
                <PendingBadge active={isCalculating} />
                <button type="button" className="secondaryButton" onClick={() => window.print()}>
                  <Download size={16} /> Print
                </button>
              </div>
            </div>
            <div className="reportMeta">
              <span>Selected target: {inputs.selectedNeedBasis}</span>
              <span>Employer coverage: {inputs.includeEmployerCoverage ? `${employerCreditPercent} credited` : "excluded"}</span>
              <span>Survivor pension: {inputs.includeSurvivorPension ? "included" : "excluded"}</span>
              <span>Mortgage: {mortgageStrategyLabel(inputs.mortgageStrategy)}</span>
              <span>Weighted face amount: {money(result.weightedFaceAmount)}</span>
              <span>College: {inputs.collegeFundingMode}</span>
              <span>Social Security: {inputs.socialSecurityBenefitMode}</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Net need</th>
                    <th>Durable assets</th>
                    <th>Retirement offset</th>
                    <th>SS credit</th>
                    <th>Pension PV</th>
                    <th>Employer credit</th>
                    <th>Personal ladder</th>
                    <th>Under</th>
                    <th>Over</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.year}>
                      <td>{row.year}</td>
                      <td>{money(row.spendingNetNeedReal)}</td>
                      <td>{money(row.liquidAssets)}</td>
                      <td>{money(row.retirementAssetsAfterHaircut)}</td>
                      <td>{money(row.creditedSocialSecuritySurvivorPv)}</td>
                      <td>{money(row.pensionTaxAdjustedValue)}</td>
                      <td>{money(row.creditedEmployerCoverage)}</td>
                      <td>{money(row.realPersonalCoverage)}</td>
                      <td>{money(row.undercoverage)}</td>
                      <td>{money(row.overcoverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
        <aside className="decisionRail" aria-label="Assumptions and methodology summary">
          <AssumptionChecklist inputs={inputs} result={result} isPending={isCalculating} />
          <MiniTrace row={firstRow} isPending={isCalculating} />
          <section className={`railPanel sourcePanel${isCalculating ? " pendingSurface" : ""}`} aria-busy={isCalculating}>
            <div className="railHeader">
              <span className="railIcon"><Info size={16} /></span>
              <div>
                <h2>Source notes</h2>
                <p>Current model metadata.</p>
              </div>
              <PendingBadge active={isCalculating} />
            </div>
            <ul>
              <li>Detailed SSA 2026 source metadata is listed in Methodology.</li>
              <li>Quote weights are approximate and should be checked against actual quotes.</li>
              <li>{residualAfter30 ? "Residual need remains after the 30-year window." : "No residual post-30 warning in the current model."}</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
