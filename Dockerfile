# Node.js LTS with Debian
FROM node:20-bookworm-slim

# Set environment variables
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3000

# Install Chromium and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    libxss1 \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose web dashboard port
EXPOSE 3000

# Use dumb-init to properly handle signal termination in Docker
ENTRYPOINT ["dumb-init", "--"]

# Start Vitcha bot
CMD ["node", "index.js"]
