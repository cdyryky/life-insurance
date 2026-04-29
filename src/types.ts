export type NeedBasis = "income" | "spending";

export type TermLength = 10 | 15 | 20 | 30;

export type CalculatorInputs = {
  insuredAge: number;
  spouseAge: number;
  retirementAge: number;
  survivingSpouseLongevityAge: number;
  annualIncome: number;
  monthlyHouseholdNeedExcludingMortgage: number;
  survivingSpouseIncome: number;
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
  selectedPvNeed: number;
  mortgagePrincipal: number;
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
  pensionPresentValue: number;
  pensionTaxAdjustedValue: number;
  accessibleAssets: number;
  grossNeed: number;
  employerCoverage: number;
  selectedNetNeed: number;
  personalLadderCoverage: number;
  totalCoverage: number;
  undercoverage: number;
  overcoverage: number;
  capitalSupply: number;
  capitalDemand: number;
  capitalGap: number;
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
  capitalSufficiency: CapitalSufficiency;
  weightedFaceAmount: number;
};
