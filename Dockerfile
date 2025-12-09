# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (Vite)
# This creates the dist/ folder
RUN npm run build

# Production Stage
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built frontend assets from build stage
COPY --from=build /app/dist ./dist

# Copy backend server file
# Copy backend files
COPY server.js .
COPY services ./services

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start server
CMD ["npm", "run", "server"]
