package engine
import "testing"
func TestSWRNotEqualToPWR(t *testing.T) {
	annualReturns := make([]float64, 50)
	for i := range annualReturns { annualReturns[i] = 0.08 }
	for i := 0; i < 50; i += 5 { annualReturns[i] = -0.15 }
	req := StatisticsRequest{ Values:             []float64{100, 110}, AnnualReturnValues: annualReturns, }
	stats := CalculateStatisticsFromRequest(req)
if stats.SWR == stats.PWR { t.Errorf("SWR (%v) should differ from PWR (%v) for volatile series", stats.SWR, stats.PWR) }
if stats.SWR < 0 { t.Errorf("SWR should be non-negative, got %v", stats.SWR) }
}
func TestSWRUsesLongestStandardTerm(t *testing.T) {
	annualReturns := make([]float64, 50)
	for i := range annualReturns { annualReturns[i] = 0.08 }
	for i := 0; i < 50; i += 5 { annualReturns[i] = -0.15 }
	req := StatisticsRequest{ Values:             []float64{100, 110}, AnnualReturnValues: annualReturns, }
	stats := CalculateStatisticsFromRequest(req)
if stats.SWR != stats.SWR40Y { t.Errorf("SWR (%v) should equal SWR40Y (%v) when >=40 years of data available", stats.SWR, stats.SWR40Y) }
if stats.SWR > stats.SWR30Y { t.Errorf("SWR (%v) should be <= SWR30Y (%v) (longer term = more conservative)", stats.SWR, stats.SWR30Y) }
}
