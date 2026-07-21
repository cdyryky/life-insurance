export type NeedBasis = "income" | "spending";

export type TermLength = 10 | 15 | 20 | 30;

export type MortgageStrategy =
  | "payoff_at_death"
  | "partial_paydown"
  | "continue_monthly_payments";

export type CollegeFundingMode = "excluded" | "included";

export type ScenarioId =
  | "conservative"
  | "base"
  | "optimistic";

export type CalculatorInputs = {
  insuredAge: number;
  spouseAge: number;
  retirementAge: number;
  survivingSpouseLongevityAge: number;
  annualIncome: number;
  monthlyHouseholdNeedExcludingMortgage: number;
  survivingSpouseIncome: number;
  survivingSpouseIncomeEndAge: number;
  survivingSpouseRetirementIncome: number;
  survivingSpouseRetirementIncomeStartAge: number;
  dependentDropOffYear: number;
  dependentDropOffAmount: number;
  childcareHouseholdSupportAnnual: number;
  childcareSupportEndAge: number;
  collegeFundingMode: CollegeFundingMode;
  annualCollegeFunding: number;
  collegeStartYear: number;
  collegeEndYear: number;
  otherImmediateNeeds: number;
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
  mortgageStrategy: MortgageStrategy;
  mortgagePaydownPercent: number;
  employerCoverageAmount: number;
  employerCoverageEndYear: number;
  employerCoverageCreditFactor: number;
  includeEmployerCoverage: boolean;
  socialSecurityCreditFactor: number;
  socialSecurityStatementVerified: boolean;
  socialSecurityChildMonthlyBenefit: number;
  socialSecurityCaregiverMonthlyBenefit: number;
  socialSecurityFamilyMaximumMonthlyBenefit: number;
  childAges: number[];
  socialSecurityCoveredAnnualEarnings: number;
  socialSecurityChildSecondarySchoolToAge19: boolean;
  realReturnBaseCase: number;
  realReturnConservative: number;
  realReturnOptimistic: number;
  selectedNeedBasis: NeedBasis;
  coverageIncrement: number;
  maxCoveragePerTerm: number;
  readinessChecks: Record<PurchaseReadinessKey, boolean>;
};

export type PurchaseReadinessKey =
  | "spending"
  | "spouseIncome"
  | "mortgage"
  | "assetsSavings"
  | "children"
  | "socialSecurity"
  | "employerPlan"
  | "beneficiaries"
  | "immediateObligations"
  | "affordability";

export type PolicyRecommendation = {
  termYears: TermLength;
  amount: number;
  activeYears: number;
};

export type YearlyRow = {
  year: number;
  incomePvNeed: number;
  childcareHouseholdSupportPv: number;
  collegeFundingPv: number;
  otherImmediateNeedsReal: number;
  grossSocialSecuritySurvivorPv: number;
  creditedSocialSecuritySurvivorPv: number;
  spendingPvNeed: number;
  selectedDisplayNeed: number;
  incomeSensitivityNeed: number;
  nominalMortgagePrincipal: number;
  realMortgageDemand: number;
  mortgagePayoffDemandReal: number;
  mortgagePartialPaydownDemandReal: number;
  mortgageContinuePaymentsDemandReal: number;
  selectedMortgageStrategy: MortgageStrategy;
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
  creditedEmployerCoverage: number;
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
  capitalSufficiency: CapitalSufficiency;
  recommended10YearTerm: number;
  recommended15YearTerm: number;
  recommended20YearTerm: number;
  recommended30YearTerm: number;
  totalInitialCoverage: number;
  coverageGapByYear: { year: number; shortfall: number; surplus: number }[];
  scenarioMatrix: ScenarioSummary[];
};

export type MortgageStrategyComparison = {
  strategy: MortgageStrategy;
  totalInitialCoverage: number;
  worstGap: number;
  firstDeficitYear: number | null;
  mortgageDemandYear0: number;
};

export type ScenarioSummary = {
  id: ScenarioId;
  label: string;
  realDiscountRate: number;
  socialSecurityCreditFactor: number;
  includesCollegeFunding: boolean;
  currentEmployerGroupCoverage: number;
  creditedEmployerGroupCoverage: number;
  personallyOwnedTermCoverage: number;
  totalModeledCoverage: number;
  estimatedShortfall: number;
  estimatedSurplus: number;
  recommended10YearTerm: number;
  recommended15YearTerm: number;
  recommended20YearTerm: number;
  recommended30YearTerm: number;
  mortgageStrategy: MortgageStrategy;
  mortgageStrategyComparison: MortgageStrategyComparison[];
};
