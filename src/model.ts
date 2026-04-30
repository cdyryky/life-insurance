import type {
  CalculatorInputs,
  CalculatorResult,
  MortgageStrategy,
  PolicyRecommendation,
  ScenarioId,
  ScenarioSummary,
  SolverWarning,
  TermLength,
  YearlyRow
} from "./types";

const TERMS: TermLength[] = [10, 15, 20, 30];
const HORIZON_YEARS = 40;
const QUOTE_ANCHOR_LOW = 1000000;
const QUOTE_ANCHOR_HIGH = 2000000;
export const SOCIAL_SECURITY_2026_TAXABLE_MAXIMUM = 184500;
export const SOCIAL_SECURITY_2026_PIA_BEND_POINTS = {
  first: 1286,
  second: 7749
};
export const SOCIAL_SECURITY_2026_FAMILY_MAX_BEND_POINTS = {
  first: 1643,
  second: 2371,
  third: 3093
};
const TERM4SALE_QUOTES: Record<typeof QUOTE_ANCHOR_LOW | typeof QUOTE_ANCHOR_HIGH, Record<TermLength, number>> = {
  [QUOTE_ANCHOR_LOW]: {
    10: 218.9,
    15: 267.6,
    20: 350,
    30: 630
  },
  [QUOTE_ANCHOR_HIGH]: {
    10: 369.74,
    15: 464.92,
    20: 630,
    30: 1184.16
  }
};

type CalculationOptions = {
  realReturnOverride?: number;
  employerCoverageCreditFactor?: number;
  socialSecurityCreditFactor?: number;
  mortgageStrategy?: MortgageStrategy;
  includeCollegeFunding?: boolean;
};

type ScenarioConfig = {
  id: ScenarioId;
  label: string;
  realReturn: number;
  employerCoverageCreditFactor: number;
  socialSecurityCreditFactor: number;
  includeCollegeFunding: boolean;
};

export function fisherRealRate(nominalRate: number, inflationRate: number) {
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

export function inflationFactor(inflationRate: number, year: number) {
  return Math.pow(1 + inflationRate, year);
}

export function realCoverageAtYear(
  nominalAmount: number,
  inflationRate: number,
  year: number
) {
  return nominalAmount / inflationFactor(inflationRate, year);
}

export function exactNominalCoverageRequired(
  realNeed: number,
  inflationRate: number,
  year: number
) {
  return Math.max(0, realNeed) * inflationFactor(inflationRate, year);
}

export function roundedNominalCoverageRequired(
  realNeed: number,
  inflationRate: number,
  year: number,
  increment: number
) {
  const safeIncrement = Math.max(1, increment);
  return (
    Math.ceil(
      exactNominalCoverageRequired(realNeed, inflationRate, year) / safeIncrement
    ) * safeIncrement
  );
}

export function presentValueAnnuity(
  annualAmountToday: number,
  years: number,
  realDiscountRate: number
) {
  if (annualAmountToday <= 0 || years <= 0) return 0;
  if (Math.abs(realDiscountRate) < 0.000001) {
    return annualAmountToday * years;
  }
  return (
    annualAmountToday *
    ((1 - Math.pow(1 + realDiscountRate, -years)) / realDiscountRate)
  );
}

export function estimateSocialSecurityPia(
  coveredAnnualEarnings: number,
  taxableMaximum = SOCIAL_SECURITY_2026_TAXABLE_MAXIMUM
) {
  const aime = Math.max(0, Math.min(coveredAnnualEarnings, taxableMaximum)) / 12;
  const firstBend = SOCIAL_SECURITY_2026_PIA_BEND_POINTS.first;
  const secondBend = SOCIAL_SECURITY_2026_PIA_BEND_POINTS.second;

  return (
    0.9 * Math.min(aime, firstBend) +
    0.32 * Math.min(Math.max(0, aime - firstBend), secondBend - firstBend) +
    0.15 * Math.max(0, aime - secondBend)
  );
}

export function estimateSocialSecurityFamilyMaximum(pia: number) {
  const firstBend = SOCIAL_SECURITY_2026_FAMILY_MAX_BEND_POINTS.first;
  const secondBend = SOCIAL_SECURITY_2026_FAMILY_MAX_BEND_POINTS.second;
  const thirdBend = SOCIAL_SECURITY_2026_FAMILY_MAX_BEND_POINTS.third;

  return (
    1.5 * Math.min(pia, firstBend) +
    2.72 * Math.min(Math.max(0, pia - firstBend), secondBend - firstBend) +
    1.34 * Math.min(Math.max(0, pia - secondBend), thirdBend - secondBend) +
    1.75 * Math.max(0, pia - thirdBend)
  );
}

export function estimateAnnualSocialSecuritySurvivorBenefit(
  inputs: CalculatorInputs,
  deathYear: number,
  benefitYearOffset = 0
) {
  const childEndAge = inputs.socialSecurityChildSecondarySchoolToAge19 ? 19 : 18;
  const childAge = inputs.youngestChildAge + deathYear + benefitYearOffset;
  const childBeneficiaries =
    childAge < childEndAge ? Math.max(0, inputs.socialSecurityEligibleChildren) : 0;
  const caregiverBeneficiaries = childAge < 16 && childBeneficiaries > 0 ? 1 : 0;
  const beneficiaryCount = childBeneficiaries + caregiverBeneficiaries;
  if (beneficiaryCount <= 0) return 0;

  const pia = estimateSocialSecurityPia(inputs.socialSecurityCoveredAnnualEarnings);
  const uncappedMonthlyBenefit = pia * 0.75 * beneficiaryCount;
  const familyMaximum = estimateSocialSecurityFamilyMaximum(pia);
  return Math.min(uncappedMonthlyBenefit, familyMaximum) * 12;
}

export function presentValueSocialSecuritySurvivorBenefits(
  inputs: CalculatorInputs,
  deathYear: number,
  realDiscountRate: number
) {
  const childEndAge = inputs.socialSecurityChildSecondarySchoolToAge19 ? 19 : 18;
  const youngestAgeAtDeath = inputs.youngestChildAge + deathYear;
  const maxBenefitYears = Math.max(0, childEndAge - youngestAgeAtDeath);
  let presentValue = 0;

  for (let offset = 0; offset < maxBenefitYears; offset += 1) {
    presentValue +=
      estimateAnnualSocialSecuritySurvivorBenefit(inputs, deathYear, offset) /
      Math.pow(1 + realDiscountRate, offset);
  }

  return presentValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function peakRequiredCoverage(rows: YearlyRow[]) {
  return Math.max(
    0,
    ...rows
      .filter((row) => row.year < 30)
      .map((row) => row.nominalRequiredCoverage)
  );
}

export function deriveQuoteCostWeights(peakCoverage: number): Record<TermLength, number> {
  const factor = clamp(
    (Math.max(0, peakCoverage) - QUOTE_ANCHOR_LOW) /
      (QUOTE_ANCHOR_HIGH - QUOTE_ANCHOR_LOW),
    0,
    1
  );
  const interpolatedPremiums = TERMS.reduce((premiums, term) => {
    premiums[term] =
      TERM4SALE_QUOTES[QUOTE_ANCHOR_LOW][term] +
      factor *
        (TERM4SALE_QUOTES[QUOTE_ANCHOR_HIGH][term] -
          TERM4SALE_QUOTES[QUOTE_ANCHOR_LOW][term]);
    return premiums;
  }, {} as Record<TermLength, number>);
  const baselinePremium = Math.max(0.01, interpolatedPremiums[10]);

  return TERMS.reduce((weights, term) => {
    weights[term] = term === 10 ? 1 : interpolatedPremiums[term] / baselinePremium;
    return weights;
  }, {} as Record<TermLength, number>);
}

export function effectiveCostWeightsForRows(
  rows: YearlyRow[],
  inputs: CalculatorInputs
) {
  if (inputs.premiumWeightMode === "manual") {
    return {
      anchor: peakRequiredCoverage(rows),
      weights: inputs.costWeights
    };
  }

  const anchor = peakRequiredCoverage(rows);
  return {
    anchor,
    weights: deriveQuoteCostWeights(anchor)
  };
}

export function pensionAccrualPercent(serviceYears: number) {
  const years = Math.max(0, serviceYears);
  return 0.02 * Math.min(years, 20) + 0.01 * Math.max(years - 20, 0);
}

export function calculateSurvivorPensionValue(
  inputs: CalculatorInputs,
  year: number,
  nominalDiscountRate: number
) {
  const serviceYears = Math.max(0, inputs.pensionCurrentServiceYears + year);
  const participantAgeAtDeath = inputs.insuredAge + year;
  const spouseAgeAtDeath = inputs.spouseAge + year;
  const commencementAge = Math.max(
    participantAgeAtDeath,
    inputs.pensionMinimumCommencementAge
  );
  const defermentYears = Math.max(
    0,
    inputs.pensionMinimumCommencementAge - participantAgeAtDeath
  );
  const spouseAgeAtCommencement = spouseAgeAtDeath + defermentYears;
  const paymentYears = Math.max(
    0,
    inputs.survivingSpouseLongevityAge - spouseAgeAtCommencement
  );
  const earlyFactor = clamp(
    1 -
      inputs.pensionEarlyReductionRate *
        Math.max(inputs.pensionNormalRetirementAge - commencementAge, 0),
    0,
    1
  );

  if (!inputs.includeSurvivorPension || serviceYears < inputs.pensionVestingYears) {
    return {
      serviceYears,
      grossAnnualPension: 0,
      survivorAnnualPension: 0,
      commencementAge,
      defermentYears,
      paymentYears,
      earlyFactor,
      presentValue: 0,
      taxAdjustedValue: 0
    };
  }

  const grossAnnualPension = pensionAccrualPercent(serviceYears) * inputs.pensionHac;
  const survivorAnnualPension =
    grossAnnualPension * inputs.pensionSurvivorFactor * earlyFactor;
  const pvAtCommencement = presentValueAnnuity(
    survivorAnnualPension,
    paymentYears,
    nominalDiscountRate
  );
  const pvAtDeath =
    pvAtCommencement / Math.pow(1 + nominalDiscountRate, defermentYears);
  const taxAdjustedValue = pvAtDeath * inputs.pensionTaxAdjustmentFactor;

  return {
    serviceYears,
    grossAnnualPension,
    survivorAnnualPension,
    commencementAge,
    defermentYears,
    paymentYears,
    earlyFactor,
    presentValue: pvAtDeath,
    taxAdjustedValue
  };
}

export function remainingMortgagePrincipal(
  balance: number,
  annualRate: number,
  yearsRemaining: number,
  year: number
) {
  if (balance <= 0 || yearsRemaining <= 0) return 0;
  if (year >= yearsRemaining) return 0;

  const monthsTotal = Math.round(yearsRemaining * 12);
  const monthsElapsed = Math.round(year * 12);
  const monthsLeft = monthsTotal - monthsElapsed;
  const monthlyRate = annualRate / 12;

  if (monthlyRate === 0) {
    return balance * (monthsLeft / monthsTotal);
  }

  const payment =
    (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -monthsTotal));
  return Math.max(
    0,
    balance * Math.pow(1 + monthlyRate, monthsElapsed) -
      payment *
        ((Math.pow(1 + monthlyRate, monthsElapsed) - 1) / monthlyRate)
  );
}

export function monthlyMortgagePayment(
  balance: number,
  annualRate: number,
  yearsRemaining: number
) {
  if (balance <= 0 || yearsRemaining <= 0) return 0;
  const monthsTotal = Math.round(yearsRemaining * 12);
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return balance / monthsTotal;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -monthsTotal));
}

export function presentValueRemainingMortgagePayments(
  balance: number,
  annualRate: number,
  yearsRemaining: number,
  year: number,
  inflationRate: number,
  realDiscountRate: number
) {
  const monthsTotal = Math.round(Math.max(0, yearsRemaining) * 12);
  const monthsElapsed = Math.round(Math.max(0, year) * 12);
  const monthsLeft = Math.max(0, monthsTotal - monthsElapsed);
  if (balance <= 0 || monthsLeft <= 0) return 0;

  const payment = monthlyMortgagePayment(balance, annualRate, yearsRemaining);
  const annualPaymentInDeathYearDollars =
    (payment * 12) / inflationFactor(inflationRate, year);
  return presentValueAnnuity(
    annualPaymentInDeathYearDollars,
    Math.ceil(monthsLeft / 12),
    realDiscountRate
  );
}

export function accumulateRealAssets(
  startingBalance: number,
  annualContribution: number,
  realGrowthRate: number,
  throughYear: number
) {
  let balance = Math.max(0, startingBalance);
  for (let year = 0; year < throughYear; year += 1) {
    balance = balance * (1 + realGrowthRate) + Math.max(0, annualContribution);
  }
  return Math.max(0, balance);
}

export function effectiveRetirementTaxHaircut(inputs: CalculatorInputs) {
  const preTaxShare = Math.min(1, Math.max(0, inputs.preTaxRetirementShare));
  const postTaxShare = 1 - preTaxShare;
  const preTaxHaircut = Math.min(0.95, Math.max(0, inputs.preTaxRetirementHaircut));
  const postTaxHaircut = Math.min(0.95, Math.max(0, inputs.postTaxRetirementHaircut));

  return preTaxShare * preTaxHaircut + postTaxShare * postTaxHaircut;
}

export function buildBaseNeedRows(
  inputs: CalculatorInputs,
  options: CalculationOptions = {}
) {
  const realDiscountRate =
    options.realReturnOverride ??
    fisherRealRate(inputs.nominalDiscountRate, inputs.inflationRate);
  const realAssetGrowthRate =
    options.realReturnOverride ??
    fisherRealRate(inputs.nominalAssetGrowthRate, inputs.inflationRate);
  const realRetirementGrowthRate =
    options.realReturnOverride ??
    fisherRealRate(inputs.nominalRetirementGrowthRate, inputs.inflationRate);
  const employerCoverageCreditFactor = clamp(
    options.employerCoverageCreditFactor ?? inputs.employerCoverageCreditFactor,
    0,
    1
  );
  const socialSecurityCreditFactor = clamp(
    options.socialSecurityCreditFactor ?? inputs.socialSecurityCreditFactor,
    0,
    1
  );
  const includeCollegeFunding = options.includeCollegeFunding ?? false;
  const retirementHaircut = effectiveRetirementTaxHaircut(inputs);
  const retirementHorizon = Math.max(0, inputs.retirementAge - inputs.insuredAge);
  const annualSpendingDeficit = Math.max(
    0,
    inputs.monthlyHouseholdNeedExcludingMortgage * 12 -
      inputs.survivingSpouseIncome
  );
  const rows: YearlyRow[] = [];

  for (let year = 0; year <= HORIZON_YEARS; year += 1) {
    const remainingIncomeYears = Math.max(0, retirementHorizon - year);
    const spouseAgeAtDeath = inputs.spouseAge + year;
    const remainingSpendingYears = Math.max(
      0,
      inputs.survivingSpouseLongevityAge - spouseAgeAtDeath
    );
    const incomePvNeed = presentValueAnnuity(
      inputs.annualIncome,
      remainingIncomeYears,
      realDiscountRate
    );
    const yearsUntilDrop = Math.max(0, inputs.dependentDropOffYear - year);
    const preDropYears = Math.min(remainingSpendingYears, yearsUntilDrop);
    const postDropYears = Math.max(0, remainingSpendingYears - preDropYears);
    const postDropAnnualSpendingDeficit = Math.max(
      0,
      annualSpendingDeficit - inputs.dependentDropOffAmount
    );
    const spendingPvNeed =
      presentValueAnnuity(
        annualSpendingDeficit,
        preDropYears,
        realDiscountRate
      ) +
      presentValueAnnuity(
        postDropAnnualSpendingDeficit,
        postDropYears,
        realDiscountRate
      ) / Math.pow(1 + realDiscountRate, preDropYears);
    const childAgeAtDeath = inputs.youngestChildAge + year;
    const childcareSupportYears = Math.min(
      remainingSpendingYears,
      Math.max(0, inputs.childcareSupportEndAge - childAgeAtDeath)
    );
    const childcareHouseholdSupportPv = presentValueAnnuity(
      inputs.childcareHouseholdSupportAnnual,
      childcareSupportYears,
      realDiscountRate
    );
    let collegeFundingPv = 0;
    if (includeCollegeFunding && inputs.annualCollegeFunding > 0) {
      for (
        let collegeYear = Math.max(year, inputs.collegeStartYear);
        collegeYear <= inputs.collegeEndYear;
        collegeYear += 1
      ) {
        collegeFundingPv +=
          inputs.annualCollegeFunding /
          Math.pow(1 + realDiscountRate, collegeYear - year);
      }
    }
    const grossSocialSecuritySurvivorPv =
      presentValueSocialSecuritySurvivorBenefits(inputs, year, realDiscountRate);
    const creditedSocialSecuritySurvivorPv =
      grossSocialSecuritySurvivorPv * socialSecurityCreditFactor;
    const selectedDisplayNeed =
      inputs.selectedNeedBasis === "income" ? incomePvNeed : spendingPvNeed;
    const nominalMortgagePrincipal = remainingMortgagePrincipal(
      inputs.mortgageBalance,
      inputs.mortgageAnnualRate,
      inputs.mortgageYearsRemaining,
      year
    );
    const realMortgagePrincipal = realCoverageAtYear(
      nominalMortgagePrincipal,
      inputs.inflationRate,
      year
    );
    const mortgagePayoffDemandReal = realMortgagePrincipal;
    const mortgageContinuePaymentsDemandReal =
      presentValueRemainingMortgagePayments(
        inputs.mortgageBalance,
        inputs.mortgageAnnualRate,
        inputs.mortgageYearsRemaining,
        year,
        inputs.inflationRate,
        realDiscountRate
      );
    const selectedMortgageStrategy =
      options.mortgageStrategy ?? inputs.mortgageStrategy;
    const realMortgageDemand =
      selectedMortgageStrategy === "payoff_at_death"
        ? mortgagePayoffDemandReal
        : mortgageContinuePaymentsDemandReal;
    const liquidAssets = accumulateRealAssets(
      inputs.currentLiquidAssets,
      inputs.annualNonRetirementSavings,
      realAssetGrowthRate,
      year
    );
    const retirementAssetsBeforeHaircut = accumulateRealAssets(
      inputs.currentRetirementAssets,
      inputs.annualRetirementSavings,
      realRetirementGrowthRate,
      year
    );
    const retirementAssetsAfterHaircut =
      retirementAssetsBeforeHaircut * (1 - retirementHaircut);
    const survivorPension = calculateSurvivorPensionValue(
      inputs,
      year,
      inputs.nominalDiscountRate
    );
    const pensionTaxAdjustedValueNominal = survivorPension.taxAdjustedValue;
    const pensionTaxAdjustedValue = realCoverageAtYear(
      pensionTaxAdjustedValueNominal,
      inputs.inflationRate,
      year
    );
    const accessibleAssets =
      liquidAssets + retirementAssetsAfterHaircut + pensionTaxAdjustedValue;
    const nominalEmployerCoverage =
      inputs.includeEmployerCoverage && year <= inputs.employerCoverageEndYear
        ? inputs.employerCoverageAmount
        : 0;
    const realEmployerCoverage = realCoverageAtYear(
      nominalEmployerCoverage,
      inputs.inflationRate,
      year
    );
    const creditedEmployerCoverage = realEmployerCoverage * employerCoverageCreditFactor;
    const spendingDemandReal = Math.max(
      0,
      spendingPvNeed +
        childcareHouseholdSupportPv +
        collegeFundingPv +
        realMortgageDemand -
        creditedSocialSecuritySurvivorPv
    );
    const spendingNeedAfterAssetsReal = Math.max(
      0,
      spendingDemandReal - accessibleAssets
    );
    const spendingNetNeedReal = Math.max(
      0,
      spendingNeedAfterAssetsReal - creditedEmployerCoverage
    );
    const exactNominalRequired = exactNominalCoverageRequired(
      spendingNetNeedReal,
      inputs.inflationRate,
      year
    );
    const nominalRequiredCoverage = roundedNominalCoverageRequired(
      spendingNetNeedReal,
      inputs.inflationRate,
      year,
      inputs.coverageIncrement
    );
    const capitalSupply = accessibleAssets + creditedEmployerCoverage;
    const capitalDemand = spendingDemandReal;
    const capitalGap = capitalSupply - capitalDemand;

    rows.push({
      year,
      incomePvNeed,
      childcareHouseholdSupportPv,
      collegeFundingPv,
      grossSocialSecuritySurvivorPv,
      creditedSocialSecuritySurvivorPv,
      spendingPvNeed,
      selectedDisplayNeed,
      incomeSensitivityNeed: incomePvNeed,
      nominalMortgagePrincipal,
      realMortgageDemand,
      mortgagePayoffDemandReal,
      mortgageContinuePaymentsDemandReal,
      selectedMortgageStrategy,
      realMortgagePrincipal,
      liquidAssets,
      retirementAssetsBeforeHaircut,
      retirementAssetsAfterHaircut,
      effectiveRetirementTaxHaircut: retirementHaircut,
      pensionServiceYears: survivorPension.serviceYears,
      pensionGrossAnnualPension: survivorPension.grossAnnualPension,
      pensionSurvivorAnnualPension: survivorPension.survivorAnnualPension,
      pensionCommencementAge: survivorPension.commencementAge,
      pensionDefermentYears: survivorPension.defermentYears,
      pensionPaymentYears: survivorPension.paymentYears,
      pensionEarlyFactor: survivorPension.earlyFactor,
      pensionPresentValueNominal: survivorPension.presentValue,
      pensionTaxAdjustedValueNominal,
      pensionTaxAdjustedValue,
      accessibleAssets,
      spendingDemandReal,
      spendingNeedAfterAssetsReal,
      spendingNetNeedReal,
      exactNominalCoverageRequired: exactNominalRequired,
      nominalRequiredCoverage,
      realEmployerCoverage,
      creditedEmployerCoverage,
      nominalPersonalCoverage: 0,
      realPersonalCoverage: 0,
      personalLadderCoverage: 0,
      totalCoverage: creditedEmployerCoverage,
      undercoverage: spendingNetNeedReal,
      overcoverage: 0,
      capitalSupply,
      capitalDemand,
      capitalGap,
      capitalDeficit: Math.max(0, -capitalGap)
    });
  }

  return {
    rows,
    realDiscountRate,
    realAssetGrowthRate,
    realRetirementGrowthRate,
    effectiveRetirementTaxHaircut: retirementHaircut
  };
}

function coverageAtYear(amounts: Record<TermLength, number>, year: number) {
  return TERMS.reduce(
    (total, term) => total + (year < term ? amounts[term] : 0),
    0
  );
}

function buildPolicies(
  amounts: Record<TermLength, number>,
  inputs: CalculatorInputs
): PolicyRecommendation[] {
  return TERMS.map((termYears) => ({
    termYears,
    amount: amounts[termYears],
    activeYears: termYears,
    costWeight: inputs.costWeights[termYears]
  }));
}

export function solvePolicyLadder(
  rows: YearlyRow[],
  inputs: CalculatorInputs
) {
  const increment = Math.max(1, inputs.coverageIncrement);
  const cap = Math.max(increment, inputs.maxCoveragePerTerm);
  const requirements = rows
    .filter((row) => row.year < 30)
    .map((row) => row.nominalRequiredCoverage);

  const maxNeed = Math.max(0, ...requirements);
  let bestAmounts: Record<TermLength, number> | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestFace = Number.POSITIVE_INFINITY;
  let feasible = false;

  const maxByTerm: Record<TermLength, number> = {
    10: Math.ceil(Math.max(0, ...requirements.slice(0, 10)) / increment),
    15: Math.ceil(Math.max(0, ...requirements.slice(0, 15)) / increment),
    20: Math.ceil(Math.max(0, ...requirements.slice(0, 20)) / increment),
    30: Math.ceil(Math.max(0, ...requirements.slice(0, 30)) / increment)
  };

  for (let u30 = 0; u30 <= Math.max(maxByTerm[30], 0); u30 += 1) {
    const a30 = u30 * increment;
    for (let u20 = 0; u20 <= Math.max(maxByTerm[20], 0); u20 += 1) {
      const a20 = u20 * increment;
      const need15to19 = Math.max(0, ...requirements.slice(15, 20));
      if (a20 + a30 < need15to19) continue;

      for (let u15 = 0; u15 <= Math.max(maxByTerm[15], 0); u15 += 1) {
        const a15 = u15 * increment;
        const need10to14 = Math.max(0, ...requirements.slice(10, 15));
        if (a15 + a20 + a30 < need10to14) continue;

        const need0to9 = Math.max(0, ...requirements.slice(0, 10));
        const a10 = Math.max(
          0,
          Math.ceil((need0to9 - a15 - a20 - a30) / increment) * increment
        );
        if (a10 > cap || a15 > cap || a20 > cap || a30 > cap) continue;

        const amounts: Record<TermLength, number> = {
          10: a10,
          15: a15,
          20: a20,
          30: a30
        };
        const coversAll = requirements.every(
          (need, year) => coverageAtYear(amounts, year) >= need
        );
        if (!coversAll) continue;

        feasible = true;
        const weightedFaceAmount = TERMS.reduce(
          (sum, term) => sum + amounts[term] * inputs.costWeights[term],
          0
        );
        const totalFaceAmount = TERMS.reduce((sum, term) => sum + amounts[term], 0);
        if (
          weightedFaceAmount < bestScore ||
          (weightedFaceAmount === bestScore && totalFaceAmount < bestFace)
        ) {
          bestScore = weightedFaceAmount;
          bestFace = totalFaceAmount;
          bestAmounts = amounts;
        }
      }
    }
  }

  if (!bestAmounts) {
    const fallbackAmount = Math.ceil(maxNeed / increment) * increment;
    bestAmounts = {
      10: Math.min(cap, fallbackAmount),
      15: Math.min(cap, fallbackAmount),
      20: Math.min(cap, fallbackAmount),
      30: Math.min(cap, fallbackAmount)
    };
  }

  return {
    amounts: bestAmounts,
    policies: buildPolicies(bestAmounts, inputs),
    weightedFaceAmount: TERMS.reduce(
      (sum, term) => sum + bestAmounts[term] * inputs.costWeights[term],
      0
    ),
    feasible
  };
}

function totalPersonalCoverage(policies: PolicyRecommendation[]) {
  return policies.reduce((sum, policy) => sum + policy.amount, 0);
}

function policyAmount(policies: PolicyRecommendation[], term: TermLength) {
  return policies.find((policy) => policy.termYears === term)?.amount ?? 0;
}

function coverageGapByYear(rows: YearlyRow[]) {
  return rows.slice(0, 31).map((row) => ({
    year: row.year,
    shortfall: row.undercoverage,
    surplus: row.overcoverage
  }));
}

function calculateSingleLadder(
  inputs: CalculatorInputs,
  options: CalculationOptions = {}
): CalculatorResult {
  const {
    rows,
    realDiscountRate,
    realAssetGrowthRate,
    realRetirementGrowthRate,
    effectiveRetirementTaxHaircut
  } = buildBaseNeedRows(inputs, options);
  const effectivePricing = effectiveCostWeightsForRows(rows, inputs);
  const solverInputs = {
    ...inputs,
    costWeights: effectivePricing.weights
  };
  const solved = solvePolicyLadder(rows, solverInputs);
  const warnings: SolverWarning[] = [];

  const projectedRows = rows.map((row) => {
    const nominalPersonalCoverage =
      row.year < 30 ? coverageAtYear(solved.amounts, row.year) : 0;
    const realPersonalCoverage = realCoverageAtYear(
      nominalPersonalCoverage,
      inputs.inflationRate,
      row.year
    );
    const totalCoverage = row.creditedEmployerCoverage + realPersonalCoverage;
    const capitalDemand = row.spendingDemandReal;
    const capitalSupply = row.accessibleAssets + totalCoverage;
    const capitalGap = capitalSupply - capitalDemand;
    return {
      ...row,
      nominalPersonalCoverage,
      realPersonalCoverage,
      personalLadderCoverage: realPersonalCoverage,
      totalCoverage,
      undercoverage: Math.max(0, row.spendingNetNeedReal - realPersonalCoverage),
      overcoverage: Math.max(0, realPersonalCoverage - row.spendingNetNeedReal),
      capitalSupply,
      capitalDemand,
      capitalGap,
      capitalDeficit: Math.max(0, -capitalGap)
    };
  });

  const sufficiencyRows = projectedRows.slice(0, 31);
  const worstRow = sufficiencyRows.reduce((worst, row) =>
    row.capitalGap < worst.capitalGap ? row : worst
  );
  const firstDeficit = sufficiencyRows.find((row) => row.capitalGap < 0);

  if (projectedRows.some((row) => row.year >= 30 && row.spendingNetNeedReal > 0)) {
    warnings.push({
      kind: "residual-after-30",
      message:
        "Spending-basis real need remains after year 30. Available term products expire by year 30, so review permanent coverage, savings, or assumptions before relying on this ladder."
    });
  }

  if (!solved.feasible) {
    warnings.push({
      kind: "infeasible-cap",
      message:
        "The current per-term maximum prevented a fully feasible ladder. Increase the maximum term amount or review assumptions."
    });
  }

  const personalCoverage = totalPersonalCoverage(solved.policies);

  return {
    rows: projectedRows,
    policies: solved.policies,
    warnings,
    realDiscountRate,
    realAssetGrowthRate,
    realRetirementGrowthRate,
    effectiveRetirementTaxHaircut,
    effectiveCostWeights: effectivePricing.weights,
    premiumPricingAnchor: effectivePricing.anchor,
    capitalSufficiency: {
      worstGap: worstRow.capitalGap,
      worstGapYear: worstRow.year,
      firstDeficitYear: firstDeficit?.year ?? null
    },
    weightedFaceAmount: solved.weightedFaceAmount,
    recommended10YearTerm: policyAmount(solved.policies, 10),
    recommended15YearTerm: policyAmount(solved.policies, 15),
    recommended20YearTerm: policyAmount(solved.policies, 20),
    recommended30YearTerm: policyAmount(solved.policies, 30),
    totalInitialCoverage: personalCoverage,
    coverageGapByYear: coverageGapByYear(projectedRows),
    scenarioMatrix: []
  };
}

function scenarioConfigs(inputs: CalculatorInputs): ScenarioConfig[] {
  return [
    {
      id: "conservative",
      label: "Conservative / Max Safety",
      realReturn: inputs.realReturnConservative,
      employerCoverageCreditFactor: 0,
      socialSecurityCreditFactor: 0,
      includeCollegeFunding: false
    },
    {
      id: "base",
      label: "Base Case",
      realReturn: inputs.realReturnBaseCase,
      employerCoverageCreditFactor: inputs.employerCoverageCreditFactor,
      socialSecurityCreditFactor: inputs.socialSecurityCreditFactor,
      includeCollegeFunding: false
    },
    {
      id: "optimistic",
      label: "Optimistic / Lowest Coverage",
      realReturn: inputs.realReturnOptimistic,
      employerCoverageCreditFactor: 1,
      socialSecurityCreditFactor: 1,
      includeCollegeFunding: false
    }
  ];
}

function buildScenarioSummary(
  inputs: CalculatorInputs,
  config: ScenarioConfig
): ScenarioSummary {
  const commonOptions: CalculationOptions = {
    realReturnOverride: config.realReturn,
    employerCoverageCreditFactor: config.employerCoverageCreditFactor,
    socialSecurityCreditFactor: config.socialSecurityCreditFactor,
    includeCollegeFunding: config.includeCollegeFunding
  };
  const payoff = calculateSingleLadder(inputs, {
    ...commonOptions,
    mortgageStrategy: "payoff_at_death"
  });
  const continuePayments = calculateSingleLadder(inputs, {
    ...commonOptions,
    mortgageStrategy: "continue_monthly_payments"
  });
  const primary =
    inputs.mortgageStrategy === "payoff_at_death" ? payoff : continuePayments;
  const firstRow = primary.rows[0];
  const estimatedShortfall = Math.max(0, -primary.capitalSufficiency.worstGap);
  const estimatedSurplus = Math.max(0, primary.capitalSufficiency.worstGap);

  return {
    id: config.id,
    label: config.label,
    realReturn: config.realReturn,
    employerCoverageCreditFactor: config.employerCoverageCreditFactor,
    socialSecurityCreditFactor: config.socialSecurityCreditFactor,
    includesCollegeFunding: config.includeCollegeFunding,
    currentEmployerGroupCoverage: firstRow.realEmployerCoverage,
    creditedEmployerGroupCoverage: firstRow.creditedEmployerCoverage,
    personallyOwnedTermCoverage: primary.totalInitialCoverage,
    totalModeledCoverage:
      firstRow.creditedEmployerCoverage + primary.totalInitialCoverage,
    estimatedShortfall,
    estimatedSurplus,
    recommended10YearTerm: primary.recommended10YearTerm,
    recommended15YearTerm: primary.recommended15YearTerm,
    recommended20YearTerm: primary.recommended20YearTerm,
    recommended30YearTerm: primary.recommended30YearTerm,
    mortgageStrategy: firstRow.selectedMortgageStrategy,
    mortgageStrategyComparison: [
      {
        strategy: "payoff_at_death",
        totalInitialCoverage: payoff.totalInitialCoverage,
        worstGap: payoff.capitalSufficiency.worstGap,
        firstDeficitYear: payoff.capitalSufficiency.firstDeficitYear,
        mortgageDemandYear0: payoff.rows[0].realMortgageDemand
      },
      {
        strategy: "continue_monthly_payments",
        totalInitialCoverage: continuePayments.totalInitialCoverage,
        worstGap: continuePayments.capitalSufficiency.worstGap,
        firstDeficitYear: continuePayments.capitalSufficiency.firstDeficitYear,
        mortgageDemandYear0: continuePayments.rows[0].realMortgageDemand
      }
    ]
  };
}

export function calculateLadder(inputs: CalculatorInputs): CalculatorResult {
  const baseOptions: CalculationOptions = {
    realReturnOverride: inputs.realReturnBaseCase,
    employerCoverageCreditFactor: inputs.employerCoverageCreditFactor,
    socialSecurityCreditFactor: inputs.socialSecurityCreditFactor,
    includeCollegeFunding: false
  };
  const payoff = calculateSingleLadder(inputs, {
    ...baseOptions,
    mortgageStrategy: "payoff_at_death"
  });
  const continuePayments = calculateSingleLadder(inputs, {
    ...baseOptions,
    mortgageStrategy: "continue_monthly_payments"
  });
  const result =
    inputs.mortgageStrategy === "payoff_at_death" ? payoff : continuePayments;
  const matrix = scenarioConfigs(inputs).map((config) =>
    buildScenarioSummary(inputs, config)
  );

  return {
    ...result,
    scenarioMatrix: matrix
  };
}
