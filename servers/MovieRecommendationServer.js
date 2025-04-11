
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize our movie database
const movieDatabase = [
  { id: 1, title: "The Shawshank Redemption", year: 1994, genre: ["Drama"], director: "Frank Darabont", rating: 9.3 },
  { id: 2, title: "The Godfather", year: 1972, genre: ["Crime", "Drama"], director: "Francis Ford Coppola", rating: 9.2 },
  { id: 3, title: "The Dark Knight", year: 2008, genre: ["Action", "Crime", "Drama"], director: "Christopher Nolan", rating: 9.0 },
  { id: 4, title: "Pulp Fiction", year: 1994, genre: ["Crime", "Drama"], director: "Quentin Tarantino", rating: 8.9 },
  { id: 5, title: "Fight Club", year: 1999, genre: ["Drama"], director: "David Fincher", rating: 8.8 },
  { id: 6, title: "Inception", year: 2010, genre: ["Action", "Adventure", "Sci-Fi"], director: "Christopher Nolan", rating: 8.8 },
  { id: 7, title: "The Matrix", year: 1999, genre: ["Action", "Sci-Fi"], director: "Lana and Lilly Wachowski", rating: 8.7 },
  { id: 8, title: "Goodfellas", year: 1990, genre: ["Biography", "Crime", "Drama"], director: "Martin Scorsese", rating: 8.7 },
  { id: 9, title: "The Lord of the Rings: The Fellowship of the Ring", year: 2001, genre: ["Adventure", "Drama", "Fantasy"], director: "Peter Jackson", rating: 8.8 },
  { id: 10, title: "Interstellar", year: 2014, genre: ["Adventure", "Drama", "Sci-Fi"], director: "Christopher Nolan", rating: 8.6 },
  { id: 11, title: "Parasite", year: 2019, genre: ["Drama", "Thriller"], director: "Bong Joon Ho", rating: 8.6 },
  { id: 12, title: "Whiplash", year: 2014, genre: ["Drama", "Music"], director: "Damien Chazelle", rating: 8.5 },
  { id: 13, title: "Spirited Away", year: 2001, genre: ["Animation", "Adventure", "Family"], director: "Hayao Miyazaki", rating: 8.6 },
  { id: 14, title: "The Silence of the Lambs", year: 1991, genre: ["Crime", "Drama", "Thriller"], director: "Jonathan Demme", rating: 8.6 },
  { id: 15, title: "The Grand Budapest Hotel", year: 2014, genre: ["Adventure", "Comedy", "Crime"], director: "Wes Anderson", rating: 8.1 },
  { id: 16, title: "Everything Everywhere All at Once", year: 2022, genre: ["Action", "Adventure", "Comedy", "Sci-Fi"], director: "Daniel Kwan and Daniel Scheinert", rating: 8.0 },
  { id: 17, title: "Get Out", year: 2017, genre: ["Horror", "Mystery", "Thriller"], director: "Jordan Peele", rating: 7.8 },
  { id: 18, title: "La La Land", year: 2016, genre: ["Comedy", "Drama", "Music", "Romance"], director: "Damien Chazelle", rating: 8.0 },
  { id: 19, title: "Mad Max: Fury Road", year: 2015, genre: ["Action", "Adventure", "Sci-Fi"], director: "George Miller", rating: 8.1 },
  { id: 20, title: "Dune", year: 2021, genre: ["Action", "Adventure", "Drama", "Sci-Fi"], director: "Denis Villeneuve", rating: 8.0 }
];

// Initialize the MCP server with metadata
const server = new McpServer({
  name: "MovieRecommendationServer",
  version: "1.0.0",
  description: "An MCP server that provides movie information and recommendations"
});

// Tool to list all available movies
server.tool(
  "listMovies",
  {
    limit: z.number().optional().describe("Maximum number of movies to return (defaults to 10)")
  },
  async ({ limit = 10 }) => {
    const movies = movieDatabase.slice(0, limit);
    const formattedMovies = movies.map(movie => 
      `${movie.title} (${movie.year}) - ${movie.genre.join(", ")} - Rating: ${movie.rating}/10`
    ).join("\\n");
    
    return {
      content: [{ 
        type: "text", 
        text: `Here are ${movies.length} movies from our database:\\n${formattedMovies}` 
      }]
    };
  }
);

// Tool to search for movies by title/keyword
server.tool(
  "searchMovies",
  {
    query: z.string().describe("Search term to find in movie titles")
  },
  async ({ query }) => {
    const searchTerm = query.toLowerCase();
    const results = movieDatabase.filter(movie => 
      movie.title.toLowerCase().includes(searchTerm)
    );
    
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No movies found matching "${query}".` }]
      };
    }
    
    const formattedResults = results.map(movie => 
      `${movie.title} (${movie.year}) - ${movie.genre.join(", ")} - Rating: ${movie.rating}/10`
    ).join("\\n");
    
    return {
      content: [{ 
        type: "text", 
        text: `Found ${results.length} movies matching "${query}":\\n${formattedResults}` 
      }]
    };
  }
);

// Tool to filter movies by genre
server.tool(
  "filterByGenre",
  {
    genre: z.string().describe("Genre to filter movies by")
  },
  async ({ genre }) => {
    const genreLower = genre.toLowerCase();
    const results = movieDatabase.filter(movie => 
      movie.genre.some(g => g.toLowerCase() === genreLower)
    );
    
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No movies found in the "${genre}" genre.` }]
      };
    }
    
    const formattedResults = results.map(movie => 
      `${movie.title} (${movie.year}) - ${movie.genre.join(", ")} - Rating: ${movie.rating}/10`
    ).join("\\n");
    
    return {
      content: [{ 
        type: "text", 
        text: `Found ${results.length} movies in the "${genre}" genre:\\n${formattedResults}` 
      }]
    };
  }
);

// Tool to get detailed information about a specific movie
server.tool(
  "getMovieDetails",
  {
    title: z.string().describe("Title of the movie to get details for")
  },
  async ({ title }) => {
    const titleLower = title.toLowerCase();
    const movie = movieDatabase.find(m => 
      m.title.toLowerCase().includes(titleLower)
    );
    
    if (!movie) {
      return {
        content: [{ type: "text", text: `No movie found with title containing "${title}".` }]
      };
    }
    
    return {
      content: [{ 
        type: "text", 
        text: `Movie Details:\\n
Title: ${movie.title}
Year: ${movie.year}
Genre: ${movie.genre.join(", ")}
Director: ${movie.director}
Rating: ${movie.rating}/10`
      }]
    };
  }
);

// Tool to recommend movies based on preferences
server.tool(
  "recommendMovies",
  {
    genre: z.string().optional().describe("Preferred genre"),
    year: z.number().optional().describe("Preferred year or decade"),
    director: z.string().optional().describe("Preferred director"),
    minRating: z.number().optional().describe("Minimum rating threshold")
  },
  async ({ genre, year, director, minRating = 8.0 }) => {
    let recommendations = [...movieDatabase];
    
    if (genre) {
      const genreLower = genre.toLowerCase();
      recommendations = recommendations.filter(movie => 
        movie.genre.some(g => g.toLowerCase().includes(genreLower))
      );
    }
    
    if (year) {
      // If user specifies a decade (like 1990), find movies from that decade
      if (year % 10 === 0) {
        recommendations = recommendations.filter(movie => 
          movie.year >= year && movie.year < year + 10
        );
      } else {
        recommendations = recommendations.filter(movie => movie.year === year);
      }
    }
    
    if (director) {
      const directorLower = director.toLowerCase();
      recommendations = recommendations.filter(movie => 
        movie.director.toLowerCase().includes(directorLower)
      );
    }
    
    recommendations = recommendations.filter(movie => movie.rating >= minRating);
    
    // Sort by rating (highest first)
    recommendations.sort((a, b) => b.rating - a.rating);
    
    if (recommendations.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: "No movies match your preferences. Try broadening your criteria." 
        }]
      };
    }
    
    const formattedRecommendations = recommendations.map(movie => 
      `${movie.title} (${movie.year}) - ${movie.genre.join(", ")} - Rating: ${movie.rating}/10`
    ).join("\\n");
    
    return {
      content: [{ 
        type: "text", 
        text: `Based on your preferences, here are ${recommendations.length} recommended movies:\\n${formattedRecommendations}` 
      }]
    };
  }
);

// Connect the server to the stdio transport
const transport = new StdioServerTransport();
server.connect(transport);
