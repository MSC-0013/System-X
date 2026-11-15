FROM node:24-alpine
WORKDIR /app

# Install git for repository provenance checks
RUN apk add --no-cache git

# Install pnpm
RUN npm install -g pnpm@12

# Copy repository
COPY . .

# Install dependencies inside Linux container
RUN pnpm install --frozen-lockfile && pnpm build

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["node", "gate/server.js"]
