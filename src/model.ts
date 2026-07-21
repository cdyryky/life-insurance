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
export const SOCIAL_SECURITY_2026_SOURCE_NOTES = [
  "SSA 2026 OASDI contribution and benefit base: $184,500",
  "SSA 2026 PIA bend points: $1,286 and $7,749",
  "SSA 2026 retirement/survivor family maximum bend points: $1,643, $2,371, and $3,093",
  "SSA survivor children generally receive 75% of the parent's benefit, subject to the family maximum"
];
type CalculationOptions = {
  realDiscountRateOverride?: number;
  socialSecurityCreditFactor?: number;
  mortgageStrategy?: MortgageStrategy;
  includeCollegeFunding?: boolean;
};

type ScenarioConfig = {
  id: ScenarioId;
  label: string;
  realDiscountRate: number;
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

export function presentValueSurvivorSpending(
  inputs: CalculatorInputs,
  deathYear: number,
  realDiscountRate: number
) {
  const spouseAgeAtDeath = inputs.spouseAge + deathYear;
  const remainingMonths = Math.max(
    0,
    Math.round((inputs.survivingSpouseLongevityAge - spouseAgeAtDeath) * 12)
  );
  const monthlyRealDiscountRate = Math.pow(1 + realDiscountRate, 1 / 12) - 1;
  let presentValue = 0;

  for (let month = 0; month < remainingMonths; month += 1) {
    const yearsAfterDeath = month / 12;
    const modelYear = deathYear + yearsAfterDeath;
    const spouseAge = spouseAgeAtDeath + yearsAfterDeath;
    const householdSpendingMonthly = Math.max(
      0,
      inputs.monthlyHouseholdNeedExcludingMortgage -
        (modelYear >= inputs.dependentDropOffYear
          ? inputs.dependentDropOffAmount / 12
          : 0)
    );
    const earnedIncomeMonthly =
      spouseAge < inputs.survivingSpouseIncomeEndAge
        ? Math.max(0, inputs.survivingSpouseIncome) / 12
        : 0;
    const retirementIncomeMonthly =
      spouseAge >= inputs.survivingSpouseRetirementIncomeStartAge
        ? Math.max(0, inputs.survivingSpouseRetirementIncome) / 12
        : 0;
    const monthlyDeficit = Math.max(
      0,
      householdSpendingMonthly - earnedIncomeMonthly - retirementIncomeMonthly
    );

    presentValue +=
      monthlyDeficit / Math.pow(1 + monthlyRealDiscountRate, month);
  }

  return presentValue;
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
  if (!inputs.socialSecurityStatementVerified) return 0;
  const childEndAge = inputs.socialSecurityChildSecondarySchoolToAge19 ? 19 : 18;
  const ages = inputs.childAges.map(
    (age) => Math.max(0, age) + deathYear + benefitYearOffset
  );
  const eligibleChildren = ages.filter((age) => age < childEndAge).length;
  const hasCaregiverEligibility = ages.some((age) => age < 16);
  if (eligibleChildren <= 0) return 0;

  const uncappedMonthly =
    eligibleChildren * Math.max(0, inputs.socialSecurityChildMonthlyBenefit) +
    (hasCaregiverEligibility
      ? Math.max(0, inputs.socialSecurityCaregiverMonthlyBenefit)
      : 0);
  const familyMaximum = Math.max(
    0,
    inputs.socialSecurityFamilyMaximumMonthlyBenefit
  );
  const creditedMonthly =
    familyMaximum > 0 ? Math.min(uncappedMonthly, familyMaximum) : uncappedMonthly;
  return creditedMonthly * 12;
}

export function presentValueSocialSecuritySurvivorBenefits(
  inputs: CalculatorInputs,
  deathYear: number,
  realDiscountRate: number
) {
  if (!inputs.socialSecurityStatementVerified) return 0;
  const childEndAge = inputs.socialSecurityChildSecondarySchoolToAge19 ? 19 : 18;
  const youngestAge = Math.min(...inputs.childAges.map((age) => Math.max(0, age)), childEndAge);
  const maxBenefitYears = Math.max(0, Math.ceil(childEndAge - youngestAge - deathYear));
  let presentValue = 0;

  for (let offset = 0; offset < maxBenefitYears; offset += 1) {
    presentValue +=
      estimateAnnualSocialSecuritySurvivorBenefit(inputs, deathYear, offset) /
      Math.pow(1 + realDiscountRate, offset + 1);
  }

  return presentValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  return presentValueFixedNominalMonthlyPayments(
    payment,
    monthsLeft,
    year,
    inflationRate,
    realDiscountRate
  );
}

export function presentValueFixedNominalMonthlyPayments(
  monthlyPayment: number,
  months: number,
  deathYear: number,
  inflationRate: number,
  realDiscountRate: number
) {
  if (monthlyPayment <= 0 || months <= 0) return 0;
  const nominalAnnualDiscountRate =
    (1 + realDiscountRate) * (1 + inflationRate) - 1;
  const monthlyDiscountRate =
    Math.pow(1 + nominalAnnualDiscountRate, 1 / 12) - 1;
  const nominalPvAtDeath =
    Math.abs(monthlyDiscountRate) < 0.0000001
      ? monthlyPayment * months
      : monthlyPayment *
        ((1 - Math.pow(1 + monthlyDiscountRate, -months)) /
          monthlyDiscountRate);

  return nominalPvAtDeath / inflationFactor(inflationRate, deathYear);
}

export function presentValueMortgagePaymentsForBalance(
  balance: number,
  annualRate: number,
  yearsRemaining: number,
  deathYear: number,
  inflationRate: number,
  realDiscountRate: number
) {
  const monthsLeft = Math.round(Math.max(0, yearsRemaining - deathYear) * 12);
  if (balance <= 0 || monthsLeft <= 0) return 0;

  const payment = monthlyMortgagePayment(balance, annualRate, monthsLeft / 12);
  return presentValueFixedNominalMonthlyPayments(
    payment,
    monthsLeft,
    deathYear,
    inflationRate,
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
    options.realDiscountRateOverride ??
    fisherRealRate(inputs.nominalDiscountRate, inputs.inflationRate);
  const realAssetGrowthRate =
    fisherRealRate(inputs.nominalAssetGrowthRate, inputs.inflationRate);
  const realRetirementGrowthRate =
    fisherRealRate(inputs.nominalRetirementGrowthRate, inputs.inflationRate);
  const socialSecurityCreditFactor = clamp(
    options.socialSecurityCreditFactor ?? inputs.socialSecurityCreditFactor,
    0,
    1
  );
  const includeCollegeFunding =
    options.includeCollegeFunding ?? inputs.collegeFundingMode === "included";
  const retirementHaircut = effectiveRetirementTaxHaircut(inputs);
  const retirementHorizon = Math.max(0, inputs.retirementAge - inputs.insuredAge);
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
    const spendingPvNeed = presentValueSurvivorSpending(
      inputs,
      year,
      realDiscountRate
    );
    const youngestChildAge = inputs.childAges.length
      ? Math.min(...inputs.childAges.map((age) => Math.max(0, age)))
      : inputs.childcareSupportEndAge;
    const childAgeAtDeath = youngestChildAge + year;
    const childcareSupportYears = inputs.childAges.length
      ? Math.min(
          remainingSpendingYears,
          Math.max(0, inputs.childcareSupportEndAge - childAgeAtDeath)
        )
      : 0;
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
    const otherImmediateNeedsReal = Math.max(0, inputs.otherImmediateNeeds);
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
    const mortgagePaydownPercent = clamp(inputs.mortgagePaydownPercent, 0, 1);
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
    const mortgagePartialPaydownDemandReal =
      realMortgagePrincipal * mortgagePaydownPercent +
      presentValueMortgagePaymentsForBalance(
        nominalMortgagePrincipal * (1 - mortgagePaydownPercent),
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
        : selectedMortgageStrategy === "partial_paydown"
          ? mortgagePartialPaydownDemandReal
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
    const creditedEmployerCoverage = 0;
    const spendingDemandReal = Math.max(
      0,
      spendingPvNeed +
        childcareHouseholdSupportPv +
        collegeFundingPv +
        otherImmediateNeedsReal +
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
      otherImmediateNeedsReal,
      grossSocialSecuritySurvivorPv,
      creditedSocialSecuritySurvivorPv,
      spendingPvNeed,
      selectedDisplayNeed,
      incomeSensitivityNeed: incomePvNeed,
      nominalMortgagePrincipal,
      realMortgageDemand,
      mortgagePayoffDemandReal,
      mortgagePartialPaydownDemandReal,
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
      totalCoverage: 0,
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
  amounts: Record<TermLength, number>
): PolicyRecommendation[] {
  return TERMS.map((termYears) => ({
    termYears,
    amount: amounts[termYears],
    activeYears: termYears
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
  const peak = (start: number, end: number) =>
    Math.max(0, ...requirements.slice(start, end));
  const roundLayer = (amount: number) =>
    Math.ceil(Math.max(0, amount) / increment) * increment;
  const finalAmounts: Record<TermLength, number> = {
    10: 0,
    15: 0,
    20: 0,
    30: Math.min(cap, roundLayer(peak(20, 30)))
  };
  finalAmounts[20] = Math.min(
    cap,
    roundLayer(peak(15, 20) - finalAmounts[30])
  );
  finalAmounts[15] = Math.min(
    cap,
    roundLayer(peak(10, 15) - finalAmounts[20] - finalAmounts[30])
  );
  finalAmounts[10] = Math.min(
    cap,
    roundLayer(
      peak(0, 10) - finalAmounts[15] - finalAmounts[20] - finalAmounts[30]
    )
  );
  const feasible = requirements.every(
    (need, year) => coverageAtYear(finalAmounts, year) >= need
  );

  return {
    amounts: finalAmounts,
    policies: buildPolicies(finalAmounts),
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
  const solved = solvePolicyLadder(rows, inputs);
  const warnings: SolverWarning[] = [];

  const projectedRows = rows.map((row) => {
    const nominalPersonalCoverage =
      row.year < 30 ? coverageAtYear(solved.amounts, row.year) : 0;
    const realPersonalCoverage = realCoverageAtYear(
      nominalPersonalCoverage,
      inputs.inflationRate,
      row.year
    );
    const totalCoverage = realPersonalCoverage;
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
        "Spending-basis real need remains after the 30-year term window. Term policies cover years 0-29 in this model; review permanent coverage, savings, or assumptions for later years."
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
    capitalSufficiency: {
      worstGap: worstRow.capitalGap,
      worstGapYear: worstRow.year,
      firstDeficitYear: firstDeficit?.year ?? null
    },
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
      realDiscountRate: inputs.realReturnConservative,
      socialSecurityCreditFactor: 0,
      includeCollegeFunding: false
    },
    {
      id: "base",
      label: "Base Case",
      realDiscountRate: inputs.realReturnBaseCase,
      socialSecurityCreditFactor: inputs.socialSecurityCreditFactor,
      includeCollegeFunding: false
    },
    {
      id: "optimistic",
      label: "Lower-Need Scenario",
      realDiscountRate: inputs.realReturnOptimistic,
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
    realDiscountRateOverride: config.realDiscountRate,
    socialSecurityCreditFactor: config.socialSecurityCreditFactor,
    includeCollegeFunding: config.includeCollegeFunding
  };
  const payoff = calculateSingleLadder(inputs, {
    ...commonOptions,
    mortgageStrategy: "payoff_at_death"
  });
  const partialPaydown = calculateSingleLadder(inputs, {
    ...commonOptions,
    mortgageStrategy: "partial_paydown"
  });
  const continuePayments = calculateSingleLadder(inputs, {
    ...commonOptions,
    mortgageStrategy: "continue_monthly_payments"
  });
  const primary =
    inputs.mortgageStrategy === "payoff_at_death"
      ? payoff
      : inputs.mortgageStrategy === "partial_paydown"
        ? partialPaydown
        : continuePayments;
  const firstRow = primary.rows[0];
  const estimatedShortfall = Math.max(0, -primary.capitalSufficiency.worstGap);
  const estimatedSurplus = Math.max(0, primary.capitalSufficiency.worstGap);

  return {
    id: config.id,
    label: config.label,
    realDiscountRate: config.realDiscountRate,
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
        strategy: "partial_paydown",
        totalInitialCoverage: partialPaydown.totalInitialCoverage,
        worstGap: partialPaydown.capitalSufficiency.worstGap,
        firstDeficitYear: partialPaydown.capitalSufficiency.firstDeficitYear,
        mortgageDemandYear0: partialPaydown.rows[0].realMortgageDemand
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
    realDiscountRateOverride: inputs.realReturnBaseCase,
    socialSecurityCreditFactor: inputs.socialSecurityCreditFactor,
    includeCollegeFunding: false
  };
  const payoff = calculateSingleLadder(inputs, {
    ...baseOptions,
    mortgageStrategy: "payoff_at_death"
  });
  const partialPaydown = calculateSingleLadder(inputs, {
    ...baseOptions,
    mortgageStrategy: "partial_paydown"
  });
  const continuePayments = calculateSingleLadder(inputs, {
    ...baseOptions,
    mortgageStrategy: "continue_monthly_payments"
  });
  const result =
    inputs.mortgageStrategy === "payoff_at_death"
      ? payoff
      : inputs.mortgageStrategy === "partial_paydown"
        ? partialPaydown
        : continuePayments;
  const matrix = scenarioConfigs(inputs).map((config) =>
    buildScenarioSummary(inputs, config)
  );

  return {
    ...result,
    scenarioMatrix: matrix
  };
}
