import { useMemo, useState } from "react";
import type { CalculatorInputs, CalculatorResult, YearlyRow } from "../types";
import { SOCIAL_SECURITY_2026_SOURCE_NOTES } from "../model";

type MethodologyPanelProps = {
  inputs: CalculatorInputs;
  result: CalculatorResult;
  isPending?: boolean;
};

type MethodologyTab = "overview" | "needs" | "offsets" | "solver" | "limits";

const tabs: { id: MethodologyTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "needs", label: "Needs" },
  { id: "offsets", label: "Offsets" },
  { id: "solver", label: "Ladder Solver" },
  { id: "limits", label: "Warnings & Limits" }
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2
});

function money(value: number) {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return currencyFormatter.format(value);
}

function percent(value: number) {
  return percentFormatter.format(value);
}

function Formula({ children }: { children: string }) {
  return <code className="methodologyFormula">{children}</code>;
}

function MetricCard({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function TraceRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="traceRow">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function FieldFormula({
  name,
  formula,
  explanation
}: {
  name: string;
  formula: string;
  explanation: string;
}) {
  return (
    <article className="formulaCard">
      <h4>{name}</h4>
      <Formula>{formula}</Formula>
      <p>{explanation}</p>
    </article>
  );
}

function firstExistingRow(rows: YearlyRow[], index: number) {
  return rows[index] ?? rows[0];
}

export function MethodologyPanel({
  inputs,
  result,
  isPending = false
}: MethodologyPanelProps) {
  const [activeTab, setActiveTab] = useState<MethodologyTab>("overview");
  const year0 = firstExistingRow(result.rows, 0);
  const worstGapRow = useMemo(
    () => firstExistingRow(result.rows, result.capitalSufficiency.worstGapYear),
    [result.rows, result.capitalSufficiency.worstGapYear]
  );
  const residualWarning = result.warnings.some(
    (warning) => warning.kind === "residual-after-30"
  );
  const infeasibleWarning = result.warnings.some(
    (warning) => warning.kind === "infeasible-cap"
  );
  const totalPersonalCoverage = result.policies.reduce(
    (sum, policy) => sum + policy.amount,
    0
  );

  const scenarioMetrics = (
    <div className="methodologyMetrics">
      <MetricCard
        label="Inflation"
        value={percent(inputs.inflationRate)}
        note="Used to convert nominal dollars into real present-year dollars."
      />
      <MetricCard
        label="Pension nominal discount"
        value={percent(inputs.nominalDiscountRate)}
        note="Used only for the optional fixed-nominal pension."
      />
      <MetricCard
        label="Real discount"
        value={percent(result.realDiscountRate)}
        note="Selected base scenario rate used for monthly real spending PV."
      />
      <MetricCard
        label="Coverage increment"
        value={money(inputs.coverageIncrement)}
        note="Nominal coverage is rounded up to this step."
      />
      <MetricCard
        label="Max per term"
        value={money(inputs.maxCoveragePerTerm)}
        note="Per-policy cap used by the solver."
      />
      <MetricCard
        label="Worst capital gap"
        value={money(result.capitalSufficiency.worstGap)}
        note={`Year ${result.capitalSufficiency.worstGapYear}.`}
      />
    </div>
  );

  const year0Trace = (
    <div className="methodologyTrace">
      <div>
        <h4>Current scenario, year 0</h4>
        <p>
          This traces the main spending-basis ledger from need to personal term
          coverage. Values are in real present-year dollars unless labeled nominal.
        </p>
      </div>
      <TraceRow label="spendingPvNeed" value={money(year0.spendingPvNeed)} />
      <TraceRow
        label="realMortgageDemand"
        value={money(year0.realMortgageDemand)}
        note={`${year0.selectedMortgageStrategy === "payoff_at_death" ? "Pay off mortgage" : year0.selectedMortgageStrategy === "partial_paydown" ? "Pay down mortgage and keep payments on unpaid balance" : "Keep payments"} strategy selected.`}
      />
      <TraceRow
        label="childcareHouseholdSupportPv"
        value={money(year0.childcareHouseholdSupportPv)}
      />
      <TraceRow label="collegeFundingPv" value={money(year0.collegeFundingPv)} />
      <TraceRow label="otherImmediateNeedsReal" value={money(year0.otherImmediateNeedsReal)} />
      <TraceRow
        label="creditedSocialSecuritySurvivorPv"
        value={money(year0.creditedSocialSecuritySurvivorPv)}
      />
      <TraceRow
        label="spendingDemandReal"
        value={money(year0.spendingDemandReal)}
        note="Monthly household spending + immediate obligations + mortgage, less verified Social Security."
      />
      <TraceRow
        label="durableAssets"
        value={money(year0.liquidAssets)}
        note="Cash and taxable investments."
      />
      <TraceRow
        label="retirementAssetsAfterHaircut"
        value={money(year0.retirementAssetsAfterHaircut)}
        note="Retirement assets after beneficiary/tax haircut."
      />
      <TraceRow
        label="pensionTaxAdjustedValue"
        value={money(year0.pensionTaxAdjustedValue)}
        note="Survivor pension value, only when included."
      />
      <TraceRow label="creditedEmployerCoverage" value={money(year0.creditedEmployerCoverage)} />
      <TraceRow
        label="spendingNetNeedReal"
        value={money(year0.spendingNetNeedReal)}
        note="Real personal insurance need after accessible assets; employer coverage is supplemental only."
      />
      <TraceRow
        label="nominalRequiredCoverage"
        value={money(year0.nominalRequiredCoverage)}
        note="Rounded nominal face amount needed for this death year."
      />
    </div>
  );

  return (
    <section className="panel methodologyPanel" id="methodology">
      <div className="panelHeader methodologyHeader">
        <div>
          <span className="eyeline">Methodology</span>
          <h2>Math and logic behind the quote estimate</h2>
        </div>
        <span>
          {isPending
            ? "Showing prior values while the calculator updates"
            : "Live values from the current assumptions"}
        </span>
      </div>

      <div className="methodologyTabs" role="tablist" aria-label="Methodology sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`methodology-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`methodology-panel-${tab.id}`}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`methodology-panel-${activeTab}`}
        className="methodologyContent"
        role="tabpanel"
        aria-labelledby={`methodology-tab-${activeTab}`}
      >
        {activeTab === "overview" ? (
          <>
            <div className="methodologyIntro">
              <h3>What the model is solving</h3>
              <p>
                The calculator asks whether the survivor has enough real capital at
                each modeled death year. Capital supply is durable assets,
                retirement assets after haircut, survivor pension value, and the
                personal term ladder. Employer coverage is displayed separately. Capital
                demand is household spending need plus discrete support liabilities
                and selected mortgage demand, reduced by credited Social Security.
              </p>
              <p>
                Income PV is shown as a comparison and sensitivity. The suggested quote
                ladder is solved against spending-basis capital sufficiency.
              </p>
            </div>
            {scenarioMetrics}
            <div className="methodologyGrid">
              <FieldFormula
                name="Real-dollar convention"
                formula="realCoverageAtYear = nominalAmount / (1 + inflationRate) ^ year"
                explanation="Future nominal benefits are deflated so the chart can compare all years in today's purchasing power."
              />
              <FieldFormula
                name="Independent return assumptions"
                formula="spending uses scenarioRealDiscount; assets use (1 + nominalGrowth) / (1 + inflation) - 1"
                explanation="The 1%/3%/4% spending discount scenarios no longer overwrite liquid-asset or retirement-account growth."
              />
              <FieldFormula
                name="Capital sufficiency"
                formula="capitalGap = capitalSupply - capitalDemand"
                explanation="A negative gap means the modeled capital supply is short for that death year."
              />
            </div>
            <div className="methodologyNote">
              <strong>What to quote:</strong> the suggested policy amounts are
              nominal face amounts to quote. The sufficiency chart converts
              those nominal benefits into real present-year dollars at each death year.
            </div>
          </>
        ) : null}

        {activeTab === "needs" ? (
          <>
            {year0Trace}
            <div className="methodologyGrid">
              <FieldFormula
                name="incomePvNeed"
                formula="presentValueAnnuity(annualIncome, remainingIncomeYears, realDiscountRate)"
                explanation="Income PV estimates the real capital needed to replace the insured person's income until retirement."
              />
              <FieldFormula
                name="spendingPvNeed"
                formula="sum(monthly spending - earned income - retirement income, discounted monthly)"
                explanation="Monthly survivor cash flows run to the spouse longevity age, with explicit earned-income and retirement-income phases."
              />
              <FieldFormula
                name="spendingDemandReal"
                formula="spendingDemandReal = spending + immediate obligations + mortgage - verifiedSocialSecurity"
                explanation="Childcare is already included in the monthly spending input, college is excluded, and only verified SSA Statement amounts can reduce the recommendation."
              />
              <FieldFormula
                name="nominalRequiredCoverage"
                formula="ceil(exactNominalCoverageRequired / coverageIncrement) * coverageIncrement"
                explanation="The real term need is inflated back into nominal face amount and rounded up to the entered increment."
              />
            </div>
          </>
        ) : null}

        {activeTab === "offsets" ? (
          <>
            <div className="methodologyGrid">
              <FieldFormula
                name="liquidAssets"
                formula="accumulateRealAssets(currentLiquidAssets, annualNonRetirementSavings, realAssetGrowthRate, year)"
                explanation="Liquid assets grow at the Fisher-adjusted real asset growth rate with constant real-dollar contributions."
              />
              <FieldFormula
                name="retirementAssetsAfterHaircut"
                formula="retirementAssetsBeforeHaircut * (1 - effectiveRetirementTaxHaircut)"
                explanation="The haircut blends the pre-tax and post-tax shares to estimate beneficiary-accessible retirement capital."
              />
              <FieldFormula
                name="pensionTaxAdjustedValue"
                formula="pensionTaxAdjustedValueNominal / (1 + inflationRate) ^ year"
                explanation="The survivor pension is valued as a fixed nominal annuity, tax adjusted, then converted to real dollars."
              />
              <FieldFormula
                name="spendingNetNeedReal"
                formula="max(0, spendingNeedAfterAssetsReal - creditedEmployerCoverage)"
                explanation="Durable assets, retirement assets, pension value, verified Social Security, and supplemental employer coverage remain visibly separate."
              />
            </div>
            <div className="methodologyMetrics">
              <MetricCard
                label="Durable assets"
                value={money(year0.liquidAssets)}
                note="Cash and taxable investments."
              />
              <MetricCard
                label="Retirement offset"
                value={money(year0.retirementAssetsAfterHaircut)}
                note="After beneficiary/tax haircut."
              />
              <MetricCard
                label="Retirement haircut"
                value={percent(result.effectiveRetirementTaxHaircut)}
                note="Weighted by pre-tax retirement share."
              />
              <MetricCard
                label="Pension PV"
                value={money(year0.pensionTaxAdjustedValue)}
                note={`${inputs.includeSurvivorPension ? "Included" : "Excluded"} in current scenario.`}
              />
              <MetricCard
                label="Employer supplemental"
                value={money(year0.realEmployerCoverage)}
                note="Displayed separately; 0% reduces personally owned coverage."
              />
            </div>
          </>
        ) : null}

        {activeTab === "solver" ? (
          <>
            <div className="methodologyIntro">
              <h3>How the ladder is chosen</h3>
              <p>
                The solver starts with the peak requirement in years 20-29 for the
                30-year layer, then adds 20-, 15-, and 10-year layers only where the
                earlier time buckets require more coverage. Every layer is rounded up
                to the entered increment and checked across death years 0-29.
              </p>
            </div>
            <div className="policyMethodGrid">
              {result.policies.map((policy) => (
                <article key={policy.termYears}>
                  <span>{policy.termYears}-year term</span>
                  <strong>{money(policy.amount)}</strong>
                  <small>
                    Active years 0-{policy.termYears - 1}; need-matched layer
                  </small>
                </article>
              ))}
            </div>
            <div className="methodologyGrid">
              <FieldFormula
                name="coverageAtYear"
                formula="sum(policy.amount when year < policy.termYears)"
                explanation="A 10-year policy covers years 0-9, 15-year covers 0-14, 20-year covers 0-19, and 30-year covers 0-29."
              />
              <FieldFormula
                name="needMatchedLayers"
                formula="30yr = peak Y20-29; then add 20yr, 15yr, and 10yr amounts for earlier buckets"
                explanation="The recommendation follows the duration of the modeled need and does not use stale sample premiums."
              />
            </div>
            <div className="methodologyMetrics compact">
              <MetricCard
                label="Total initial face amount"
                value={money(totalPersonalCoverage)}
                note="Sum of nominal policy amounts to quote."
              />
            </div>
          </>
        ) : null}

        {activeTab === "limits" ? (
          <>
            <div className="methodologyGrid">
              <article className="formulaCard">
                <h4>Live warning status</h4>
                <ul>
                  <li>Residual need after year 30: {residualWarning ? "Yes" : "No"}</li>
                  <li>Per-term maximum infeasible: {infeasibleWarning ? "Yes" : "No"}</li>
                  <li>
                    Selected display basis: {inputs.selectedNeedBasis}; solver basis:
                    spending capital sufficiency.
                  </li>
                  <li>College funding: excluded from the recommendation.</li>
                  <li>Social Security: {inputs.socialSecurityStatementVerified ? "verified Statement amounts credited" : "zero credit until verified"}.</li>
                </ul>
              </article>
              <article className="formulaCard">
                <h4>Worst-gap trace</h4>
                <ul>
                  <li>Year: {worstGapRow.year}</li>
                  <li>capitalDemand: {money(worstGapRow.capitalDemand)}</li>
                  <li>capitalSupply: {money(worstGapRow.capitalSupply)}</li>
                  <li>capitalGap: {money(worstGapRow.capitalGap)}</li>
                </ul>
              </article>
              <article className="formulaCard">
                <h4>SSA 2026 source metadata</h4>
                <ul>
                  {SOCIAL_SECURITY_2026_SOURCE_NOTES.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                  <li><a href="https://www.ssa.gov/faqs/en/questions/KA-01741.html" target="_blank" rel="noreferrer">Personalized Social Security Statement</a></li>
                  <li><a href="https://www.ssa.gov/OACT/COLA/Benefits.html" target="_blank" rel="noreferrer">SSA AIME and benefit calculation</a></li>
                  <li><a href="https://www.ssa.gov/survivor/amount" target="_blank" rel="noreferrer">SSA survivor benefit amounts</a></li>
                </ul>
              </article>
              <article className="formulaCard">
                <h4>Tax source metadata</h4>
                <ul>
                  <li><a href="https://www.irs.gov/faqs/interest-dividends-other-types-of-income/life-insurance-disability-insurance-proceeds/life-insurance-disability-insurance-proceeds" target="_blank" rel="noreferrer">IRS: life-insurance proceeds</a></li>
                  <li><a href="https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-beneficiary" target="_blank" rel="noreferrer">IRS: retirement-plan beneficiaries</a></li>
                </ul>
              </article>
            </div>
            <div className="methodologyColumns">
              <article>
                <h4>Specific caveats</h4>
                <ul>
                  <li>Not financial advice.</li>
                  <li>Does not model premium affordability or premium drag.</li>
                  <li>Does not model underwriting class differences.</li>
                  <li>The salary-based Social Security proxy is diagnostic only and never reduces the purchase target.</li>
                  <li>College funding is excluded from the insurance recommendation.</li>
                  <li>Pension is approximate and uses the entered HAC as a fixed nominal annuity base; leave it off unless vesting and survivor terms are confirmed.</li>
                  <li>Uses integer death years.</li>
                  <li>Term coverage is modeled through years 0-29.</li>
                  <li>Assumes contributions are constant real dollars.</li>
                  <li>Uses deterministic returns, not Monte Carlo.</li>
                </ul>
              </article>
              <article>
                <h4>Trust but verify</h4>
                <ol>
                  <li>Compare against the DIME method.</li>
                  <li>Compare against 10-15x income as an upper-bound screen.</li>
                  <li>Quote nearby rounded ladders, not just the exact output.</li>
                  <li>Employer group coverage is supplemental and receives zero credit against the personal target.</li>
                  <li>Re-run with conservative return and inflation assumptions.</li>
                </ol>
              </article>
            </div>
          </>
        ) : null}
      </div>

      <div className="methodologyPrintSummary" aria-hidden="true">
        <h3>Methodology summary</h3>
        <p>
          The ladder is solved against spending-basis capital sufficiency. Income PV
          is displayed as a sensitivity, but the solver uses spendingDemandReal,
          durable assets, retirement assets after haircut, pension value,
          creditedEmployerCoverage, and personal term coverage.
        </p>
        {year0Trace}
        <div className="methodologyGrid">
          <FieldFormula
            name="Core ledger"
            formula="capitalGap = capitalSupply - capitalDemand"
            explanation={`Worst gap is ${money(result.capitalSufficiency.worstGap)} in year ${result.capitalSufficiency.worstGapYear}.`}
          />
          <FieldFormula
            name="Nominal quote amounts"
            formula="nominalRequiredCoverage = ceil(exactNominalCoverageRequired / coverageIncrement) * coverageIncrement"
            explanation="Suggested policies are nominal face amounts; sufficiency displays them in real dollars by death year."
          />
        </div>
      </div>
    </section>
  );
}
