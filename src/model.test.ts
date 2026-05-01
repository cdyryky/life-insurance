import { describe, expect, it } from "vitest";
import { defaultInputs } from "./defaults";
import { activeYearsLabel } from "./format";
import {
  buildBaseNeedRows,
  calculateLadder,
  calculateSurvivorPensionValue,
  deriveQuoteCostWeights,
  effectiveRetirementTaxHaircut,
  estimateAnnualSocialSecuritySurvivorBenefit,
  estimateSocialSecurityFamilyMaximum,
  estimateSocialSecurityPia,
  exactNominalCoverageRequired,
  fisherRealRate,
  inflationFactor,
  pensionAccrualPercent,
  presentValueAnnuity,
  realCoverageAtYear,
  presentValueRemainingMortgagePayments,
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
    grossSocialSecuritySurvivorPv: 0,
    creditedSocialSecuritySurvivorPv: 0,
    spendingPvNeed: 0,
    selectedDisplayNeed: 0,
    incomeSensitivityNeed: 0,
    nominalMortgagePrincipal: 0,
    realMortgageDemand: 0,
    mortgagePayoffDemandReal: 0,
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

describe("life insurance model", () => {
  it("formats policy active years as full zero-based coverage windows", () => {
    expect(activeYearsLabel(10)).toBe("0-9");
    expect(activeYearsLabel(30)).toBe("0-29");
  });

  it("uses the balanced pre-purchase defaults", () => {
    expect(defaultInputs.preTaxRetirementHaircut).toBe(0.25);
    expect(defaultInputs.pensionTaxAdjustmentFactor).toBe(0.75);
    expect(defaultInputs.includeEmployerCoverage).toBe(true);
    expect(defaultInputs.employerCoverageCreditFactor).toBe(0.5);
    expect(defaultInputs.includeSurvivorPension).toBe(false);
    expect(defaultInputs.socialSecurityCreditFactor).toBe(0.5);
    expect(defaultInputs.socialSecurityChildSecondarySchoolToAge19).toBe(false);
    expect(defaultInputs.realReturnBaseCase).toBe(0.035);
    expect(defaultInputs.realReturnConservative).toBe(0.02);
    expect(defaultInputs.realReturnOptimistic).toBe(0.05);
    expect(defaultInputs.childcareHouseholdSupportAnnual).toBe(50000);
    expect(defaultInputs.childcareSupportEndAge).toBe(14);
    expect(defaultInputs.collegeFundingMode).toBe("scenario_only");
  });

  it("bases the default quote estimate on partial employer coverage credit", () => {
    const result = calculateLadder(defaultInputs);
    const fullEmployerCredit = calculateLadder({
      ...defaultInputs,
      employerCoverageCreditFactor: 1
    });

    expect(result.rows[0].realEmployerCoverage).toBe(defaultInputs.employerCoverageAmount);
    expect(result.rows[0].creditedEmployerCoverage).toBe(
      defaultInputs.employerCoverageAmount * defaultInputs.employerCoverageCreditFactor
    );
    expect(result.totalInitialCoverage).toBe(3500000);
    expect(fullEmployerCredit.totalInitialCoverage).toBeLessThan(
      result.totalInitialCoverage
    );
  });

  it("calculates the Fisher real discount rate", () => {
    expect(fisherRealRate(0.05, 0.025)).toBeCloseTo(0.02439024, 6);
  });

  it("deflates fixed nominal coverage by death year", () => {
    expect(realCoverageAtYear(2000000, 0.025, 30)).toBeCloseTo(953000, -3);
  });

  it("rounds nominal required coverage with a clamped increment", () => {
    expect(exactNominalCoverageRequired(100000, 0.025, 2)).toBeCloseTo(105062.5, 1);
    expect(roundedNominalCoverageRequired(100000, 0.025, 2, 100000)).toBe(200000);
    expect(roundedNominalCoverageRequired(100000.2, 0, 0, 0)).toBe(100001);
  });

  it("derives quote cost weights from interpolated premiums", () => {
    const zero = deriveQuoteCostWeights(0);
    const oneMillion = deriveQuoteCostWeights(1000000);
    const onePointFiveMillion = deriveQuoteCostWeights(1500000);
    const twoMillion = deriveQuoteCostWeights(2000000);
    const aboveTwoMillion = deriveQuoteCostWeights(5000000);

    expect(zero[10]).toBe(1);
    expect(Number.isFinite(zero[30])).toBe(true);
    expect(oneMillion[15]).toBeCloseTo(267.6 / 218.9, 4);
    expect(oneMillion[20]).toBeCloseTo(350 / 218.9, 4);
    expect(oneMillion[30]).toBeCloseTo(630 / 218.9, 4);
    expect(onePointFiveMillion[15]).toBeCloseTo(366.26 / 294.32, 4);
    expect(onePointFiveMillion[20]).toBeCloseTo(490 / 294.32, 4);
    expect(onePointFiveMillion[30]).toBeCloseTo(907.08 / 294.32, 4);
    expect(twoMillion[15]).toBeCloseTo(464.92 / 369.74, 4);
    expect(twoMillion[20]).toBeCloseTo(630 / 369.74, 4);
    expect(twoMillion[30]).toBeCloseTo(1184.16 / 369.74, 4);
    expect(aboveTwoMillion).toEqual(twoMillion);
  });

  it("caps Social Security covered earnings before estimating PIA", () => {
    const capped = estimateSocialSecurityPia(SOCIAL_SECURITY_2026_TAXABLE_MAXIMUM);
    const aboveCap = estimateSocialSecurityPia(600000);

    expect(aboveCap).toBeCloseTo(capped, 8);
    expect(capped).toBeGreaterThan(0);
  });

  it("caps combined Social Security survivor benefits at the family maximum", () => {
    const inputs = {
      ...defaultInputs,
      socialSecurityCoveredAnnualEarnings: 600000,
      socialSecurityEligibleChildren: 3,
      youngestChildAge: 5
    };
    const pia = estimateSocialSecurityPia(inputs.socialSecurityCoveredAnnualEarnings);
    const familyMaximumAnnual = estimateSocialSecurityFamilyMaximum(pia) * 12;

    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0, 0)).toBeCloseTo(
      familyMaximumAnnual,
      0
    );
  });

  it("separates caregiver and child Social Security survivor benefit horizons", () => {
    const inputs = {
      ...defaultInputs,
      socialSecurityCoveredAnnualEarnings: 600000,
      socialSecurityEligibleChildren: 1,
      youngestChildAge: 15,
      socialSecurityChildSecondarySchoolToAge19: false
    };
    const pia = estimateSocialSecurityPia(inputs.socialSecurityCoveredAnnualEarnings);

    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0, 0)).toBeCloseTo(
      pia * 1.5 * 12,
      0
    );
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0, 1)).toBeCloseTo(
      pia * 0.75 * 12,
      0
    );
    expect(estimateAnnualSocialSecuritySurvivorBenefit(inputs, 0, 3)).toBe(0);
    expect(
      estimateAnnualSocialSecuritySurvivorBenefit(
        { ...inputs, socialSecurityChildSecondarySchoolToAge19: true },
        0,
        3
      )
    ).toBeCloseTo(pia * 0.75 * 12, 0);
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
    const liquidYear1 = 100000 * realAssetGrowthFactor + 10000;
    const liquidYear2 = liquidYear1 * realAssetGrowthFactor + 10000;
    const retirementYear1 = 200000 * realRetirementGrowthFactor + 72000;
    const retirementYear2 = retirementYear1 * realRetirementGrowthFactor + 72000;

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
      survivingSpouseIncome: 0,
      dependentDropOffAmount: 0
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
    expect(row.selectedDisplayNeed).toBeCloseTo(row.spendingPvNeed, 0);
  });

  it("steps spending PV down after the dependent drop-off year", () => {
    const result = buildBaseNeedRows({
      ...defaultInputs,
      spouseAge: 25,
      survivingSpouseLongevityAge: 95,
      monthlyHouseholdNeedExcludingMortgage: 12000,
      survivingSpouseIncome: 0,
      dependentDropOffYear: 18,
      dependentDropOffAmount: 48000
    });
    const row = result.rows[0];
    const expectedSpendingPv =
      presentValueAnnuity(144000, 18, result.realDiscountRate) +
      presentValueAnnuity(96000, 52, result.realDiscountRate) /
        Math.pow(1 + result.realDiscountRate, 18);

    expect(row.spendingPvNeed).toBeCloseTo(expectedSpendingPv, 0);
  });

  it("models childcare support as a separate liability ending at the configured age", () => {
    const result = buildBaseNeedRows({
      ...defaultInputs,
      youngestChildAge: 10,
      childcareHouseholdSupportAnnual: 50000,
      childcareSupportEndAge: 14
    });

    expect(result.rows[0].childcareHouseholdSupportPv).toBeCloseTo(
      presentValueAnnuity(50000, 4, result.realDiscountRate),
      0
    );
    expect(result.rows[4].childcareHouseholdSupportPv).toBe(0);
    expect(result.rows[0].spendingPvNeed).toBeGreaterThan(0);
  });

  it("excludes college from default rows and active scenarios", () => {
    const result = calculateLadder({
      ...defaultInputs,
      annualCollegeFunding: 100000,
      collegeStartYear: 10,
      collegeEndYear: 18
    });

    expect(result.rows[0].collegeFundingPv).toBe(0);
    expect(result.scenarioMatrix).toHaveLength(3);
    expect(result.scenarioMatrix.map((scenario) => scenario.id)).toEqual([
      "conservative",
      "base",
      "optimistic"
    ]);
    expect(
      result.scenarioMatrix.every((scenario) => !scenario.includesCollegeFunding)
    ).toBe(true);
  });

  it("does not let dormant college inputs change visible ladder outputs", () => {
    const base = calculateLadder(defaultInputs);
    const changedCollegeInputs = calculateLadder({
      ...defaultInputs,
      annualCollegeFunding: 250000,
      collegeStartYear: 4,
      collegeEndYear: 8
    });

    expect(changedCollegeInputs.totalInitialCoverage).toBe(base.totalInitialCoverage);
    expect(changedCollegeInputs.recommended10YearTerm).toBe(base.recommended10YearTerm);
    expect(changedCollegeInputs.recommended15YearTerm).toBe(base.recommended15YearTerm);
    expect(changedCollegeInputs.recommended20YearTerm).toBe(base.recommended20YearTerm);
    expect(changedCollegeInputs.recommended30YearTerm).toBe(base.recommended30YearTerm);
    expect(
      changedCollegeInputs.scenarioMatrix.map((scenario) => ({
        id: scenario.id,
        personallyOwnedTermCoverage: scenario.personallyOwnedTermCoverage
      }))
    ).toEqual(
      base.scenarioMatrix.map((scenario) => ({
        id: scenario.id,
        personallyOwnedTermCoverage: scenario.personallyOwnedTermCoverage
      }))
    );
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

    expect(incomeRow.selectedDisplayNeed).toBeCloseTo(incomeRow.incomePvNeed, 0);
    expect(spendingRow.selectedDisplayNeed).toBeCloseTo(spendingRow.spendingPvNeed, 0);
  });

  it("uses spending demand plus real mortgage for the solver ledger regardless of display basis", () => {
    const baseInputs = {
      ...defaultInputs,
      currentLiquidAssets: 0,
      annualNonRetirementSavings: 0,
      currentRetirementAssets: 0,
      annualRetirementSavings: 0,
      includeSurvivorPension: false,
      includeEmployerCoverage: false,
      mortgageBalance: 500000,
      mortgageAnnualRate: 0.06,
      mortgageYearsRemaining: 15,
      childcareHouseholdSupportAnnual: 0,
      socialSecurityEligibleChildren: 0,
      dependentDropOffAmount: 0
    };
    const incomeRow = buildBaseNeedRows({
      ...baseInputs,
      selectedNeedBasis: "income"
    }).rows[0];
    const spendingRow = buildBaseNeedRows({
      ...baseInputs,
      selectedNeedBasis: "spending"
    }).rows[0];

    expect(incomeRow.selectedDisplayNeed).toBeCloseTo(incomeRow.incomePvNeed, 0);
    expect(spendingRow.selectedDisplayNeed).toBeCloseTo(spendingRow.spendingPvNeed, 0);
    expect(incomeRow.spendingDemandReal).toBeCloseTo(
      incomeRow.spendingPvNeed + incomeRow.realMortgageDemand,
      0
    );
    expect(spendingRow.spendingNetNeedReal).toBeCloseTo(
      incomeRow.spendingNetNeedReal,
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
    }, 0, defaultInputs.nominalDiscountRate);

    expect(pension.serviceYears).toBe(4);
    expect(pension.grossAnnualPension).toBe(0);
    expect(pension.taxAdjustedValue).toBe(0);
  });

  it("defers pre-55 survivor pension and discounts the nominal PV with the nominal rate", () => {
    const inputs = {
      ...defaultInputs,
      includeSurvivorPension: true,
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
    const nominalDiscountRate = inputs.nominalDiscountRate;
    const pension = calculateSurvivorPensionValue(inputs, 0, nominalDiscountRate);
    const grossAnnualPension = 36000;
    const survivorAnnualPension = grossAnnualPension * 0.85 * 0.5;
    const pvAtCommencement = presentValueAnnuity(
      survivorAnnualPension,
      45,
      nominalDiscountRate
    );
    const pvAtDeath = pvAtCommencement / Math.pow(1 + nominalDiscountRate, 15);

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
    }, 0, defaultInputs.nominalDiscountRate);
    const age65 = calculateSurvivorPensionValue({
      ...defaultInputs,
      insuredAge: 65,
      pensionCurrentServiceYears: 20
    }, 0, defaultInputs.nominalDiscountRate);

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
    }, 0, defaultInputs.nominalDiscountRate);

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
    expect(withPension.rows[0].spendingNeedAfterAssetsReal).toBeLessThan(
      withoutPension.rows[0].spendingNeedAfterAssetsReal
    );
    expect(withPension.rows[0].accessibleAssets).toBeCloseTo(
      withoutPension.rows[0].accessibleAssets +
        withPension.rows[0].pensionTaxAdjustedValue,
      0
    );
    expect(withPension.weightedFaceAmount).toBeLessThan(withoutPension.weightedFaceAmount);
  });

  it("deflates future mortgage principal into real present-year dollars", () => {
    const year = 5;
    const rows = buildBaseNeedRows({
      ...defaultInputs,
      mortgageBalance: 500000,
      mortgageAnnualRate: 0.06,
      mortgageYearsRemaining: 15,
      inflationRate: 0.03
    }).rows;
    const row = rows[year];

    expect(row.nominalMortgagePrincipal).toBeCloseTo(
      remainingMortgagePrincipal(500000, 0.06, 15, year),
      0
    );
    expect(row.realMortgagePrincipal).toBeCloseTo(
      row.nominalMortgagePrincipal / inflationFactor(0.03, year),
      0
    );
  });

  it("compares mortgage payoff against continuing payments and uses the selected strategy", () => {
    const inputs = {
      ...defaultInputs,
      mortgageBalance: 1500000,
      mortgageAnnualRate: 0.065,
      mortgageYearsRemaining: 15,
      inflationRate: 0.025,
      realReturnBaseCase: 0.035
    };
    const continueRows = buildBaseNeedRows({
      ...inputs,
      mortgageStrategy: "continue_monthly_payments"
    }, {
      realReturnOverride: inputs.realReturnBaseCase
    }).rows;
    const payoffRows = buildBaseNeedRows({
      ...inputs,
      mortgageStrategy: "continue_monthly_payments"
    }, {
      realReturnOverride: inputs.realReturnBaseCase,
      mortgageStrategy: "payoff_at_death"
    }).rows;

    expect(continueRows[0].mortgageContinuePaymentsDemandReal).toBeCloseTo(
      presentValueRemainingMortgagePayments(1500000, 0.065, 15, 0, 0.025, 0.035),
      0
    );
    expect(continueRows[0].mortgagePayoffDemandReal).toBe(1500000);
    expect(continueRows[0].mortgageContinuePaymentsDemandReal).toBeGreaterThan(
      continueRows[0].mortgagePayoffDemandReal
    );
    expect(continueRows[0].selectedMortgageStrategy).toBe("continue_monthly_payments");
    expect(payoffRows[0].selectedMortgageStrategy).toBe("payoff_at_death");
    expect(calculateLadder({
      ...inputs,
      mortgageStrategy: "continue_monthly_payments"
    }).rows[0].selectedMortgageStrategy).toBe("continue_monthly_payments");
    expect(calculateLadder({
      ...inputs,
      mortgageStrategy: "payoff_at_death"
    }).rows[0].selectedMortgageStrategy).toBe(
      "payoff_at_death"
    );
  });

  it("deflates employer coverage then drops after the configured end year", () => {
    const rows = buildBaseNeedRows({
      ...defaultInputs,
      annualIncome: 100000,
      employerCoverageAmount: 300000,
      employerCoverageEndYear: 5,
      includeEmployerCoverage: true,
      inflationRate: 0.03
    }).rows;
    expect(rows[0].realEmployerCoverage).toBe(300000);
    expect(rows[5].realEmployerCoverage).toBeCloseTo(300000 / inflationFactor(0.03, 5), 0);
    expect(rows[6].realEmployerCoverage).toBe(0);
  });

  it("credits employer coverage by the configured portability factor", () => {
    const base = buildBaseNeedRows({
      ...defaultInputs,
      employerCoverageAmount: 1000000,
      employerCoverageCreditFactor: 0.5,
      includeEmployerCoverage: true,
      inflationRate: 0.03
    }).rows[0];
    const stress = calculateLadder({
      ...defaultInputs,
      employerCoverageAmount: 1000000
    }).scenarioMatrix.find((scenario) => scenario.id === "conservative");

    expect(base.realEmployerCoverage).toBe(1000000);
    expect(base.creditedEmployerCoverage).toBe(500000);
    expect(stress?.employerCoverageCreditFactor).toBe(0);
    expect(stress?.creditedEmployerGroupCoverage).toBe(0);
  });

  it("deflates pension tax-adjusted value by death year", () => {
    const year = 10;
    const row = buildBaseNeedRows({
      ...defaultInputs,
      includeSurvivorPension: true,
      pensionCurrentServiceYears: 20,
      inflationRate: 0.03
    }).rows[year];

    expect(row.pensionTaxAdjustedValueNominal).toBeGreaterThan(0);
    expect(row.pensionTaxAdjustedValue).toBeCloseTo(
      row.pensionTaxAdjustedValueNominal / inflationFactor(0.03, year),
      0
    );
  });

  it("capital sufficiency gap equals assets plus insurance minus mortgage and spending demand", () => {
    const result = calculateLadder(defaultInputs);
    const row = result.rows[0];

    expect(row.capitalDemand).toBeCloseTo(row.spendingDemandReal, 0);
    expect(row.capitalSupply).toBeCloseTo(
      row.accessibleAssets + row.creditedEmployerCoverage + row.realPersonalCoverage,
      0
    );
    expect(row.capitalGap).toBeCloseTo(
      row.capitalSupply - row.capitalDemand,
      0
    );
    expect(row.capitalDeficit).toBe(Math.max(0, -row.capitalGap));
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
    expect(
      result.rows
        .filter((row) => row.year < 30)
        .every((row) => row.nominalPersonalCoverage >= row.nominalRequiredCoverage)
    ).toBe(true);
    expect(result.warnings.some((warning) => warning.kind === "residual-after-30")).toBe(
      true
    );
  });

  it("solver ignores selectedNeedBasis and uses spending net need", () => {
    const baseInputs = {
      ...defaultInputs,
      annualIncome: 2000000,
      currentLiquidAssets: 0,
      annualNonRetirementSavings: 0,
      currentRetirementAssets: 0,
      annualRetirementSavings: 0,
      includeSurvivorPension: false,
      includeEmployerCoverage: false,
      maxCoveragePerTerm: 30000000
    };
    const incomeDisplay = calculateLadder({
      ...baseInputs,
      selectedNeedBasis: "income"
    });
    const spendingDisplay = calculateLadder({
      ...baseInputs,
      selectedNeedBasis: "spending"
    });

    expect(incomeDisplay.rows[0].selectedDisplayNeed).not.toBeCloseTo(
      spendingDisplay.rows[0].selectedDisplayNeed,
      0
    );
    expect(incomeDisplay.policies.map((policy) => policy.amount)).toEqual(
      spendingDisplay.policies.map((policy) => policy.amount)
    );
  });

  it("undercoverage compares real personal coverage against real spending net need", () => {
    const result = calculateLadder({
      ...defaultInputs,
      includeEmployerCoverage: false,
      maxCoveragePerTerm: 20000000
    });
    const row = result.rows[20];

    expect(row.realPersonalCoverage).toBeCloseTo(
      realCoverageAtYear(row.nominalPersonalCoverage, defaultInputs.inflationRate, row.year),
      0
    );
    expect(row.undercoverage).toBeCloseTo(
      Math.max(0, row.spendingNetNeedReal - row.realPersonalCoverage),
      0
    );
    expect(row.overcoverage).toBeCloseTo(
      Math.max(0, row.realPersonalCoverage - row.spendingNetNeedReal),
      0
    );
  });

  it("residual-after-30 warning uses spending net need, not selected display need", () => {
    const result = calculateLadder({
      ...defaultInputs,
      selectedNeedBasis: "income",
      insuredAge: 30,
      retirementAge: 30,
      spouseAge: 30,
      survivingSpouseLongevityAge: 95,
      includeEmployerCoverage: false,
      currentLiquidAssets: 0,
      annualNonRetirementSavings: 0,
      currentRetirementAssets: 0,
      annualRetirementSavings: 0,
      includeSurvivorPension: false,
      maxCoveragePerTerm: 20000000
    });

    expect(result.rows[30].incomePvNeed).toBe(0);
    expect(result.rows[30].spendingNetNeedReal).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.kind === "residual-after-30")).toBe(
      true
    );
  });

  it("uses each term full active window for solver bounds", () => {
    const rows = Array.from({ length: 30 }, (_, year) =>
      testRow(year, year === 0 ? 100000 : 0)
    );
    const solved = solvePolicyLadder(rows, {
      ...defaultInputs,
      coverageIncrement: 100000,
      maxCoveragePerTerm: 100000,
      premiumWeightMode: "manual",
      costWeights: { 10: 10, 15: 10, 20: 10, 30: 1 }
    });

    expect(solved.amounts[10]).toBe(0);
    expect(solved.amounts[30]).toBe(100000);
    expect(solved.feasible).toBe(true);
  });

  it("cost weights affect ladder ranking", () => {
    const lowLongTermCost = calculateLadder({
      ...defaultInputs,
      includeEmployerCoverage: false,
      premiumWeightMode: "manual",
      costWeights: { 10: 10, 15: 10, 20: 10, 30: 1 }
    });
    const highLongTermCost = calculateLadder({
      ...defaultInputs,
      includeEmployerCoverage: false,
      premiumWeightMode: "manual",
      costWeights: { 10: 1, 15: 1.4, 20: 2.2, 30: 10 }
    });
    const amount30LowCost =
      lowLongTermCost.policies.find((policy) => policy.termYears === 30)?.amount ?? 0;
    const amount30HighCost =
      highLongTermCost.policies.find((policy) => policy.termYears === 30)?.amount ?? 0;

    expect(amount30LowCost).toBeGreaterThanOrEqual(amount30HighCost);
  });

  it("quote-derived mode uses effective quote weights in policy output", () => {
    const result = calculateLadder({
      ...defaultInputs,
      premiumWeightMode: "quote-derived",
      costWeights: { 10: 10, 15: 10, 20: 10, 30: 10 }
    });

    expect(result.premiumPricingAnchor).toBeGreaterThan(0);
    expect(result.effectiveCostWeights[10]).toBe(1);
    expect(result.effectiveCostWeights[30]).toBeLessThan(10);
    expect(result.policies.find((policy) => policy.termYears === 30)?.costWeight).toBe(
      result.effectiveCostWeights[30]
    );
  });

  it("returns the required scenario matrix and applies scenario factors", () => {
    const result = calculateLadder(defaultInputs);
    const conservative = result.scenarioMatrix.find(
      (scenario) => scenario.id === "conservative"
    );
    const base = result.scenarioMatrix.find((scenario) => scenario.id === "base");
    const optimistic = result.scenarioMatrix.find(
      (scenario) => scenario.id === "optimistic"
    );

    expect(result.scenarioMatrix.map((scenario) => scenario.label)).toContain(
      "Optimistic / Lowest Coverage"
    );
    expect(conservative?.realReturn).toBe(defaultInputs.realReturnConservative);
    expect(conservative?.employerCoverageCreditFactor).toBe(0);
    expect(conservative?.socialSecurityCreditFactor).toBe(0);
    expect(base?.employerCoverageCreditFactor).toBe(0.5);
    expect(base?.socialSecurityCreditFactor).toBe(0.5);
    expect(optimistic?.employerCoverageCreditFactor).toBe(1);
    expect(optimistic?.socialSecurityCreditFactor).toBe(1);
    expect(result.scenarioMatrix.map((scenario) => scenario.id)).toEqual([
      "conservative",
      "base",
      "optimistic"
    ]);
    expect(
      result.scenarioMatrix.every(
        (scenario) => scenario.mortgageStrategyComparison.length === 2
      )
    ).toBe(true);
    expect(result.recommended10YearTerm).toBe(
      result.policies.find((policy) => policy.termYears === 10)?.amount
    );
    expect(result.coverageGapByYear).toHaveLength(31);
  });

  it("manual mode preserves entered cost weights", () => {
    const manualWeights = { 10: 1, 15: 2, 20: 3, 30: 4 };
    const result = calculateLadder({
      ...defaultInputs,
      premiumWeightMode: "manual",
      costWeights: manualWeights
    });

    expect(result.effectiveCostWeights).toEqual(manualWeights);
    expect(result.policies.find((policy) => policy.termYears === 30)?.costWeight).toBe(4);
  });
});
