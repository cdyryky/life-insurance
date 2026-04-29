import type {
  CalculatorInputs,
  CalculatorResult,
  PolicyRecommendation,
  SolverWarning,
  TermLength,
  YearlyRow
} from "./types";

const TERMS: TermLength[] = [10, 15, 20, 30];
const HORIZON_YEARS = 40;

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

export function buildBaseNeedRows(inputs: CalculatorInputs) {
  const realDiscountRate = fisherRealRate(
    inputs.nominalDiscountRate,
    inputs.inflationRate
  );
  const realAssetGrowthRate = fisherRealRate(
    inputs.nominalAssetGrowthRate,
    inputs.inflationRate
  );
  const realRetirementGrowthRate = fisherRealRate(
    inputs.nominalRetirementGrowthRate,
    inputs.inflationRate
  );
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
    const spendingDemandReal = spendingPvNeed + realMortgagePrincipal;
    const spendingNeedAfterAssetsReal = Math.max(
      0,
      spendingDemandReal - accessibleAssets
    );
    const spendingNetNeedReal = Math.max(
      0,
      spendingNeedAfterAssetsReal - realEmployerCoverage
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
    const capitalSupply = accessibleAssets + realEmployerCoverage;
    const capitalDemand = spendingDemandReal;
    const capitalGap = capitalSupply - capitalDemand;

    rows.push({
      year,
      incomePvNeed,
      spendingPvNeed,
      selectedDisplayNeed,
      incomeSensitivityNeed: incomePvNeed,
      nominalMortgagePrincipal,
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
      pensionPresentValue: survivorPension.presentValue,
      pensionTaxAdjustedValueNominal,
      pensionTaxAdjustedValue,
      accessibleAssets,
      spendingDemandReal,
      spendingNeedAfterAssetsReal,
      spendingNetNeedReal,
      exactNominalCoverageRequired: exactNominalRequired,
      nominalRequiredCoverage,
      realEmployerCoverage,
      nominalPersonalCoverage: 0,
      realPersonalCoverage: 0,
      personalLadderCoverage: 0,
      totalCoverage: realEmployerCoverage,
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

export function calculateLadder(inputs: CalculatorInputs): CalculatorResult {
  const {
    rows,
    realDiscountRate,
    realAssetGrowthRate,
    realRetirementGrowthRate,
    effectiveRetirementTaxHaircut
  } = buildBaseNeedRows(inputs);
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
    const totalCoverage = row.realEmployerCoverage + realPersonalCoverage;
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
    weightedFaceAmount: solved.weightedFaceAmount
  };
}
