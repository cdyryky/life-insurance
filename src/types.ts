export type NeedBasis = "income" | "spending";

export type TermLength = 10 | 15 | 20 | 30;

export type PremiumWeightMode = "quote-derived" | "manual";

export type CalculatorInputs = {
  insuredAge: number;
  spouseAge: number;
  retirementAge: number;
  survivingSpouseLongevityAge: number;
  annualIncome: number;
  monthlyHouseholdNeedExcludingMortgage: number;
  survivingSpouseIncome: number;
  dependentDropOffYear: number;
  dependentDropOffAmount: number;
  currentLiquidAssets: number;
  annualNonRetirementSavings: number;
  nominalAssetGrowthRate: number;
  currentRetirementAssets: number;
  annualRetirementSavings: number;
  nominalRetirementGrowthRate: number;
  preTaxRetirementShare: number;
  preTaxRetirementHaircut: number;
  postTaxRetirementHaircut: number;
  includeSurvivorPension: boolean;
  pensionCurrentServiceYears: number;
  pensionHac: number;
  pensionSurvivorFactor: number;
  pensionTaxAdjustmentFactor: number;
  pensionVestingYears: number;
  pensionNormalRetirementAge: number;
  pensionMinimumCommencementAge: number;
  pensionEarlyReductionRate: number;
  inflationRate: number;
  nominalDiscountRate: number;
  mortgageBalance: number;
  mortgageAnnualRate: number;
  mortgageYearsRemaining: number;
  employerCoverageAmount: number;
  employerCoverageEndYear: number;
  includeEmployerCoverage: boolean;
  selectedNeedBasis: NeedBasis;
  coverageIncrement: number;
  maxCoveragePerTerm: number;
  premiumWeightMode: PremiumWeightMode;
  costWeights: Record<TermLength, number>;
};

export type PolicyRecommendation = {
  termYears: TermLength;
  amount: number;
  activeYears: number;
  costWeight: number;
};

export type YearlyRow = {
  year: number;
  incomePvNeed: number;
  spendingPvNeed: number;
  selectedDisplayNeed: number;
  incomeSensitivityNeed: number;
  nominalMortgagePrincipal: number;
  realMortgagePrincipal: number;
  liquidAssets: number;
  retirementAssetsBeforeHaircut: number;
  retirementAssetsAfterHaircut: number;
  effectiveRetirementTaxHaircut: number;
  pensionServiceYears: number;
  pensionGrossAnnualPension: number;
  pensionSurvivorAnnualPension: number;
  pensionCommencementAge: number;
  pensionDefermentYears: number;
  pensionPaymentYears: number;
  pensionEarlyFactor: number;
  pensionPresentValueNominal: number;
  pensionTaxAdjustedValueNominal: number;
  pensionTaxAdjustedValue: number;
  accessibleAssets: number;
  spendingDemandReal: number;
  spendingNeedAfterAssetsReal: number;
  spendingNetNeedReal: number;
  exactNominalCoverageRequired: number;
  nominalRequiredCoverage: number;
  realEmployerCoverage: number;
  nominalPersonalCoverage: number;
  realPersonalCoverage: number;
  /** @deprecated Legacy alias for realPersonalCoverage. Prefer realPersonalCoverage. */
  personalLadderCoverage: number;
  totalCoverage: number;
  undercoverage: number;
  overcoverage: number;
  capitalSupply: number;
  capitalDemand: number;
  capitalGap: number;
  capitalDeficit: number;
};

export type CapitalSufficiency = {
  worstGap: number;
  worstGapYear: number;
  firstDeficitYear: number | null;
};

export type SolverWarning = {
  kind: "residual-after-30" | "infeasible-cap";
  message: string;
};

export type CalculatorResult = {
  rows: YearlyRow[];
  policies: PolicyRecommendation[];
  warnings: SolverWarning[];
  realDiscountRate: number;
  realAssetGrowthRate: number;
  realRetirementGrowthRate: number;
  effectiveRetirementTaxHaircut: number;
  effectiveCostWeights: Record<TermLength, number>;
  premiumPricingAnchor: number;
  capitalSufficiency: CapitalSufficiency;
  weightedFaceAmount: number;
};
