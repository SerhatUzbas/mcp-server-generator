import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';
import https from 'https';

const server = new McpServer({
  name: 'Weather Server',
  version: '1.0.0',
  description: 'MCP server to fetch weather data from OpenWeatherMap API'
});

const agent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Validates that required environment variables are set
 * @returns {boolean} True if all required variables are set
 */
function validateEnvVars() {
  const required = ['OPENWEATHERMAP_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please set these in the Claude Desktop config.');
    return false;
  }
  return true;
}

/**
 * Fetch current weather data for a location
 */
server.tool(
  'getCurrentWeather',
  {
    location: z
      .string()
      .min(1)
      .describe(
        'City name, state code and country code divided by comma. Example: London,UK or New York,US'
      ),
    units: z
      .enum(['standard', 'metric', 'imperial'])
      .default('metric')
      .describe('Units of measurement. standard: Kelvin, metric: Celsius, imperial: Fahrenheit')
  },
  async ({ location, units }) => {
    // Validate environment variables
    if (!validateEnvVars()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: API key not configured. Please set OPENWEATHERMAP_API_KEY in the Claude Desktop config.'
          }
        ],
        isError: true
      };
    }

    try {
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
        location
      )}&units=${units}&appid=${apiKey}`;

      const response = await fetch(url, { agent });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching weather data: ${response.status} ${response.statusText}. ${errorData}`
            }
          ],
          isError: true
        };
      }

      const data = await response.json();

      // Format the response
      const formattedResponse = {
        location: `${data.name}, ${data.sys.country}`,
        weather: data.weather[0].description,
        temperature: {
          current: data.main.temp,
          feelsLike: data.main.feels_like,
          min: data.main.temp_min,
          max: data.main.temp_max,
          unit: units === 'metric' ? '°C' : units === 'imperial' ? '°F' : 'K'
        },
        humidity: `${data.main.humidity}%`,
        windSpeed: data.wind.speed + (units === 'imperial' ? ' mph' : ' m/s'),
        clouds: `${data.clouds.all}%`,
        timestamp: new Date(data.dt * 1000).toISOString()
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedResponse, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching weather data: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

/**
 * Fetch weather forecast for a location
 */
server.tool(
  'getWeatherForecast',
  {
    location: z
      .string()
      .min(1)
      .describe(
        'City name, state code and country code divided by comma. Example: London,UK or New York,US'
      ),
    units: z
      .enum(['standard', 'metric', 'imperial'])
      .default('metric')
      .describe('Units of measurement. standard: Kelvin, metric: Celsius, imperial: Fahrenheit'),
    days: z.number().int().min(1).max(5).default(3).describe('Number of forecast days (1-5)')
  },
  async ({ location, units, days }) => {
    // Validate environment variables
    if (!validateEnvVars()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: API key not configured. Please set OPENWEATHERMAP_API_KEY in the Claude Desktop config.'
          }
        ],
        isError: true
      };
    }

    try {
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
        location
      )}&units=${units}&appid=${apiKey}`;

      const response = await fetch(url, { agent });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching forecast data: ${response.status} ${response.statusText}. ${errorData}`
            }
          ],
          isError: true
        };
      }

      const data = await response.json();

      // Group forecast data by day
      const forecasts = data.list.reduce((acc, item) => {
        const date = new Date(item.dt * 1000);
        const day = date.toISOString().split('T')[0];

        if (!acc[day]) {
          acc[day] = [];
        }

        acc[day].push({
          time: date.toISOString(),
          temperature: item.main.temp,
          feelsLike: item.main.feels_like,
          description: item.weather[0].description,
          humidity: `${item.main.humidity}%`,
          windSpeed: item.wind.speed + (units === 'imperial' ? ' mph' : ' m/s')
        });

        return acc;
      }, {});

      // Convert to array and limit to requested number of days
      const dailyForecasts = Object.entries(forecasts)
        .map(([day, forecasts]) => ({
          day,
          forecasts,
          location: `${data.city.name}, ${data.city.country}`,
          temperatureUnit: units === 'metric' ? '°C' : units === 'imperial' ? '°F' : 'K'
        }))
        .slice(0, days);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(dailyForecasts, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching forecast data: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

/**
 * Search for a city to get the correct name format for weather queries
 */
server.tool(
  'searchCity',
  {
    query: z.string().min(1).describe('City name to search for, can be partial')
  },
  async ({ query }) => {
    // Validate environment variables
    if (!validateEnvVars()) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: API key not configured. Please set OPENWEATHERMAP_API_KEY in the Claude Desktop config.'
          }
        ],
        isError: true
      };
    }

    try {
      const apiKey = process.env.OPENWEATHERMAP_API_KEY;
      const limit = 5; // Limit results to 5 cities
      const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
        query
      )}&limit=${limit}&appid=${apiKey}`;

      const response = await fetch(url, { agent });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          content: [
            {
              type: 'text',
              text: `Error searching for city: ${response.status} ${response.statusText}. ${errorData}`
            }
          ],
          isError: true
        };
      }

      const data = await response.json();

      if (data.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No cities found matching "${query}". Try a different search term.`
            }
          ]
        };
      }

      // Format the response
      const cities = data.map((city) => ({
        name: city.name,
        state: city.state || '',
        country: city.country,
        formattedLocation: city.state
          ? `${city.name},${city.state},${city.country}`
          : `${city.name},${city.country}`,
        lat: city.lat,
        lon: city.lon
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cities, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching for city: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
