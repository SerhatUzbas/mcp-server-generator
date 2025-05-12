import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

// Create the MCP server
const server = new McpServer({
  name: "crypto-advisor",
  version: "1.0.0",
  description: "Real-time cryptocurrency data and personalized investment insights"
});

// Define constants
const BASE_URL = "https://pro-api.coinmarketcap.com/v1";
const DEFAULT_LIMIT = 100;
const DEFAULT_CURRENCY = "USD";

// Check if API key is set
const getCmcApiKey = () => {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) {
    throw new Error("COINMARKETCAP_API_KEY environment variable is not set. Please configure it in Claude Desktop.");
  }
  return apiKey;
};

// Helper function to make API requests to CoinMarketCap
async function fetchFromCMC(endpoint, params = {}) {
  try {
    const apiKey = getCmcApiKey();
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: {
        "X-CMC_PRO_API_KEY": apiKey
      },
      params: {
        ...params
      }
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching data from CoinMarketCap:", error.response?.data || error.message);
    throw new Error(`CoinMarketCap API error: ${error.response?.data?.status?.error_message || error.message}`);
  }
}

// Tool: Get cryptocurrency recommendations based on investment strategy and time horizon
server.tool(
  "getCryptoRecommendations",
  {
    strategy: z.enum(["buy", "sell", "short", "long"]).describe("Investment strategy (buy, sell, short, long)"),
    timeInterval: z.enum(["short-term", "medium-term", "long-term"]).describe("Time horizon for the investment"),
    limit: z.number().min(1).max(100).default(5).describe("Number of recommendations to return"),
    riskTolerance: z.enum(["low", "medium", "high"]).default("medium").describe("Risk tolerance level")
  },
  async ({ strategy, timeInterval, limit, riskTolerance }) => {
    try {
      // 1. Fetch latest listings with market data
      const listings = await fetchFromCMC("/cryptocurrency/listings/latest", {
        limit: DEFAULT_LIMIT,
        convert: DEFAULT_CURRENCY
      });

      // 2. Get market metrics for analysis
      const marketMetrics = await fetchFromCMC("/global-metrics/quotes/latest", {
        convert: DEFAULT_CURRENCY
      });

      // 3. Process the data and generate recommendations
      const recommendations = generateRecommendations(
        listings.data,
        marketMetrics.data,
        strategy,
        timeInterval,
        riskTolerance,
        limit
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(recommendations, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Get detailed information about a specific cryptocurrency
server.tool(
  "getCryptoDetails",
  {
    symbol: z.string().describe("Cryptocurrency symbol (e.g., BTC, ETH)"),
    convert: z.string().default(DEFAULT_CURRENCY).describe("Currency to convert prices to")
  },
  async ({ symbol, convert }) => {
    try {
      if (!symbol) {
        return {
          content: [{ type: "text", text: "Error: Symbol is required" }],
          isError: true
        };
      }

      // Normalize the symbol and ensure uppercase
      const symbolFormatted = symbol.trim().toUpperCase();
      
      // Fetch detailed info about the specified cryptocurrency
      const response = await fetchFromCMC("/cryptocurrency/quotes/latest", {
        symbol: symbolFormatted,
        convert
      });
      
      // Properly validate the response data
      if (!response || !response.data || !response.data.data) {
        return {
          content: [{ type: "text", text: `Error fetching data for ${symbolFormatted}: Invalid API response structure` }],
          isError: true
        };
      }

      // Check if the requested symbol exists in the data
      if (!response.data.data[symbolFormatted]) {
        return {
          content: [{ 
            type: "text", 
            text: `Cryptocurrency with symbol "${symbolFormatted}" not found. Please verify the symbol and try again.` 
          }],
          isError: true
        };
      }

      // Extract and format the data
      const coin = response.data.data[symbolFormatted];
      
      // Check for the required data structure
      if (!coin.quote || !coin.quote[convert]) {
        return {
          content: [{ 
            type: "text", 
            text: `Price data for ${symbolFormatted} in ${convert} is not available.` 
          }],
          isError: true
        };
      }

      // Safely extract the quote data with null checks
      const quote = coin.quote[convert];
      
      // Create a structured response with proper null/undefined handling
      const details = {
        name: coin.name || 'Unknown',
        symbol: coin.symbol,
        rank: coin.cmc_rank || null,
        price: quote.price || null,
        market_cap: quote.market_cap || null,
        volume_24h: quote.volume_24h || null,
        percent_change_1h: quote.percent_change_1h || null,
        percent_change_24h: quote.percent_change_24h || null,
        percent_change_7d: quote.percent_change_7d || null,
        percent_change_30d: quote.percent_change_30d || null,
        circulating_supply: coin.circulating_supply || null,
        total_supply: coin.total_supply || null,
        max_supply: coin.max_supply || null,
        last_updated: quote.last_updated || null,
        // Add additional useful information
        tags: coin.tags || [],
        platform: coin.platform || null,
        date_added: coin.date_added || null,
        is_active: coin.is_active !== undefined ? coin.is_active : null
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(details, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error(`Error in getCryptoDetails for ${symbol}:`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Error fetching data for ${symbol}: ${error.message || 'Unknown error'}. Please check if the symbol is correct.` 
        }],
        isError: true
      };
    }
  }
);


// Function to generate crypto recommendations based on criteria
function generateRecommendations(coins, marketMetrics, strategy, timeInterval, riskTolerance, limit) {
  // Extract global metrics
  const globalData = marketMetrics.quote[DEFAULT_CURRENCY];
  const marketCap = globalData.total_market_cap;
  const btcDominance = globalData.btc_dominance;
  const marketCapChange24h = globalData.total_market_cap_yesterday_percentage_change;
  
  // Define time windows based on the time interval
  const timeWindows = {
    "short-term": ["percent_change_1h", "percent_change_24h", "percent_change_7d"],
    "medium-term": ["percent_change_7d", "percent_change_30d"],
    "long-term": ["percent_change_30d", "percent_change_60d", "percent_change_90d"]
  };
  
  // Get relevant time windows for the specified interval
  const relevantTimeWindows = timeWindows[timeInterval];
  
  // Filter and score coins based on the strategy
  let scoredCoins = coins.map(coin => {
    const quote = coin.quote[DEFAULT_CURRENCY];
    let score = 0;
    let reasons = [];
    
    // Calculate base score from price changes in relevant time windows
    for (const window of relevantTimeWindows) {
      if (quote[window]) {
        // For buy/long strategies, positive changes are good
        if (strategy === "buy" || strategy === "long") {
          score += quote[window];
          if (quote[window] > 10) {
            reasons.push(`Strong upward momentum: ${window.replace("percent_change_", "")} change of ${quote[window].toFixed(2)}%`);
          }
        } 
        // For sell/short strategies, negative changes are good
        else if (strategy === "sell" || strategy === "short") {
          score -= quote[window];
          if (quote[window] < -10) {
            reasons.push(`Downward trend: ${window.replace("percent_change_", "")} change of ${quote[window].toFixed(2)}%`);
          }
        }
      }
    }
    
    // Factor in volume and market cap
    const volumeToMarketCapRatio = quote.volume_24h / quote.market_cap;
    
    // High volume relative to market cap could indicate interest or volatility
    if (volumeToMarketCapRatio > 0.1) {
      score += strategy === "short" || strategy === "sell" ? -10 : 10;
      reasons.push(`High trading volume relative to market cap: ${(volumeToMarketCapRatio * 100).toFixed(2)}%`);
    }
    
    // Risk adjustments
    if (riskTolerance === "low") {
      // Lower risk: favor higher market cap coins
      if (coin.cmc_rank <= 20) {
        score += 20;
        reasons.push("Large market cap (top 20) provides reduced volatility risk");
      }
    } else if (riskTolerance === "high") {
      // Higher risk: favor smaller market cap coins with potential
      if (coin.cmc_rank > 50 && coin.cmc_rank <= 200) {
        score += 15;
        reasons.push("Smaller market cap with growth potential");
      }
    }
    
    // Technical factors
    if (quote.percent_change_24h * quote.percent_change_7d > 0) {
      const direction = quote.percent_change_24h > 0 ? "positive" : "negative";
      score += strategy === "buy" || strategy === "long" ? 
               (direction === "positive" ? 15 : -15) : 
               (direction === "negative" ? 15 : -15);
      reasons.push(`Consistent ${direction} trend in 24h and 7d periods`);
    }
    
    // Adjust for overall market trend
    if ((marketCapChange24h > 0 && (strategy === "buy" || strategy === "long")) || 
        (marketCapChange24h < 0 && (strategy === "sell" || strategy === "short"))) {
      score += 10;
      reasons.push(`Aligned with overall market trend (${marketCapChange24h.toFixed(2)}% 24h change)`);
    }
    
    // Calculate metrics
    const metrics = {
      price: quote.price,
      market_cap: quote.market_cap,
      volume_24h: quote.volume_24h,
      percent_change_1h: quote.percent_change_1h,
      percent_change_24h: quote.percent_change_24h,
      percent_change_7d: quote.percent_change_7d,
      percent_change_30d: quote.percent_change_30d,
      volume_to_market_cap_ratio: volumeToMarketCapRatio
    };
    
    return {
      name: coin.name,
      symbol: coin.symbol,
      rank: coin.cmc_rank,
      score,
      reasons,
      metrics
    };
  });
  
  // Sort by score (descending for buy/long, ascending for sell/short)
  if (strategy === "buy" || strategy === "long") {
    scoredCoins.sort((a, b) => b.score - a.score);
  } else {
    scoredCoins.sort((a, b) => a.score - b.score);
  }
  
  // Take top N coins based on limit
  const topCoins = scoredCoins.slice(0, limit);
  
  // Format the final response
  return {
    strategy,
    timeInterval,
    riskTolerance,
    marketConditions: {
      total_market_cap: marketCap,
      btc_dominance: btcDominance,
      market_cap_change_24h: marketCapChange24h
    },
    recommendations: topCoins
  };
}

// Tool: Get market overview with trends and sentiment
server.tool(
  "getMarketOverview",
  {
    convert: z.string().default(DEFAULT_CURRENCY).describe("Currency for market data")
  },
  async ({ convert }) => {
    try {
      // Get global market data
      const globalData = await fetchFromCMC("/global-metrics/quotes/latest", {
        convert
      });
      
      // Get trending coins (top gainers and losers)
      const listings = await fetchFromCMC("/cryptocurrency/listings/latest", {
        limit: 100,
        convert,
        sort: "percent_change_24h"
      });
      
      // Extract market data
      const marketData = globalData.data.quote[convert];
      
      // Get top gainers and losers
      const coins = listings.data;
      const topGainers = coins
        .filter(coin => coin.quote[convert].percent_change_24h > 0)
        .sort((a, b) => b.quote[convert].percent_change_24h - a.quote[convert].percent_change_24h)
        .slice(0, 5)
        .map(coin => ({
          name: coin.name,
          symbol: coin.symbol,
          price: coin.quote[convert].price,
          percent_change_24h: coin.quote[convert].percent_change_24h
        }));
        
      const topLosers = coins
        .filter(coin => coin.quote[convert].percent_change_24h < 0)
        .sort((a, b) => a.quote[convert].percent_change_24h - b.quote[convert].percent_change_24h)
        .slice(0, 5)
        .map(coin => ({
          name: coin.name,
          symbol: coin.symbol,
          price: coin.quote[convert].price,
          percent_change_24h: coin.quote[convert].percent_change_24h
        }));
      
      // Calculate market sentiment
      const marketSentiment = determineMarketSentiment(marketData);
      
      // Format the overview
      const overview = {
        timestamp: new Date().toISOString(),
        market_data: {
          total_market_cap: marketData.total_market_cap,
          total_volume_24h: marketData.total_volume_24h,
          btc_dominance: globalData.data.btc_dominance,
          eth_dominance: globalData.data.eth_dominance,
          market_cap_change_24h: marketData.total_market_cap_yesterday_percentage_change,
          volume_change_24h: marketData.total_volume_24h_yesterday_percentage_change
        },
        sentiment: marketSentiment,
        top_gainers: topGainers,
        top_losers: topLosers
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(overview, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching market overview: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Function to determine market sentiment based on metrics
function determineMarketSentiment(marketData) {
  const capChange = marketData.total_market_cap_yesterday_percentage_change;
  const volumeChange = marketData.total_volume_24h_yesterday_percentage_change;
  
  let sentiment = "";
  let explanation = "";
  
  // Determine base sentiment from market cap change
  if (capChange > 5) {
    sentiment = "Strongly Bullish";
    explanation = `Market cap increased significantly by ${capChange.toFixed(2)}% in the last 24 hours.`;
  } else if (capChange > 2) {
    sentiment = "Bullish";
    explanation = `Market cap increased by ${capChange.toFixed(2)}% in the last 24 hours.`;
  } else if (capChange > -2) {
    sentiment = "Neutral";
    explanation = `Market cap relatively stable with ${capChange.toFixed(2)}% change in the last 24 hours.`;
  } else if (capChange > -5) {
    sentiment = "Bearish";
    explanation = `Market cap decreased by ${Math.abs(capChange).toFixed(2)}% in the last 24 hours.`;
  } else {
    sentiment = "Strongly Bearish";
    explanation = `Market cap decreased significantly by ${Math.abs(capChange).toFixed(2)}% in the last 24 hours.`;
  }
  
  // Adjust based on volume
  if (volumeChange > 20 && capChange > 0) {
    explanation += ` Trading volume increased by ${volumeChange.toFixed(2)}%, indicating strong buying pressure.`;
  } else if (volumeChange > 20 && capChange < 0) {
    explanation += ` Trading volume increased by ${volumeChange.toFixed(2)}%, indicating strong selling pressure.`;
  } else if (volumeChange < -20) {
    explanation += ` Trading volume decreased by ${Math.abs(volumeChange).toFixed(2)}%, indicating reduced market activity.`;
  }
  
  return {
    rating: sentiment,
    explanation
  };
}

// Tool: Get price comparisons and trends analysis
server.tool(
  "analyzeTrends",
  {
    symbols: z.string().describe("Comma-separated list of cryptocurrency symbols (e.g., BTC,ETH,XRP)"),
    convert: z.string().default(DEFAULT_CURRENCY).describe("Currency to convert prices to"),
    timeInterval: z.enum(["short-term", "medium-term", "long-term"]).default("medium-term").describe("Time interval for analysis")
  },
  async ({ symbols, convert, timeInterval }) => {
    try {
      // Parse symbol list
      const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase());
      
      if (symbolArray.length === 0 || symbolArray.length > 10) {
        throw new Error("Please provide between 1 and 10 cryptocurrency symbols");
      }
      
      // Fetch data for all symbols
      const response = await fetchFromCMC("/cryptocurrency/quotes/latest", {
        symbol: symbolArray.join(','),
        convert
      });
      
      // Process the data
      const coins = response.data.data;
      
      // Get market data for context
      const marketData = await fetchFromCMC("/global-metrics/quotes/latest", {
        convert
      });
      
      // Determine time windows for comparison
      const timeWindows = {
        "short-term": ["percent_change_1h", "percent_change_24h", "percent_change_7d"],
        "medium-term": ["percent_change_7d", "percent_change_30d"],
        "long-term": ["percent_change_30d", "percent_change_60d", "percent_change_90d"]
      };
      
      const relevantWindows = timeWindows[timeInterval];
      
      // Analyze each coin
      const analyses = [];
      
      for (const symbol of symbolArray) {
        const coin = coins[symbol];
        
        if (!coin) {
          analyses.push({
            symbol,
            error: "Coin not found or data unavailable"
          });
          continue;
        }
        
        const quote = coin.quote[convert];
        
        // Calculate trend strength and direction
        let trendScore = 0;
        let trendStrength = 0;
        
        for (const window of relevantWindows) {
          if (quote[window]) {
            trendScore += quote[window];
            trendStrength += Math.abs(quote[window]);
          }
        }
        
        const averageTrendScore = trendScore / relevantWindows.length;
        const averageTrendStrength = trendStrength / relevantWindows.length;
        
        // Determine trend direction
        let trendDirection;
        if (averageTrendScore > 5) {
          trendDirection = "Strong Uptrend";
        } else if (averageTrendScore > 1) {
          trendDirection = "Moderate Uptrend";
        } else if (averageTrendScore > -1) {
          trendDirection = "Sideways/Neutral";
        } else if (averageTrendScore > -5) {
          trendDirection = "Moderate Downtrend";
        } else {
          trendDirection = "Strong Downtrend";
        }
        
        // Volatility assessment
        let volatility;
        if (averageTrendStrength > 20) {
          volatility = "Very High";
        } else if (averageTrendStrength > 10) {
          volatility = "High";
        } else if (averageTrendStrength > 5) {
          volatility = "Moderate";
        } else {
          volatility = "Low";
        }
        
        // Performance compared to market
        const marketChange = {
          "short-term": marketData.data.quote[convert].total_market_cap_yesterday_percentage_change,
          "medium-term": marketData.data.quote[convert].total_market_cap_7d_percentage_change,
          "long-term": marketData.data.quote[convert].total_market_cap_30d_percentage_change
        };
        
        const relevantMarketChange = marketChange[timeInterval] || 0;
        const outperformingMarket = averageTrendScore > relevantMarketChange;
        
        // Compile analysis
        analyses.push({
          name: coin.name,
          symbol: coin.symbol,
          current_price: quote.price,
          market_cap: quote.market_cap,
          metrics: relevantWindows.reduce((acc, window) => {
            acc[window] = quote[window];
            return acc;
          }, {}),
          analysis: {
            trend_direction: trendDirection,
            volatility,
            outperforming_market: outperformingMarket,
            average_change: averageTrendScore,
            strength: averageTrendStrength
          },
          trend_summary: `${coin.name} is in a ${trendDirection.toLowerCase()} with ${volatility.toLowerCase()} volatility, ${outperformingMarket ? "outperforming" : "underperforming"} the overall market over this ${timeInterval}.`
        });
      }
      
      // Comparative analysis
      let topPerformer = null;
      let worstPerformer = null;
      
      if (analyses.length > 1) {
        analyses.sort((a, b) => {
          // Skip entries with errors
          if (a.error) return 1;
          if (b.error) return -1;
          
          return b.analysis.average_change - a.analysis.average_change;
        });
        
        // Only compare valid entries
        const validAnalyses = analyses.filter(a => !a.error);
        
        if (validAnalyses.length > 0) {
          topPerformer = validAnalyses[0];
          worstPerformer = validAnalyses[validAnalyses.length - 1];
        }
      }
      
      // Construct response
      const result = {
        timeInterval,
        market_trend: {
          relevant_market_change: relevantMarketChange,
          trend: relevantMarketChange > 5 ? "Strong Uptrend" :
                 relevantMarketChange > 1 ? "Moderate Uptrend" :
                 relevantMarketChange > -1 ? "Sideways/Neutral" :
                 relevantMarketChange > -5 ? "Moderate Downtrend" : "Strong Downtrend"
        },
        comparative_analysis: topPerformer && worstPerformer ? {
          top_performer: `${topPerformer.name} (${topPerformer.symbol}) with ${topPerformer.analysis.average_change.toFixed(2)}% average change`,
          worst_performer: `${worstPerformer.name} (${worstPerformer.symbol}) with ${worstPerformer.analysis.average_change.toFixed(2)}% average change`,
          relative_strength: `The difference between top and bottom performers is ${(topPerformer.analysis.average_change - worstPerformer.analysis.average_change).toFixed(2)}%`
        } : null,
        coin_analyses: analyses
      };
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error analyzing trends: ${error.message}` }],
        isError: true
      };
    }
  }
);


// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch(error => {
  console.error("Failed to start server:", error);
});
