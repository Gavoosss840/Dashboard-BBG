"""Broad, liquid candidate universes per region for the portfolio screener.

These are large/mid-cap, actively-traded names that resolve on Yahoo — deep
enough to surface genuine diversifiers and residual-alpha candidates without
fetching thousands of illiquid micro-caps on every click. Yahoo suffixes are
baked in (.PA Paris, .DE Xetra, .L London, .SW Zurich, .T Tokyo, .HK Hong Kong,
.AX Sydney, .SI Singapore, .KS Seoul, .TW Taipei, .MI Milan, .AS Amsterdam,
.MC Madrid, .ST Stockholm, .OL Oslo, .HE Helsinki, .CO Copenhagen).
"""

# Nasdaq-100 (technology/growth heavy).
NASDAQ = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "AVGO", "TSLA", "COST",
    "NFLX", "AMD", "PEP", "ADBE", "CSCO", "TMUS", "INTC", "QCOM", "INTU", "TXN",
    "AMGN", "HON", "AMAT", "BKNG", "ISRG", "VRTX", "ADP", "REGN", "MU", "PANW",
    "LRCX", "GILD", "ADI", "MELI", "SBUX", "MDLZ", "KLAC", "SNPS", "CDNS", "PYPL",
    "MAR", "CRWD", "ORLY", "CSX", "ASML", "ABNB", "FTNT", "NXP", "PCAR", "MNST",
    "WDAY", "ROP", "ADSK", "CPRT", "PAYX", "KDP", "ODP", "ROST", "IDXX", "DXCM",
    "FAST", "EA", "CTAS", "VRSK", "CCEP", "EXC", "KHC", "GEHC", "BKR", "CSGP",
    "XEL", "ANSS", "DDOG", "TTD", "ON", "CDW", "BIIB", "ZS", "GFS", "MRVL",
    "TEAM", "DASH", "WBD", "ILMN", "MDB", "LULU", "ARM", "SMCI", "CEG", "PDD",
]

# S&P 500 — a broad cross-sector slice of large caps (value, cyclicals,
# financials, health, energy, staples, industrials) complementing the Nasdaq set.
SP500 = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "LLY", "JPM", "V",
    "UNH", "XOM", "MA", "AVGO", "PG", "HD", "COST", "MRK", "ABBV", "CVX",
    "CRM", "WMT", "BAC", "KO", "PEP", "ADBE", "MCD", "TMO", "CSCO", "ACN",
    "ABT", "LIN", "WFC", "DIS", "DHR", "GE", "VZ", "TXN", "PM", "NKE",
    "CAT", "AMGN", "NEE", "RTX", "HON", "UNP", "LOW", "SPGI", "IBM", "GS",
    "BA", "BLK", "ELV", "PLD", "SBUX", "MDT", "DE", "AXP", "GILD", "ADP",
    "C", "CB", "MMC", "LMT", "BMY", "SYK", "MO", "TJX", "CI", "SO",
    "DUK", "SCHW", "ZTS", "PGR", "BSX", "CME", "MS", "USB", "EOG", "SLB",
    "APD", "ITW", "NOC", "WM", "MCK", "TGT", "CL", "PNC", "FCX", "GM",
    "F", "EMR", "AON", "MAR", "PSA", "GD", "MMM", "COF", "MET", "OXY",
]

# Europe — STOXX large caps across France, Germany, Switzerland, UK, Netherlands,
# Italy, Spain, Nordics.
EUROPE = [
    "MC.PA", "OR.PA", "RMS.PA", "TTE.PA", "SAN.PA", "AI.PA", "SU.PA", "EL.PA",
    "BNP.PA", "CS.PA", "DG.PA", "AIR.PA", "SAF.PA", "BN.PA", "KER.PA", "STLAP.PA",
    "CAP.PA", "ENGI.PA", "ORA.PA", "VIE.PA", "PUB.PA", "LR.PA", "ML.PA", "HO.PA",
    "SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "MBG.DE", "BAS.DE", "BMW.DE", "VOW3.DE",
    "MUV2.DE", "IFX.DE", "ADS.DE", "DB1.DE", "DHL.DE", "RWE.DE", "EOAN.DE", "BAYN.DE",
    "HEN3.DE", "MRK.DE", "VNA.DE", "DBK.DE",
    "NESN.SW", "ROG.SW", "NOVN.SW", "ZURN.SW", "UBSG.SW", "ABBN.SW", "SIKA.SW", "CFR.SW",
    "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "DGE.L",
    "BATS.L", "GLEN.L", "REL.L", "NG.L", "LSEG.L", "BARC.L", "PRU.L", "VOD.L",
    "ASML.AS", "PRX.AS", "INGA.AS", "AD.AS", "PHIA.AS", "WKL.AS", "HEIA.AS",
    "ISP.MI", "ENEL.MI", "ENI.MI", "UCG.MI", "RACE.MI", "STM.MI", "G.MI",
    "IBE.MC", "SAN.MC", "ITX.MC", "BBVA.MC", "TEF.MC",
    "NOVO-B.CO", "MAERSK-B.CO", "NDA-FI.HE", "NOKIA.HE", "EQNR.OL", "DNB.OL",
    "VOLV-B.ST", "ATCO-A.ST", "INVE-B.ST", "SEB-A.ST",
]

# Asia — Japan, Hong Kong / China, Australia, Korea, Taiwan, Singapore, India.
ASIA = [
    "7203.T", "6758.T", "6861.T", "9984.T", "8306.T", "9432.T", "6098.T", "7974.T",
    "6501.T", "8035.T", "4063.T", "9433.T", "8058.T", "8001.T", "6902.T", "7267.T",
    "6367.T", "6954.T", "4568.T", "8316.T", "6702.T", "9983.T", "4661.T", "6273.T",
    "7741.T", "8031.T", "9020.T", "4519.T", "6981.T", "6752.T",
    "0700.HK", "0941.HK", "1299.HK", "0388.HK", "0005.HK", "1810.HK", "9988.HK",
    "3690.HK", "0883.HK", "0175.HK", "1211.HK", "2318.HK", "0939.HK", "1398.HK",
    "2628.HK", "0027.HK", "1024.HK", "9618.HK", "9999.HK", "2020.HK",
    "BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX", "WBC.AX", "ANZ.AX", "WES.AX", "MQG.AX",
    "FMG.AX", "WOW.AX", "TLS.AX", "RIO.AX", "GMG.AX", "TCL.AX",
    "005930.KS", "000660.KS", "005380.KS", "051910.KS", "035420.KS", "005490.KS",
    "2330.TW", "2317.TW", "2454.TW", "2308.TW", "2412.TW",
    "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C6L.SI",
    "INFY", "HDB", "IBN", "TTM", "WIT",
]

UNIVERSES: dict[str, list[str]] = {
    "NASDAQ": NASDAQ,
    "SP500": SP500,
    "EUROPE": EUROPE,
    "ASIA": ASIA,
}

LABELS: dict[str, str] = {
    "NASDAQ": "Nasdaq-100",
    "SP500": "S&P 500",
    "EUROPE": "Europe (STOXX)",
    "ASIA": "Asie-Pacifique",
}


def universe(name: str) -> list[str]:
    return UNIVERSES.get(name.upper(), [])
