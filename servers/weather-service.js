import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Validate that the API key is present
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
if (!OPENWEATHER_API_KEY) {
  console.error(
    "Error: OPENWEATHER_API_KEY is required. Please add it to your .env file."
  );
  process.exit(1);
}

// Create an MCP server
const server = new McpServer({
  name: "Weather Service",
  version: "1.0.0",
  description: "A simple MCP server that provides current weather information",
});

// Tool to get current weather by city name
server.tool(
  "getCurrentWeather",
  {
    city: z.string().min(1).describe("The name of the city to get weather for"),
    units: z
      .enum(["metric", "imperial"])
      .default("metric")
      .describe("Temperature units (metric: Celsius, imperial: Fahrenheit)"),
  },
  async ({ city, units }) => {
    try {
      // Build the API URL with the provided parameters
      const url = new URL("https://api.openweathermap.org/data/2.5/weather");
      url.searchParams.append("q", city);
      url.searchParams.append("units", units);
      url.searchParams.append("appid", OPENWEATHER_API_KEY);

      // Make the API request
      const response = await fetch(url);

      // Check if the request was successful
      if (!response.ok) {
        const errorData = await response.json();
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                errorData.message || "Failed to fetch weather data"
              }`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response data
      const data = await response.json();

      // Format the weather information
      const formattedWeather = formatWeatherData(data, units);

      return {
        content: [{ type: "text", text: formattedWeather }],
      };
    } catch (error) {
      console.error("Error fetching weather data:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message || "An unexpected error occurred"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool to get weather forecast by city name
server.tool(
  "getForecast",
  {
    city: z
      .string()
      .min(1)
      .describe("The name of the city to get forecast for"),
    units: z
      .enum(["metric", "imperial"])
      .default("metric")
      .describe("Temperature units (metric: Celsius, imperial: Fahrenheit)"),
    days: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("Number of days for the forecast (1-5)"),
  },
  async ({ city, units, days }) => {
    try {
      // Build the API URL with the provided parameters
      const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
      url.searchParams.append("q", city);
      url.searchParams.append("units", units);
      url.searchParams.append("appid", OPENWEATHER_API_KEY);

      // Make the API request
      const response = await fetch(url);

      // Check if the request was successful
      if (!response.ok) {
        const errorData = await response.json();
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                errorData.message || "Failed to fetch forecast data"
              }`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response data
      const data = await response.json();

      // Format the forecast information
      const formattedForecast = formatForecastData(data, units, days);

      return {
        content: [{ type: "text", text: formattedForecast }],
      };
    } catch (error) {
      console.error("Error fetching forecast data:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message || "An unexpected error occurred"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Function to format current weather data
function formatWeatherData(data, units) {
  const tempUnit = units === "metric" ? "°C" : "°F";
  const windUnit = units === "metric" ? "m/s" : "mph";

  return `
Weather in ${data.name}, ${data.sys.country}
-------------------------------
Temperature: ${data.main.temp}${tempUnit} (feels like: ${
    data.main.feels_like
  }${tempUnit})
Conditions: ${data.weather[0].main} - ${data.weather[0].description}
Humidity: ${data.main.humidity}%
Wind: ${data.wind.speed} ${windUnit}
Pressure: ${data.main.pressure} hPa
Visibility: ${Math.round(data.visibility / 1000)} km
Sunrise: ${new Date(data.sys.sunrise * 1000).toLocaleTimeString()}
Sunset: ${new Date(data.sys.sunset * 1000).toLocaleTimeString()}
  `.trim();
}

// Function to format forecast data
function formatForecastData(data, units, days) {
  const tempUnit = units === "metric" ? "°C" : "°F";
  const windUnit = units === "metric" ? "m/s" : "mph";

  // OpenWeatherMap provides forecast in 3-hour steps
  // We'll pick one forecast per day (at noon)
  const forecastsByDay = {};
  const now = new Date();

  // Group forecasts by day
  data.list.forEach((forecast) => {
    const date = new Date(forecast.dt * 1000);
    const day = date.toISOString().split("T")[0]; // YYYY-MM-DD format

    // We prefer forecast around noon for each day
    const hour = date.getHours();
    if (
      !forecastsByDay[day] ||
      Math.abs(hour - 12) <
        Math.abs(new Date(forecastsByDay[day].dt * 1000).getHours() - 12)
    ) {
      forecastsByDay[day] = forecast;
    }
  });

  // Get days sorted by date
  const sortedDays = Object.keys(forecastsByDay).sort();

  // Limit to requested number of days
  const selectedDays = sortedDays.slice(0, days);

  // Format the forecast for each selected day
  let result = `Weather Forecast for ${data.city.name}, ${data.city.country}\n`;
  result += "=".repeat(result.length - 1) + "\n\n";

  selectedDays.forEach((day) => {
    const forecast = forecastsByDay[day];
    const date = new Date(forecast.dt * 1000);

    result += `${date.toDateString()}\n`;
    result += "-".repeat(date.toDateString().length) + "\n";
    result += `Conditions: ${forecast.weather[0].main} - ${forecast.weather[0].description}\n`;
    result += `Temperature: ${forecast.main.temp}${tempUnit} (min: ${forecast.main.temp_min}${tempUnit}, max: ${forecast.main.temp_max}${tempUnit})\n`;
    result += `Humidity: ${forecast.main.humidity}%\n`;
    result += `Wind: ${forecast.wind.speed} ${windUnit}\n`;
    result += `Pressure: ${forecast.main.pressure} hPa\n\n`;
  });

  return result.trim();
}

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
