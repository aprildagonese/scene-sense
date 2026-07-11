FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# fontconfig + a font are required for sharp/librsvg to render the SVG text
# overlays; without them, all overlay text renders as missing-glyph boxes.
RUN apk add --no-cache ffmpeg fontconfig font-dejavu
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
