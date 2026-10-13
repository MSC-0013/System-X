FROM node:24-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@12

# Copy package descriptors first for optimal layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY packages ./packages

# Install dependencies inside Linux container
RUN pnpm install --no-frozen-lockfile

# Copy remaining application source code
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

# Launch unified dashboard server directly with tsx
CMD ["node", "--import", "tsx", "gate/server.ts"]
