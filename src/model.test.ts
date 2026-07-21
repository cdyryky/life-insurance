import { describe, expect, it } from "vitest";
import { defaultInputs } from "./defaults";
import { activeYearsLabel } from "./format";
import {
  buildBaseNeedRows,
  calculateLadder,
  calculateSurvivorPensionValue,
  effectiveRetirementTaxHaircut,
  estimateAnnualSocialSecuritySurvivorBenefit,
  estimateSocialSecurityFamilyMaximum,
  estimateSocialSecurityPia,
  exactNominalCoverageRequired,
  fisherRealRate,
  inflationFactor,
  monthlyMortgagePayment,
  pensionAccrualPercent,
  presentValueAnnuity,
  presentValueFixedNominalMonthlyPayments,
  presentValueRemainingMortgagePayments,
  presentValueSurvivorSpending,
  realCoverageAtYear,
  remainingMortgagePrincipal,
  roundedNominalCoverageRequired,
  SOCIAL_SECURITY_2026_TAXABLE_MAXIMUM,
  solvePolicyLadder
} from "./model";
import type { YearlyRow } from "./types";

function testRow(year: number, nominalRequiredCoverage: number): YearlyRow {
  return {
    year,
    incomePvNeed: 0,
    childcareHouseholdSupportPv: 0,
    collegeFundingPv: 0,
    otherImmediateNeedsReal: 0,
    grossSocialSecuritySurvivorPv: 0,
    creditedSocialSecuritySurvivorPv: 0,
    spendingPvNeed: 0,
    selectedDisplayNeed: 0,
    incomeSensitivityNeed: 0,
    nominalMortgagePrincipal: 0,
    realMortgageDemand: 0,
    mortgagePayoffDemandReal: 0,
    mortgagePartialPaydownDemandReal: 0,
    mortgageContinuePaymentsDemandReal: 0,
    selectedMortgageStrategy: "payoff_at_death",
    realMortgagePrincipal: 0,
    liquidAssets: 0,
    retirementAssetsBeforeHaircut: 0,
    retirementAssetsAfterHaircut: 0,
    effectiveRetirementTaxHaircut: 0,
    pensionServiceYears: 0,
    pensionGrossAnnualPension: 0,
    pensionSurvivorAnnualPension: 0,
    pensionCommencementAge: 0,
    pensionDefermentYears: 0,
    pensionPaymentYears: 0,
    pensionEarlyFactor: 0,
    pensionPresentValueNominal: 0,
    pensionTaxAdjustedValueNominal: 0,
    pensionTaxAdjustedValue: 0,
    accessibleAssets: 0,
    spendingDemandReal: 0,
    spendingNeedAfterAssetsReal: 0,
    spendingNetNeedReal: 0,
    exactNominalCoverageRequired: nominalRequiredCoverage,
    nominalRequiredCoverage,
    realEmployerCoverage: 0,
    creditedEmployerCoverage: 0,
    nominalPersonalCoverage: 0,
    realPersonalCoverage: 0,
    personalLadderCoverage: 0,
    totalCoverage: 0,
    undercoverage: 0,
    overcoverage: 0,
    capitalSupply: 0,
    capitalDemand: 0,
    capitalGap: 0,
    capitalDeficit: 0
  };
}

function monthlyPv(amount: number, months: number, realRate: number) {
  const monthlyRate = Math.pow(1 + realRate, 1 / 12) - 1;
  let pv = 0;
  for (let month = 0; month < months; month += 1) {
    pv += amount / Math.pow(1 + monthlyRate, month);
  }
  return pv;
}

describe("life insurance model", () => {
  it("uses the locked planning defaults", () => {
    expect(defaultInputs.realReturnConservative).toBe(0.01);
    expect(defaultInputs.realReturnBaseCase).toBe(0.03);
    expect(defaultInputs.realReturnOptimistic).toBe(0.04);
    expect(defaultInputs.childcareHouseholdSupportAnnual).toBe(0);
    expect(defaultInputs.collegeFundingMode).toBe("excluded");
    expect(defaultInputs.employerCoverageCreditFactor).toBe(0);
    expect(defaultInputs.socialSecurityStatementVerified).toBe(false);
    expect(defaultInputs.childAges).toEqual([0]);
    expect(Object.values(defaultInputs.readinessChecks).every((value) => !value)).toBe(true);
  });

  it("formats policy windows as years 0 through term minus one", () => {
    expect(activeYearsLabel(10)).toBe("0-9");
    expect(activeYearsLabel(30)).toBe("0-29");
  });

  it("converts nominal and real rates and coverage consistently", () => {
    expect(fisherRealRate(0.05, 0.025)).toBeCloseTo(0.02439024, 6);
    expect(inflationFactor(0.025, 10)).toBeCloseTo(Math.pow(1.025, 10), 8);
    expect(realCoverageAtYear(2000000, 0.025, 30)).toBeCloseTo(953000, -3);
    expect(exactNominalCoverageRequired(100000, 0.025, 2)).toBeCloseTo(105062.5, 1);
    expect(roundedNominalCoverageRequired(100000, 0.025, 2, 100000)).toBe(200000);
  });

  it("values survivor spending monthly as an annuity due", () => {
    const inputs = {
      ...defaultInputs,
      spouseAge: 94,
      survivingSpouseLongevityAge: 95,
      monthlyHouseholdNeedExcludingMortgage: 10000,
      dependentDropOffAmount: 0,
      survivingSpouseIncome: 0,
      survivingSpouseRetirementIncome: 0
    };
    expect(presentValueSurvivorSpending(inputs, 0, 0.03)).toBeCloseTo(
      monthlyPv(10000, 12, 0.03),
      2
    );
  });

  it("stops earned income and starts retirement income at their configured ages", () => {
    const inputs = {
      ...defaultInputs,
      spouseAge: 64,
      survivingSpouseLongevityAge: 68,
      monthlyHouseholdNeedExcludingMortgage: 10000,
      dependentDropOffAmount: 0,
      survivingSpouseIncome: 60000,
      survivingSpouseIncomeEndAge: 65,
      survivingSpouseRetirementIncome: 24000,
      survivingSpouseRetirementIncomeStartAge: 67
    };
    const monthlyRate = Math.pow(1.03, 1 / 12) - 1;
    let expected = 0;
    for (let month = 0; month < 48; month += 1) {
      const deficit = month < 12 ? 5000 : month < 36 ? 10000 : 8000;
      expected += deficit / Math.pow(1 + monthlyRate, month);
    }
    expect(presentValueSurvivorSpending(inputs, 0, 0.03)).toBeCloseTo(expected, 2);
  });

  it("does not double count childcare when the separate input is zero", () => {
    const row = buildBaseNeedRows(defaultInputs).rows[0];
    expect(row.childcareHouseholdSupportPv).toBe(0);
    expect(row.spendingDemandReal).toBeCloseTo(
      row.spendingPvNeed + row.otherImmediateNeedsReal + row.realMortgageDemand,
      0
    );
  });

  it("adds immediate obligations dollar for dollar", () => {
    const without = buildBaseNeedRows({ ...defaultInputs, otherImmediateNeeds: 0 }).rows[0];
    const withNeeds = buildBaseNeedRows({ ...defaultInputs, otherImmediateNeeds: 125000 }).rows[0];
    expect(withNeeds.spendingDemandReal - without.spendingDemandReal).toBeCloseTo(125000, 2);
  });

  it("keeps the salary-based SSA proxy diagnostic and caps covered earnings", () => {
    const capped = estimateSocialSecurityPia(SOCIAL_SECURITY_2026_TAXABLE_MAXIMUM);
    expect(estimateSocialSecurityPia(600000)).toBeCloseTo(capped, 8);
    expect(estimateSocialSecurityFamilyMaximum(capped)).toBeGreaterThan(capped);
  });

  it("credits no Social Security until statement values are verified", () => {
    const inputs = {
      ...defaultInputs,
      socialSecurityChildMonthlyBenefit: 2000,
      socialSecurityCaregiverMonthlyBenefit: 2000,
      socialSecurityFamilyMaximumMonthlyBenefit: 3500
    };
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0)).toBe(0);
    expect(buildBaseNeedRows(inputs).rows[0].creditedSocialSecuritySurvivorPv).toBe(0);
  });

  it("applies child, caregiver, and family-maximum statement rules", () => {
    const inputs = {
      ...defaultInputs,
      socialSecurityStatementVerified: true,
      socialSecurityChildMonthlyBenefit: 2000,
      socialSecurityCaregiverMonthlyBenefit: 1800,
      socialSecurityFamilyMaximumMonthlyBenefit: 3500,
      childAges: [5, 17]
    };
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0)).toBe(3500 * 12);
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 11)).toBe(2000 * 12);
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 13)).toBe(0);
  });

  it("extends verified child benefits to age 19 only when selected", () => {
    const inputs = {
      ...defaultInputs,
      socialSecurityStatementVerified: true,
      socialSecurityChildMonthlyBenefit: 1500,
      childAges: [18]
    };
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0)).toBe(0);
    expect(estimateAnnualSocialSecuritySurvivorBenefit({
      ...inputs,
      socialSecurityChildSecondarySchoolToAge19: true
    }, 0)).toBe(18000);
  });

  it("amortizes mortgage principal and payments correctly", () => {
    expect(remainingMortgagePrincipal(500000, 0.06, 15, 15)).toBe(0);
    expect(remainingMortgagePrincipal(500000, 0.06, 15, 10)).toBeGreaterThan(0);
    expect(monthlyMortgagePayment(500000, 0, 10)).toBeCloseTo(500000 / 120, 8);
  });

  it("discounts fixed nominal mortgage payments at the nominal-equivalent rate", () => {
    const payment = 10000;
    const months = 180;
    const inflation = 0.025;
    const realRate = 0.03;
    const nominalRate = (1 + realRate) * (1 + inflation) - 1;
    const monthlyRate = Math.pow(1 + nominalRate, 1 / 12) - 1;
    const expected = payment * (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
    expect(presentValueFixedNominalMonthlyPayments(payment, months, 0, inflation, realRate)).toBeCloseTo(expected, 2);
    expect(presentValueRemainingMortgagePayments(1500000, 0.06, 15, 0, inflation, realRate)).toBeGreaterThan(0);
  });

  it("keeps asset growth separate from the spending discount rate", () => {
    const result = buildBaseNeedRows({
      ...defaultInputs,
      currentLiquidAssets: 100000,
      annualNonRetirementSavings: 10000,
      nominalAssetGrowthRate: 0.06,
      inflationRate: 0.03
    }, { realDiscountRateOverride: 0.01 });
    expect(result.realDiscountRate).toBe(0.01);
    expect(result.realAssetGrowthRate).toBeCloseTo(1.06 / 1.03 - 1, 8);
    expect(result.rows[1].liquidAssets).toBeCloseTo(100000 * (1.06 / 1.03) + 10000, 0);
  });

  it("applies the weighted retirement tax haircut", () => {
    const inputs = {
      ...defaultInputs,
      preTaxRetirementShare: 0.6,
      preTaxRetirementHaircut: 0.25,
      postTaxRetirementHaircut: 0.05
    };
    expect(effectiveRetirementTaxHaircut(inputs)).toBeCloseTo(0.17, 8);
    expect(buildBaseNeedRows(inputs).rows[0].retirementAssetsAfterHaircut).toBeCloseTo(83000, 0);
  });

  it("keeps pension excluded until explicitly enabled and vested", () => {
    expect(calculateSurvivorPensionValue(defaultInputs, 0, 0.05).taxAdjustedValue).toBe(0);
    expect(pensionAccrualPercent(20)).toBeCloseTo(0.4, 8);
    const included = calculateSurvivorPensionValue({
      ...defaultInputs,
      includeSurvivorPension: true,
      pensionCurrentServiceYears: 20
    }, 0, 0.05);
    expect(included.taxAdjustedValue).toBeGreaterThan(0);
  });

  it("never credits employer coverage against personally owned need", () => {
    const withGroup = calculateLadder({
      ...defaultInputs,
      employerCoverageAmount: 2000000,
      includeEmployerCoverage: true
    });
    const noGroup = calculateLadder({
      ...defaultInputs,
      employerCoverageAmount: 0,
      includeEmployerCoverage: false
    });
    expect(withGroup.rows[0].realEmployerCoverage).toBe(2000000);
    expect(withGroup.rows[0].creditedEmployerCoverage).toBe(0);
    expect(withGroup.totalInitialCoverage).toBe(noGroup.totalInitialCoverage);
  });

  it("excludes college from active recommendations even if dormant inputs change", () => {
    const base = calculateLadder(defaultInputs);
    const changed = calculateLadder({
      ...defaultInputs,
      collegeFundingMode: "included",
      annualCollegeFunding: 250000,
      collegeStartYear: 1,
      collegeEndYear: 25
    });
    expect(changed.rows.every((row) => row.collegeFundingPv === 0)).toBe(true);
    expect(changed.totalInitialCoverage).toBe(base.totalInitialCoverage);
  });

  it("constructs deterministic need-matched policy layers", () => {
    const requirements = Array.from({ length: 30 }, (_, year) => {
      if (year < 10) return 1000000;
      if (year < 15) return 700000;
      if (year < 20) return 500000;
      return 200000;
    });
    const solved = solvePolicyLadder(
      requirements.map((need, year) => testRow(year, need)),
      defaultInputs
    );
    expect(solved.amounts).toEqual({ 10: 300000, 15: 200000, 20: 300000, 30: 200000 });
    expect(solved.feasible).toBe(true);
  });

  it("rounds layers upward and reports an infeasible per-term cap", () => {
    const rounded = solvePolicyLadder(
      Array.from({ length: 30 }, (_, year) => testRow(year, year < 10 ? 150001 : 0)),
      { ...defaultInputs, coverageIncrement: 100000 }
    );
    expect(rounded.amounts[10]).toBe(200000);
    const capped = solvePolicyLadder(
      Array.from({ length: 30 }, (_, year) => testRow(year, year >= 20 ? 500000 : 0)),
      { ...defaultInputs, maxCoveragePerTerm: 300000 }
    );
    expect(capped.amounts[30]).toBe(300000);
    expect(capped.feasible).toBe(false);
  });

  it("uses exact policy expiration boundaries", () => {
    const result = calculateLadder({ ...defaultInputs, maxCoveragePerTerm: 20000000 });
    expect(result.rows[9].nominalPersonalCoverage).toBe(result.totalInitialCoverage);
    expect(result.rows[10].nominalPersonalCoverage).toBe(
      result.totalInitialCoverage - result.recommended10YearTerm
    );
    expect(result.rows[30].nominalPersonalCoverage).toBe(0);
  });

  it("covers every feasible death year in the 30-year term window", () => {
    const result = calculateLadder({ ...defaultInputs, maxCoveragePerTerm: 20000000 });
    expect(result.rows.slice(0, 30).every((row) => row.undercoverage < 1)).toBe(true);
    expect(result.rows.slice(0, 30).every((row) => row.nominalPersonalCoverage >= row.nominalRequiredCoverage)).toBe(true);
  });

  it("returns the locked 1%, 3%, and 4% scenario matrix", () => {
    const result = calculateLadder(defaultInputs);
    expect(result.scenarioMatrix.map((scenario) => scenario.realDiscountRate)).toEqual([0.01, 0.03, 0.04]);
    expect(result.scenarioMatrix.map((scenario) => scenario.id)).toEqual(["conservative", "base", "optimistic"]);
    expect(result.scenarioMatrix.every((scenario) => scenario.creditedEmployerGroupCoverage === 0)).toBe(true);
    expect(result.scenarioMatrix.every((scenario) => scenario.mortgageStrategyComparison.length === 3)).toBe(true);
  });

  it("keeps gross-income PV as a display comparison only", () => {
    const spending = calculateLadder({ ...defaultInputs, selectedNeedBasis: "spending" });
    const income = calculateLadder({ ...defaultInputs, selectedNeedBasis: "income" });
    expect(income.rows[0].selectedDisplayNeed).toBe(income.rows[0].incomePvNeed);
    expect(income.policies).toEqual(spending.policies);
  });

  it("warns when need remains after the 30-year term window", () => {
    const result = calculateLadder({
      ...defaultInputs,
      insuredAge: 30,
      spouseAge: 30,
      retirementAge: 30,
      currentLiquidAssets: 0,
      annualNonRetirementSavings: 0,
      currentRetirementAssets: 0,
      annualRetirementSavings: 0,
      maxCoveragePerTerm: 20000000
    });
    expect(result.rows[30].spendingNetNeedReal).toBeGreaterThan(0);
    expect(result.warnings.map((warning) => warning.kind)).toContain("residual-after-30");
  });

  it("reconciles the default year-zero capital ledger", () => {
    const result = calculateLadder(defaultInputs);
    const row = result.rows[0];
    expect(row.capitalDemand).toBeCloseTo(
      row.spendingPvNeed + row.realMortgageDemand + row.otherImmediateNeedsReal - row.creditedSocialSecuritySurvivorPv,
      0
    );
    expect(row.capitalSupply).toBeCloseTo(row.accessibleAssets + row.realPersonalCoverage, 0);
    expect(row.capitalGap).toBeCloseTo(row.capitalSupply - row.capitalDemand, 0);
    expect(result.totalInitialCoverage).toBe(5700000);
    expect(result.policies.map((policy) => policy.amount)).toEqual([
      1400000,
      1400000,
      1000000,
      1900000
    ]);
    expect(result.scenarioMatrix.map((scenario) => scenario.personallyOwnedTermCoverage)).toEqual([
      8300000,
      5700000,
      4900000
    ]);
    expect(presentValueAnnuity(100000, 10, 0.03)).toBeGreaterThan(800000);
  });
});
