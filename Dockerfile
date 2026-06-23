# Use Apify's official Node.js Playwright image
FROM apify/actor-node-playwright-chrome:20

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed dependencies"

# Copy source code
COPY . ./

# Run the actor
CMD npm start
