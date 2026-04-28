import { describe, expect, it } from "vitest";
import { defaultInputs } from "./defaults";
import {
  buildBaseNeedRows,
  calculateLadder,
  childYearsUntilYoungest18,
  effectiveRetirementTaxHaircut,
  fisherRealRate,
  presentValueAnnuity,
  remainingMortgagePrincipal
} from "./model";

describe("life insurance model", () => {
  it("calculates the Fisher real discount rate", () => {
    expect(fisherRealRate(0.05, 0.025)).toBeCloseTo(0.02439024, 6);
  });

  it("amortizes mortgage principal to zero at term end", () => {
    expect(remainingMortgagePrincipal(500000, 0.06, 15, 15)).toBe(0);
    expect(remainingMortgagePrincipal(500000, 0.06, 15, 10)).toBeGreaterThan(0);
  });

  it("uses real growth rates for liquid and retirement assets", () => {
    const result = buildBaseNeedRows({
      ...defaultInputs,
      currentLiquidAssets: 100000,
      annualNonRetirementSavings: 10000,
      nominalAssetGrowthRate: 0.06,
      currentRetirementAssets: 200000,
      annualRetirementSavings: 72000,
      nominalRetirementGrowthRate: 0.06,
      inflationRate: 0.03
    });
    const row = result.rows[1];
    expect(result.realAssetGrowthRate).toBeCloseTo((1.06 / 1.03) - 1, 8);
    expect(row.liquidAssets).toBeCloseTo(100000 * (1.06 / 1.03) + 10000, 0);
    expect(row.retirementAssetsBeforeHaircut).toBeCloseTo(
      200000 * (1.06 / 1.03) + 72000,
      0
    );
  });

  it("spending PV uses spouse longevity while income PV ends at insured retirement", () => {
    const inputs = {
      ...defaultInputs,
      insuredAge: 32,
      spouseAge: 25,
      retirementAge: 60,
      survivingSpouseLongevityAge: 95,
      monthlyHouseholdNeedExcludingMortgage: 12000,
      survivingSpouseIncome: 0
    };
    const result = buildBaseNeedRows(inputs);
    const row = result.rows[0];

    expect(row.incomePvNeed).toBeCloseTo(
      presentValueAnnuity(600000, 28, result.realDiscountRate),
      0
    );
    expect(row.spendingPvNeed).toBeCloseTo(
      presentValueAnnuity(144000, 70, result.realDiscountRate),
      0
    );
  });

  it("applies the weighted pre-tax and post-tax retirement haircut", () => {
    const inputs = {
      ...defaultInputs,
      preTaxRetirementShare: 0.6,
      preTaxRetirementHaircut: 0.25,
      postTaxRetirementHaircut: 0.05
    };
    const row = buildBaseNeedRows({
      ...inputs
    }).rows[0];
    const haircut = effectiveRetirementTaxHaircut(inputs);

    expect(haircut).toBeCloseTo(0.17, 8);
    expect(row.retirementAssetsAfterHaircut).toBeCloseTo(
      row.retirementAssetsBeforeHaircut * (1 - haircut),
      0
    );
  });

  it("spouse income reduces spending need while zero preserves baseline", () => {
    const noOffset = buildBaseNeedRows({
      ...defaultInputs,
      selectedNeedBasis: "spending",
      survivingSpouseIncome: 0
    }).rows[0].spendingPvNeed;
    const withOffset = buildBaseNeedRows({
      ...defaultInputs,
      selectedNeedBasis: "spending",
      survivingSpouseIncome: 60000
    }).rows[0].spendingPvNeed;

    expect(withOffset).toBeLessThan(noOffset);
  });

  it("interprets planned child birth offsets relative to today", () => {
    expect(
      childYearsUntilYoungest18({
        ...defaultInputs,
        children: [{ id: "planned", label: "Planned", birthYearOffset: 3 }]
      })
    ).toBe(21);
  });

  it("keeps employer coverage static then drops after the configured end year", () => {
    const rows = buildBaseNeedRows({
      ...defaultInputs,
      annualIncome: 100000,
      employerSalaryMultiplier: 3,
      employerCoverageEndYear: 5,
      includeEmployerCoverage: true
    }).rows;
    expect(rows[0].employerCoverage).toBe(300000);
    expect(rows[5].employerCoverage).toBe(300000);
    expect(rows[6].employerCoverage).toBe(0);
  });

  it("capital sufficiency gap equals assets plus insurance minus mortgage and spending demand", () => {
    const result = calculateLadder(defaultInputs);
    const row = result.rows[0];

    expect(row.capitalGap).toBeCloseTo(
      row.accessibleAssets +
        row.totalCoverage -
        row.mortgagePrincipal -
        row.spendingPvNeed,
      0
    );
    expect(result.capitalSufficiency.worstGap).toBe(
      Math.min(...result.rows.slice(0, 31).map((yearRow) => yearRow.capitalGap))
    );
  });

  it("solves feasible years within 0-30 and warns for residual after year 30", () => {
    const result = calculateLadder({
      ...defaultInputs,
      insuredAge: 30,
      retirementAge: 67,
      includeEmployerCoverage: false,
      currentLiquidAssets: 0,
      annualNonRetirementSavings: 0,
      currentRetirementAssets: 0,
      annualRetirementSavings: 0,
      maxCoveragePerTerm: 20000000
    });
    const underCoveredInWindow = result.rows
      .filter((row) => row.year < 30)
      .some((row) => row.undercoverage > 1);

    expect(underCoveredInWindow).toBe(false);
    expect(result.warnings.some((warning) => warning.kind === "residual-after-30")).toBe(
      true
    );
  });

  it("cost weights affect ladder ranking", () => {
    const lowLongTermCost = calculateLadder({
      ...defaultInputs,
      includeEmployerCoverage: false,
      costWeights: { 10: 10, 15: 10, 20: 10, 30: 1 }
    });
    const highLongTermCost = calculateLadder({
      ...defaultInputs,
      includeEmployerCoverage: false,
      costWeights: { 10: 1, 15: 1.4, 20: 2.2, 30: 10 }
    });
    const amount30LowCost =
      lowLongTermCost.policies.find((policy) => policy.termYears === 30)?.amount ?? 0;
    const amount30HighCost =
      highLongTermCost.policies.find((policy) => policy.termYears === 30)?.amount ?? 0;

    expect(amount30LowCost).toBeGreaterThanOrEqual(amount30HighCost);
  });
});
