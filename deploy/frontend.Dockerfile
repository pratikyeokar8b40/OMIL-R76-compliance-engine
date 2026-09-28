FROM node:22-alpine AS build
WORKDIR /app
# The frontend lives in "NAWI Frontend 7/" (the old frontend/ folder was
# removed); the JSON form of COPY is required for paths with spaces.
COPY ["NAWI Frontend 7/package.json", "NAWI Frontend 7/package-lock.json", "./"]
RUN npm ci
COPY ["NAWI Frontend 7/", "./"]
RUN npm run build

FROM nginx:1.27-alpine
# Built PWA assets + nginx config that proxies /api to the backend service.
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
