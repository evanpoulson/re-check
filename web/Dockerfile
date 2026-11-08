# Recheck web: build the Vite app, then serve it with nginx, which also proxies /api to the API.
FROM node:24-bookworm-slim AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Call the real FastAPI backend; the mock service worker isn't loaded.
ENV VITE_USE_MOCKS=false
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 80
