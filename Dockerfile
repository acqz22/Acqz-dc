# Official Playwright image with Chromium + all deps pre-installed (2026 ready)
FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the project
COPY . .

# Build TypeScript
RUN npm run build

# Expose Render's default port
EXPOSE 10000

# Start the server
CMD ["npm", "start"]
