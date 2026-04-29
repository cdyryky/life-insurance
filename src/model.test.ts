import { describe, expect, it } from "vitest";
import { defaultInputs } from "./defaults";
import {
  buildBaseNeedRows,
  calculateLadder,
  calculateSurvivorPensionValue,
  effectiveRetirementTaxHaircut,
  fisherRealRate,
  pensionAccrualPercent,
  presentValueAnnuity,
  remainingMortgagePrincipal
} from "./model";

describe("life insurance model", () => {
  const realDiscountRateFor = (inputs: typeof defaultInputs) =>
    fisherRealRate(inputs.nominalDiscountRate, inputs.inflationRate);

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
    const row1 = result.rows[1];
    const row2 = result.rows[2];
    const realAssetGrowthFactor = 1.06 / 1.03;
    const realRetirementGrowthFactor = 1.06 / 1.03;
    const liquidYear1 =
      100000 * realAssetGrowthFactor + 10000 / Math.pow(1.03, 0);
    const liquidYear2 =
      liquidYear1 * realAssetGrowthFactor + 10000 / Math.pow(1.03, 1);
    const retirementYear1 =
      200000 * realRetirementGrowthFactor + 72000 / Math.pow(1.03, 0);
    const retirementYear2 =
      retirementYear1 * realRetirementGrowthFactor + 72000 / Math.pow(1.03, 1);

    expect(result.realAssetGrowthRate).toBeCloseTo((1.06 / 1.03) - 1, 8);
    expect(row1.liquidAssets).toBeCloseTo(liquidYear1, 0);
    expect(row2.liquidAssets).toBeCloseTo(liquidYear2, 0);
    expect(row1.retirementAssetsBeforeHaircut).toBeCloseTo(retirementYear1, 0);
    expect(row2.retirementAssetsBeforeHaircut).toBeCloseTo(retirementYear2, 0);
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
    expect(row.selectedPvNeed).toBeCloseTo(row.spendingPvNeed, 0);
  });

  it("selects the chosen need basis without a dependent floor override", () => {
    const incomeRow = buildBaseNeedRows({
      ...defaultInputs,
      selectedNeedBasis: "income"
    }).rows[0];
    const spendingRow = buildBaseNeedRows({
      ...defaultInputs,
      selectedNeedBasis: "spending"
    }).rows[0];

    expect(incomeRow.selectedPvNeed).toBeCloseTo(incomeRow.incomePvNeed, 0);
    expect(spendingRow.selectedPvNeed).toBeCloseTo(spendingRow.spendingPvNeed, 0);
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

  it("calculates pension accrual percentages by service year", () => {
    expect(pensionAccrualPercent(0)).toBe(0);
    expect(pensionAccrualPercent(5)).toBeCloseTo(0.1, 8);
    expect(pensionAccrualPercent(10)).toBeCloseTo(0.2, 8);
    expect(pensionAccrualPercent(20)).toBeCloseTo(0.4, 8);
    expect(pensionAccrualPercent(25)).toBeCloseTo(0.45, 8);
    expect(pensionAccrualPercent(30)).toBeCloseTo(0.5, 8);
  });

  it("zeros survivor pension value before vesting", () => {
    const pension = calculateSurvivorPensionValue({
      ...defaultInputs,
      pensionCurrentServiceYears: 4
    }, 0, realDiscountRateFor(defaultInputs));

    expect(pension.serviceYears).toBe(4);
    expect(pension.grossAnnualPension).toBe(0);
    expect(pension.taxAdjustedValue).toBe(0);
  });

  it("defers pre-55 survivor pension and discounts the real PV with the real rate", () => {
    const inputs = {
      ...defaultInputs,
      insuredAge: 40,
      spouseAge: 35,
      pensionCurrentServiceYears: 5,
      nominalDiscountRate: 0.05,
      pensionHac: 360000,
      pensionSurvivorFactor: 0.85,
      pensionTaxAdjustmentFactor: 0.85,
      pensionMinimumCommencementAge: 55,
      pensionNormalRetirementAge: 65,
      pensionEarlyReductionRate: 0.05
    };
    const realDiscountRate = realDiscountRateFor(inputs);
    const pension = calculateSurvivorPensionValue(inputs, 0, realDiscountRate);
    const grossAnnualPension = 36000;
    const survivorAnnualPension = grossAnnualPension * 0.85 * 0.5;
    const pvAtCommencement = presentValueAnnuity(
      survivorAnnualPension,
      45,
      realDiscountRate
    );
    const pvAtDeath = pvAtCommencement / Math.pow(1 + realDiscountRate, 15);

    expect(pension.commencementAge).toBe(55);
    expect(pension.defermentYears).toBe(15);
    expect(pension.paymentYears).toBe(45);
    expect(pension.earlyFactor).toBeCloseTo(0.5, 8);
    expect(pension.survivorAnnualPension).toBeCloseTo(survivorAnnualPension, 0);
    expect(pension.presentValue).toBeCloseTo(pvAtDeath, 0);
    expect(pension.taxAdjustedValue).toBeCloseTo(pvAtDeath * 0.85, 0);
  });

  it("applies early reduction between 55 and 65 and no reduction at or after 65", () => {
    const age60 = calculateSurvivorPensionValue({
      ...defaultInputs,
      insuredAge: 60,
      pensionCurrentServiceYears: 20
    }, 0, realDiscountRateFor(defaultInputs));
    const age65 = calculateSurvivorPensionValue({
      ...defaultInputs,
      insuredAge: 65,
      pensionCurrentServiceYears: 20
    }, 0, realDiscountRateFor(defaultInputs));

    expect(age60.defermentYears).toBe(0);
    expect(age60.earlyFactor).toBeCloseTo(0.75, 8);
    expect(age65.earlyFactor).toBe(1);
  });

  it("returns zero pension PV when the spouse has no payment horizon", () => {
    const pension = calculateSurvivorPensionValue({
      ...defaultInputs,
      spouseAge: 95,
      survivingSpouseLongevityAge: 95,
      pensionCurrentServiceYears: 20
    }, 0, realDiscountRateFor(defaultInputs));

    expect(pension.paymentYears).toBe(0);
    expect(pension.presentValue).toBe(0);
    expect(pension.taxAdjustedValue).toBe(0);
  });

  it("survivor pension lowers need and contributes to capital supply", () => {
    const withoutPension = calculateLadder({
      ...defaultInputs,
      includeSurvivorPension: false,
      pensionCurrentServiceYears: 20
    });
    const withPension = calculateLadder({
      ...defaultInputs,
      includeSurvivorPension: true,
      pensionCurrentServiceYears: 20
    });

    expect(withPension.rows[0].pensionTaxAdjustedValue).toBeGreaterThan(0);
    expect(withPension.rows[0].grossNeed).toBeLessThan(withoutPension.rows[0].grossNeed);
    expect(withPension.rows[0].accessibleAssets).toBeCloseTo(
      withoutPension.rows[0].accessibleAssets +
        withPension.rows[0].pensionTaxAdjustedValue,
      0
    );
    expect(withPension.weightedFaceAmount).toBeLessThan(withoutPension.weightedFaceAmount);
  });

  it("keeps employer coverage static then drops after the configured end year", () => {
    const rows = buildBaseNeedRows({
      ...defaultInputs,
      annualIncome: 100000,
      employerCoverageAmount: 300000,
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
